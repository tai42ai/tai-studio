/**
 * The OAuth callback channel: the fixed postMessage/redirect contract with the
 * deployment's static callback page, the trust check over an untrusted message, the
 * shared completion side effects, and the popup open/watch primitives. A message is
 * acted on ONLY when its origin, source, and type all match.
 */
import { summarizeFleetFanout } from '@tai42/api-client';
import type { FleetReportSummary, OAuthCompleteResult } from '@tai42/api-client';
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
 * forwards a redirect-flow result. The callback page writes these exact names — keep
 * the two in sync.
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
export interface OAuthCallbackMessage {
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

/** Is `v` a string or explicitly null (the callback fields' allowed shape)? */
function isStringOrNull(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}

/**
 * Read a trusted callback payload from an untrusted `event.data`, or `null` when
 * the shape does not match. The `type` discriminator plus string|null fields are
 * all validated — a malformed message is treated as untrusted and ignored.
 */
export function readCallback(data: unknown): OAuthCallbackMessage | null {
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
export function applyCompletion(
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
export function currentReturnPath(): string {
  return window.location.pathname + window.location.search;
}

/** Open the OAuth popup for `authorizeUrl`, or `null` when the browser blocks it. */
export function openOAuthWindow(authorizeUrl: string): Window | null {
  return window.open(authorizeUrl, POPUP_NAME, POPUP_FEATURES);
}

export interface OAuthPopupWatch {
  /** A TRUSTED callback message (origin + source + type all matched). */
  readonly onMessage: (message: OAuthCallbackMessage) => void;
  /** The popup closed before any trusted message arrived (the user cancelled). */
  readonly onClosed: () => void;
}

/**
 * Watch an opened popup for the callback: dispatch a TRUSTED message to `onMessage`
 * (a message is trusted only when its origin is our own, its source is this popup, and
 * its type is the fixed discriminator — any failure is ignored), or `onClosed` when the
 * popup closes with no message. Fires at most once. Returns the teardown that removes
 * the listener and clears the poll (also safe to call on unmount).
 */
export function watchOAuthPopup(
  popup: Window,
  { onMessage, onClosed }: OAuthPopupWatch,
): () => void {
  // Guards single-result handling per flow (message AND close race the same flow).
  let handled = false;

  const handleMessage = (event: MessageEvent): void => {
    if (handled) return;
    if (event.origin !== window.location.origin) return;
    if (event.source !== popup) return;
    const message = readCallback(event.data);
    if (message === null) return;
    handled = true;
    onMessage(message);
  };

  const interval = window.setInterval(() => {
    if (handled) return;
    if (!popup.closed) return;
    handled = true;
    onClosed();
  }, POLL_INTERVAL_MS);

  window.addEventListener('message', handleMessage);
  return () => {
    window.removeEventListener('message', handleMessage);
    window.clearInterval(interval);
  };
}
