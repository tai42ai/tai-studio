/**
 * The OAuth flow — the load-bearing security surface of the connectors feature.
 *
 * A `startConnect` / `reconnect` / consent-requiring `patchSubServices` call may
 * return an `authorize_url`. The PRIMARY path opens it in a popup, then waits for the
 * deployment's static callback page (`oauth-callback.html`) to `postMessage` the
 * provider's `code` + `state` back to us. That message is UNTRUSTED until proven
 * otherwise: a message is acted on ONLY when its origin is our own origin, its source
 * is the exact popup we opened, and its `type` is the fixed callback discriminator.
 * Any message failing ANY check is ignored — never acted on.
 *
 * The FALLBACK path handles a browser that blocks the popup: instead of a hard stop,
 * the whole tab redirects to `authorize_url`, and the provider round-trips back to the
 * callback page in this same tab. With no opener to `postMessage`, the callback page
 * forwards the `code` + `state` on the URL to the return path this module stashed
 * before redirecting, and {@link useOAuthRedirectResume} finishes the same authed
 * exchange on arrival. The signed-state guarantees are identical to the popup path;
 * only the delivery channel differs (same tab, no opener).
 *
 * Once a trusted message (or a resume) lands, the flow finishes exactly once:
 * `api.completeOAuth` decides success/failed/cancelled, the popup is closed, the
 * connections query is invalidated, and the message listener + poll interval are torn
 * down. The teardown also runs on unmount, so no listener or timer outlives the
 * component.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi, isSafeHttpUrl } from '@tai42/studio-sdk';
import {
  summarizeFleetFanout,
  type FleetReportSummary,
  type OAuthCompleteResult,
} from '@tai42/api-client';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';

import { CONNECTIONS_KEY } from './keys';

/** The FIXED postMessage discriminator the callback page sends. */
export const OAUTH_MESSAGE_TYPE = 'tai:oauth:callback';

/**
 * The `sessionStorage` key the popup-blocked fallback stashes the in-app return path
 * under, so the callback page (which cannot decode the HMAC-signed `state`, and so
 * cannot recover the server-side `return_url`) knows where to forward the provider's
 * result. The callback page reads this exact key — keep the two in sync.
 */
export const OAUTH_REDIRECT_STORAGE_KEY = 'tai:oauth:redirect-return';

/**
 * The query-parameter names the callback page appends to the return path when it
 * forwards a redirect-flow result. Read by {@link useOAuthRedirectResume} on arrival.
 * The callback page writes these exact names — keep the two in sync.
 */
export const OAUTH_RESUME_PARAMS = {
  state: 'tai_oauth_state',
  code: 'tai_oauth_code',
  error: 'tai_oauth_error',
} as const;

const POPUP_NAME = 'tai-oauth';
const POPUP_FEATURES = 'popup,width=520,height=640';
const POLL_INTERVAL_MS = 400;

/** The trusted payload shape carried by an `OAUTH_MESSAGE_TYPE` message. */
interface OAuthCallbackMessage {
  readonly type: typeof OAUTH_MESSAGE_TYPE;
  readonly code: string | null;
  readonly state: string | null;
  readonly error: string | null;
}

/** The outcome surfaced to the operator after a flow settles. */
export type OAuthNotice =
  | { readonly kind: 'success'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'cancelled'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

export interface UseOAuthPopupOptions {
  /**
   * Runs after a `success` outcome, in addition to the always-run `['connections']`
   * invalidation, receiving the completion's settled {@link FleetReportSummary} (or
   * `null` when it mutated no manifest). The consumer decides what to render and
   * whether to close/navigate — a non-converged broadcast rides an honest FleetReport
   * rather than a silent close.
   */
  readonly onSuccess?: (fleet: FleetReportSummary | null) => void;
}

export interface UseOAuthPopupResult {
  /** Open the popup for `authorizeUrl` and begin watching for the callback. */
  readonly start: (authorizeUrl: string) => void;
  /** The settled outcome of the last flow, or `null` while none has settled. */
  readonly notice: OAuthNotice | null;
  /** Dismiss the current notice. */
  readonly clearNotice: () => void;
  /** True from `start` until the flow settles (popup open / awaiting completion). */
  readonly pending: boolean;
}

/** Is `v` a string or explicitly null (the callback fields' allowed shape)? */
function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

/**
 * Read a trusted callback payload from an untrusted `event.data`, or `null` when
 * the shape does not match. The `type` discriminator plus string|null fields are
 * all validated — a malformed message is treated as untrusted and ignored.
 */
function readCallback(data: unknown): OAuthCallbackMessage | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.type !== OAUTH_MESSAGE_TYPE) return null;
  const { code, state, error } = record;
  if (!isStringOrNull(code) || !isStringOrNull(state) || !isStringOrNull(error)) return null;
  return { type: OAUTH_MESSAGE_TYPE, code, state, error };
}

/**
 * Apply a settled `completeOAuth` result to the shared side effects and return the
 * notice to surface (or `null` when a non-converged fleet suppresses the bare success
 * notice in favour of the caller's own FleetReport). Shared by the popup and the
 * redirect-resume paths so both settle a completion identically.
 */
function applyCompletion(
  result: OAuthCompleteResult,
  queryClient: QueryClient,
  onSuccess: ((fleet: FleetReportSummary | null) => void) | undefined,
): OAuthNotice | null {
  switch (result.kind) {
    case 'success': {
      void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      // The completion writes the manifest and broadcasts a reload. The settled fleet
      // summary is handed to the consumer so a non-converged broadcast stays visible
      // as its own honest FleetReport (never a silent close); only a converged
      // completion confirms success in a notice.
      const fleet = summarizeFleetFanout(result.fanout);
      onSuccess?.(fleet);
      if (fleet !== null && fleet.status !== 'converged') return null;
      return { kind: 'success', message: 'Connected successfully.' };
    }
    case 'failed':
      return { kind: 'failed', message: result.reason };
    case 'cancelled':
      return { kind: 'cancelled', message: result.message };
  }
}

/** The in-app path the popup-blocked fallback returns to (route + current query). */
function currentReturnPath(): string {
  return window.location.pathname + window.location.search;
}

export function useOAuthPopup(options: UseOAuthPopupOptions = {}): UseOAuthPopupResult {
  const { onSuccess } = options;
  const api = useApi();
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<OAuthNotice | null>(null);
  const [pending, setPending] = useState(false);

  /** Tears down the current flow's listener + interval; replaced on each `start`. */
  const teardownRef = useRef<(() => void) | null>(null);
  /** Guards single-result handling per flow (message AND close race the same flow). */
  const handledRef = useRef(false);

  const teardown = useCallback(() => {
    teardownRef.current?.();
    teardownRef.current = null;
  }, []);

  const start = useCallback(
    (authorizeUrl: string) => {
      // A previous flow (if any) is abandoned cleanly before a new one begins.
      teardown();
      handledRef.current = false;
      setNotice(null);

      // The authorize URL is provider-supplied and untrusted: a `javascript:` or
      // `data:` value handed to window.open (or a full-page redirect) would execute
      // in this app's origin, so only an http(s) URL is ever navigated to — anything
      // else is refused loudly.
      if (!isSafeHttpUrl(authorizeUrl)) {
        setNotice({
          kind: 'error',
          message:
            'The provider returned an invalid authorization URL (must be an http or https link).',
        });
        return;
      }

      const popup = window.open(authorizeUrl, POPUP_NAME, POPUP_FEATURES);
      if (popup === null) {
        // Popup blocked — fall back to a full-page redirect. Stash where to resume so
        // the callback page can forward the provider's result back into the app; the
        // same signed-state single-use guarantees hold, only the channel differs.
        try {
          window.sessionStorage.setItem(OAUTH_REDIRECT_STORAGE_KEY, currentReturnPath());
        } catch {
          // Storage is disabled (private mode / policy): the redirect still runs, and
          // the callback page falls back to an honest "return to the app" instruction
          // rather than a silent forward. No secret is lost — the code never left the
          // provider yet.
        }
        window.location.assign(authorizeUrl);
        return;
      }

      setPending(true);

      const settle = (next: OAuthNotice | null): void => {
        teardown();
        setPending(false);
        setNotice(next);
      };

      const finalize = (message: OAuthCallbackMessage): void => {
        const { code, state, error } = message;
        if (state === null) {
          // A trusted callback with no state cannot be completed — surface loudly.
          popup.close();
          settle({ kind: 'error', message: 'OAuth callback was missing its state token.' });
          return;
        }
        api
          .completeOAuth(state, code ?? '', error ?? undefined)
          .then((result) => {
            popup.close();
            settle(applyCompletion(result, queryClient, onSuccess));
          })
          .catch((err: unknown) => {
            popup.close();
            settle({
              kind: 'error',
              message: err instanceof Error ? err.message : 'Failed to complete sign-in.',
            });
          });
      };

      const handleMessage = (event: MessageEvent): void => {
        if (handledRef.current) return;
        // Trust ONLY when origin + source + type all match. Any failure => ignore.
        if (event.origin !== window.location.origin) return;
        if (event.source !== popup) return;
        const message = readCallback(event.data);
        if (message === null) return;
        handledRef.current = true;
        finalize(message);
      };

      const interval = window.setInterval(() => {
        if (handledRef.current) return;
        if (!popup.closed) return;
        // Popup closed before any trusted message arrived => the user cancelled.
        handledRef.current = true;
        settle({ kind: 'cancelled', message: 'Sign-in cancelled.' });
      }, POLL_INTERVAL_MS);

      window.addEventListener('message', handleMessage);
      teardownRef.current = () => {
        window.removeEventListener('message', handleMessage);
        window.clearInterval(interval);
      };
    },
    [api, queryClient, onSuccess, teardown],
  );

  const clearNotice = useCallback(() => {
    setNotice(null);
  }, []);

  // Tear down any live flow when the consuming component unmounts (no leaks).
  useEffect(() => teardown, [teardown]);

  return { start, notice, clearNotice, pending };
}

/** The callback page's forwarded result, read from the return path's query string. */
interface ResumeParams {
  readonly state: string | null;
  readonly code: string | null;
  readonly error: string | null;
}

export interface UseOAuthRedirectResumeResult {
  /** The settled outcome of a resumed redirect flow, or `null` when none ran. */
  readonly notice: OAuthNotice | null;
  /** Dismiss the current notice. */
  readonly clearNotice: () => void;
  /** True while the resumed completion is in flight. */
  readonly pending: boolean;
}

/**
 * Complete a popup-blocked redirect flow when the page loads at its return path with
 * the callback page's forwarded `code` + `state` on the URL. The authed exchange runs
 * here (this window holds the session token), the connections query is invalidated,
 * and the forwarded parameters are stripped from the URL so a reload never re-fires a
 * single-use state. Runs at most once per mount; a page without the parameters is a
 * no-op, so every connectors mount can call it unconditionally.
 */
export function useOAuthRedirectResume(
  options: UseOAuthPopupOptions = {},
): UseOAuthRedirectResumeResult {
  const { onSuccess } = options;
  const api = useApi();
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<OAuthNotice | null>(null);
  const [pending, setPending] = useState(false);
  // Captured once on first render: a later router-driven URL normalisation must not
  // race the read away before the effect runs.
  const paramsRef = useRef<ResumeParams | null>(null);
  if (paramsRef.current === null) {
    const search = new URLSearchParams(window.location.search);
    paramsRef.current = {
      state: search.get(OAUTH_RESUME_PARAMS.state),
      code: search.get(OAUTH_RESUME_PARAMS.code),
      error: search.get(OAUTH_RESUME_PARAMS.error),
    };
  }
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    const params = paramsRef.current;
    if (params?.state == null) return;
    startedRef.current = true;

    // Strip the forwarded parameters immediately: a single-use state must never
    // survive a reload, and the stashed return marker has served its purpose.
    const url = new URL(window.location.href);
    url.searchParams.delete(OAUTH_RESUME_PARAMS.state);
    url.searchParams.delete(OAUTH_RESUME_PARAMS.code);
    url.searchParams.delete(OAUTH_RESUME_PARAMS.error);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    try {
      window.sessionStorage.removeItem(OAUTH_REDIRECT_STORAGE_KEY);
    } catch {
      // Storage unavailable — nothing to clear.
    }

    setPending(true);
    api
      .completeOAuth(params.state, params.code ?? '', params.error ?? undefined)
      .then((result) => {
        setPending(false);
        setNotice(applyCompletion(result, queryClient, onSuccess));
      })
      .catch((err: unknown) => {
        setPending(false);
        setNotice({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to complete sign-in.',
        });
      });
  }, [api, queryClient, onSuccess]);

  const clearNotice = useCallback(() => {
    setNotice(null);
  }, []);

  return { notice, clearNotice, pending };
}
