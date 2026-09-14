/**
 * The login screen's method model: the fetch-state type, the visibility/ordering
 * rules for the metadata-declared sign-in methods, the URL-fragment claim-token
 * reader, and the copy + shared styles the screen and its method views share.
 */
import type { CSSProperties } from 'react';
import type { LoginMethod, LoginMethods } from '@tai42/api-client';

export const GENERIC_ERROR = 'Something went wrong signing in. Please try again.';

export const SIGN_OUT_NOTICE = 'Signed out on this device; the server session may still be active.';

export type MethodsState =
  { status: 'loading' } | { status: 'ready'; data: LoginMethods } | { status: 'failed' };

export const sectionStyle: CSSProperties = { marginTop: 'var(--tai-space-5)' };
export const errorStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  color: 'var(--tai-color-danger)',
};

/** Whether a form method should render given the deployment/URL context:
 * `login` forms always; `bootstrap` only when the deployment has no accounts
 * yet; `invite` only when the login URL carries an invite token. */
function isFormVisible(
  purpose: 'login' | 'bootstrap' | 'invite',
  bootstrap: boolean,
  inviteToken: string | undefined,
): boolean {
  if (purpose === 'bootstrap') return bootstrap;
  if (purpose === 'invite') return inviteToken !== undefined && inviteToken !== '';
  return true;
}

function rank(m: LoginMethod): number {
  return m.shape === 'form' && m.purpose === 'bootstrap' ? 0 : 1;
}

/** Visible methods with the bootstrap owner-creation form pulled to the front. */
export function visibleMethods(data: LoginMethods, inviteToken: string | undefined): LoginMethod[] {
  const shown = data.methods.filter(
    (m) => m.shape === 'button' || isFormVisible(m.purpose, data.bootstrap, inviteToken),
  );
  return [...shown].sort((a, b) => rank(a) - rank(b));
}

/**
 * The one-time claim token carried in the URL FRAGMENT (`#claim=<token>`), or
 * `null` when absent. It rides the fragment on purpose — a fragment is never sent
 * to the server as part of a request URL, so the token is not logged by proxies or
 * access logs, and it is stripped from the address the instant it is read.
 */
export function readClaimToken(): string | null {
  const hash = window.location.hash;
  if (hash === '' || hash === '#') return null;
  const token = new URLSearchParams(hash.slice(1)).get('claim');
  return token !== null && token !== '' ? token : null;
}
