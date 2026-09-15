/** Public sign-in aggregator and session-logout sub-clients. */
import { ApiError, ApiLoginFailedError, ApiUnauthorizedError } from '../errors';
import * as s from '../schemas';
import type { Transport } from './transport';

/**
 * Whether a login-method target is a safe same-origin relative API path. The
 * login screen is the one page where a misconfigured/compromised manifest could
 * redirect CREDENTIALS off-origin, so a `submit_path`/`href` MUST start `/api/`
 * — anything else (absolute URL, protocol-relative `//host`, missing prefix) is
 * rejected. The `/api/` prefix already excludes `//`-prefixed values; the
 * explicit double-slash clause is kept for readability.
 */
export function isSafeApiPath(path: string): boolean {
  return path.startsWith('/api/') && !path.startsWith('//');
}

/**
 * Map a transport error from a login submission onto an `ApiLoginFailedError`
 * (rendered inline on the login page) or rethrow it unchanged (5xx, schema
 * drift, network — the page's generic failure branch surfaces it loudly).
 *
 * A transport 401 arrives as `ApiUnauthorizedError` before any body is read, so
 * its message is generic by construction; the domain 4xx statuses carry the
 * server's informative envelope text (rate-limit, bootstrap-already-initialized,
 * password-policy, or the claim exchange's uniform "unknown or already used"
 * 404) straight through to the inline surface.
 */
function asLoginError(error: unknown): never {
  if (error instanceof ApiUnauthorizedError) {
    throw new ApiLoginFailedError('Sign-in failed — check your credentials.', 401);
  }
  if (
    error instanceof ApiError &&
    (error.status === 400 ||
      error.status === 403 ||
      error.status === 404 ||
      error.status === 409 ||
      error.status === 422 ||
      error.status === 429)
  ) {
    throw new ApiLoginFailedError(error.message, error.status);
  }
  throw error;
}

export function loginClient(t: Transport) {
  const { req } = t;
  return {
    // PUBLIC by design: `apiRequest` attaches `x-api-key` only when a token
    // exists, so the unauthenticated call carries no auth header — no transport
    // change needed.
    getLoginMethods: (options?: { signal?: AbortSignal }) =>
      req('/api/login/methods', s.loginMethods, { signal: options?.signal }),
    // Submit a `form` method's field VALUES as a flat top-level JSON body (the
    // server's request models take the declared field names top-level). `path`
    // is re-checked with the same relative-`/api/` guard the renderer uses — an
    // off-origin path is a PROGRAMMING error (loud `Error`), not a login failure.
    // A refused credential becomes an inline `ApiLoginFailedError`.
    submitLoginForm: async (path: string, values: Record<string, string>) => {
      if (!isSafeApiPath(path)) {
        throw new Error(
          `login submit_path must be a relative /api/ path; received ${JSON.stringify(path)}`,
        );
      }
      try {
        return await req(path, s.loginResult, { method: 'POST', body: values });
      } catch (error) {
        return asLoginError(error);
      }
    },
    // Exchange a one-time SSO hand-back code for a session (never a token in the
    // URL). An expired/reused code is a login failure, surfaced inline.
    exchangeSsoCode: async (code: string) => {
      try {
        return await req('/api/login/sso/exchange', s.loginResult, {
          method: 'POST',
          body: { code },
        });
      } catch (error) {
        return asLoginError(error);
      }
    },
    // Exchange a one-time claim token (read from the login URL fragment, never a
    // query param) for a session. PUBLIC. The token is single-use and burns
    // server-side; a used/unknown/expired token answers the uniform 404, which —
    // like the SSO leg — maps to an inline `ApiLoginFailedError`, not a global
    // unauthorized redirect. The caller latches the exchange so it fires once.
    claimLogin: async (body: { token: string }) => {
      try {
        return await req('/api/login/claim', s.loginResult, { method: 'POST', body });
      } catch (error) {
        return asLoginError(error);
      }
    },
  };
}

export function logoutClient(t: Transport) {
  const { req } = t;
  return {
    // The single authed logout dispatcher — revokes the caller's accounts
    // session server-side before the shell clears local state. A plain `sk-` key
    // has nothing to revoke and answers 404 (surfaced as an `ApiError`, quiet at
    // the call site); a 5xx/network failure is a real revoke failure the shell
    // surfaces loudly.
    logout: () => req('/api/auth/logout', s.logoutResult, { method: 'POST' }),
  };
}
