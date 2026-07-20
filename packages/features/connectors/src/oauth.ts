/**
 * The OAuth popup flow — the load-bearing security surface of the
 * connectors feature.
 *
 * A `startConnect` / `reconnect` / consent-requiring `patchSubServices` call may
 * return an `authorize_url`. We open it in a popup, then wait for the deployment's
 * static callback page (`oauth-callback.html`) to `postMessage` the provider's
 * `code` + `state` back to us. That message is UNTRUSTED until proven otherwise:
 * a message is acted on ONLY when its origin is our own origin, its source is the
 * exact popup we opened, and its `type` is the fixed callback discriminator. Any
 * message failing ANY check is ignored — never acted on.
 *
 * Once a trusted message lands (or the popup closes with none), the flow finishes
 * exactly once: `api.completeOAuth` decides success/failed/cancelled, the popup is
 * closed, the connections query is invalidated, and the message listener + poll
 * interval are torn down. The teardown also runs on unmount, so no listener or
 * timer outlives the component.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi, isSafeHttpUrl } from '@tai42/studio-sdk';
import { summarizeFleetFanout, type FleetReportSummary } from '@tai42/api-client';
import { useQueryClient } from '@tanstack/react-query';

import { CONNECTIONS_KEY } from './keys';

/** The FIXED postMessage discriminator the callback page sends. */
export const OAUTH_MESSAGE_TYPE = 'tai:oauth:callback';

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
      // `data:` value handed to window.open would execute in this app's origin, so
      // only an http(s) URL is ever opened — anything else is refused loudly.
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
        setNotice({
          kind: 'error',
          message: 'Popup blocked — allow popups for this site and retry.',
        });
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
            switch (result.kind) {
              case 'success': {
                void queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
                // The completion writes the manifest and broadcasts a reload. The
                // settled fleet summary is handed to the consumer so a non-converged
                // broadcast stays visible as its own honest FleetReport (never a silent
                // close); only a converged completion confirms success in a notice.
                const fleet = summarizeFleetFanout(result.fanout);
                onSuccess?.(fleet);
                if (fleet !== null && fleet.status !== 'converged') {
                  settle(null);
                  return;
                }
                settle({ kind: 'success', message: 'Connected successfully.' });
                return;
              }
              case 'failed': {
                settle({ kind: 'failed', message: result.reason });
                return;
              }
              case 'cancelled': {
                settle({ kind: 'cancelled', message: result.message });
                return;
              }
            }
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
