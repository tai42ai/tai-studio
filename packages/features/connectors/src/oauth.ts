/**
 * The OAuth flow hooks — the load-bearing security surface of the connectors feature.
 *
 * A `startConnect` / `reconnect` / consent-requiring `patchSubServices` call may
 * return an `authorize_url`. The PRIMARY path opens it in a popup, then waits for the
 * deployment's static callback page to `postMessage` the provider's `code` + `state`
 * back to us; that message is UNTRUSTED until origin + source + type all match (the
 * trust check lives in {@link watchOAuthPopup}). The FALLBACK path handles a blocked
 * popup by redirecting the whole tab to `authorize_url`; the callback page forwards the
 * result on the URL to the stashed return path, and {@link useOAuthRedirectResume}
 * finishes the same authed exchange on arrival. Once a trusted message (or a resume)
 * lands, the flow finishes exactly once and every listener/timer is torn down (also on
 * unmount).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi, isSafeHttpUrl } from '@tai42/studio-sdk';
import type { FleetReportSummary } from '@tai42/api-client';
import { useQueryClient } from '@tanstack/react-query';

import {
  OAUTH_REDIRECT_STORAGE_KEY,
  OAUTH_RESUME_PARAMS,
  applyCompletion,
  currentReturnPath,
  openOAuthWindow,
  watchOAuthPopup,
} from './oauth-callback';
import type { OAuthCallbackMessage, OAuthNotice } from './oauth-callback';

export {
  OAUTH_MESSAGE_TYPE,
  OAUTH_REDIRECT_STORAGE_KEY,
  OAUTH_RESUME_PARAMS,
} from './oauth-callback';
export type { OAuthNotice } from './oauth-callback';

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

export function useOAuthPopup(options: UseOAuthPopupOptions = {}): UseOAuthPopupResult {
  const { onSuccess } = options;
  const api = useApi();
  const queryClient = useQueryClient();

  const [notice, setNotice] = useState<OAuthNotice | null>(null);
  const [pending, setPending] = useState(false);

  /** Tears down the current flow's listener + interval; replaced on each `start`. */
  const teardownRef = useRef<(() => void) | null>(null);

  const teardown = useCallback(() => {
    teardownRef.current?.();
    teardownRef.current = null;
  }, []);

  const start = useCallback(
    (authorizeUrl: string) => {
      // A previous flow (if any) is abandoned cleanly before a new one begins.
      teardown();
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

      const popup = openOAuthWindow(authorizeUrl);
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

      teardownRef.current = watchOAuthPopup(popup, {
        onMessage: finalize,
        onClosed: () => {
          // Popup closed before any trusted message arrived => the user cancelled.
          settle({ kind: 'cancelled', message: 'Sign-in cancelled.' });
        },
      });
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
