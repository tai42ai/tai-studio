/**
 * STANDALONE OAuth bridge relay — the multi-tenant deployable artifact.
 *
 * Runs on a shared bridge origin that many deployments register as their fixed
 * OAuth `redirect_uri`. It recovers the originating deployment origin from the
 * signed `state` and forwards the popup — query string intact — to that origin's
 * oauth-callback.html.
 *
 * SECURITY — anchored-root allow-list: the `o` (origin) claim is read from
 * `state` WITHOUT verifying the HMAC (the destination re-verifies it and the
 * single-use flow_id). By then the OAuth `code` is already being forwarded, so the
 * routing target MUST be validated against a FULLY-ANCHORED allow-list — an
 * unvalidated bounce is an open redirect carrying a live OAuth code. This variant
 * accepts only `https://<slug>.<root>` (or the exact root) where `<root>` is a
 * build-time constant; `endsWith("tai42.ai")` would also match `eviltai42.ai`, and
 * an unanchored slug would match `tai42.ai.evil.com` — both are rejected here.
 *
 * The state-parsing (b64url → JSON `{o}`) MIRRORS the SPA-shipped
 * public/oauth-bridge.js; keep the two in sync. This file differs ONLY in the
 * allow-list (anchored root vs. exact same-origin).
 *
 * `state` wire format (from the skeleton): base64url(json({f, o})) + "." + hmac.
 */

/** The operator's root domain, baked at build time. */
const ALLOWED_ROOT = import.meta.env.VITE_BRIDGE_ALLOWED_ROOT ?? 'tai42.ai';

function fail(text: string): void {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
}

function b64urlToString(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  b64 += '==='.slice((b64.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function readOrigin(state: string): string | null {
  const dot = state.indexOf('.');
  if (dot <= 0) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(b64urlToString(state.slice(0, dot)));
  } catch {
    return null;
  }
  if (obj !== null && typeof obj === 'object' && typeof (obj as { o?: unknown }).o === 'string') {
    return (obj as { o: string }).o;
  }
  return null;
}

/** Accept ONLY `https://<slug>.<root>` or the exact `https://<root>` (anchored). */
export function isAllowedTarget(origin: string, root: string = ALLOWED_ROOT): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  // Reject anything with a path/query/credentials — a bare origin only.
  if (url.origin !== origin) return false;
  const host = url.hostname;
  if (host === root) return true;
  const anchored = new RegExp(`^[a-z0-9-]+\\.${root.replace(/\./g, '\\.')}$`);
  return anchored.test(host);
}

function main(): void {
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state');
  const origin = state ? readOrigin(state) : null;

  if (origin === null || !isAllowedTarget(origin)) {
    fail(
      'This sign-in link is invalid or was issued for an unrecognized deployment. Close this window and try again.',
    );
    return;
  }

  window.location.replace(origin + '/oauth-callback.html' + window.location.search);
}

main();
