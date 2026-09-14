/**
 * A one-shot sessionStorage flag written when a sign-out's server-side revoke FAILS
 * (5xx/network): local sign-out still proceeds, but the server session may not have
 * been revoked. The login page reads it once, clears it, and surfaces a non-blocking
 * inline notice. Shared by the writer (sign-out) and the reader (the login screen).
 */
export const SIGN_OUT_NOTICE_KEY = 'tai-studio.signout-notice';
