/**
 * The login screen's method model: the fetch-state type, the visibility rules
 * for the metadata-declared sign-in methods, the URL-fragment claim-token reader,
 * and the copy + shared styles the screen and its method views share.
 */
import type { LoginMethod, LoginMethods } from '@tai42/api-client';
import type { CSSProperties } from 'react';

export const GENERIC_ERROR = 'Something went wrong signing in. Please try again.';

export const SIGN_OUT_NOTICE = 'Signed out on this device; the server session may still be active.';

export type MethodsState =
  { status: 'loading' } | { status: 'ready'; data: LoginMethods } | { status: 'failed' };

export const sectionStyle: CSSProperties = { marginTop: 'var(--tai-space-5)' };
export const errorStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  color: 'var(--tai-color-danger)',
};

/** The fixed copy of the `needs_setup` setup entry — heading, field labels, help
 * text, button labels, and the per-status error lines the setup submit renders
 * inline. Centralized so the flow's view and its tests read one source. */
export const SETUP_COPY = {
  heading: 'Set up this deployment',
  lead: 'No owner exists yet. Enter the setup token from the server log to create the owner and the first key.',
  tokenLabel: 'Setup token',
  tokenHelp: 'Printed once at server start (or set with TAI_SETUP_TOKEN).',
  continue: 'Continue',
  ownerFormLabel: 'Create the owner',
  displayNameLabel: 'Display name',
  displayNameHelp: 'How the owner appears in the Studio.',
  emailLabel: 'Email',
  ownerLoginLabel: 'Owner login',
  passwordOption: 'Set a password now',
  inviteOption: 'Send me an invite link',
  passwordLabel: 'Password',
  passwordHelp: 'At least 10 characters.',
  noProviderNote: 'This deployment has no accounts provider; sign in with the key you receive.',
  createOwner: 'Create owner and key',
  changeToken: 'Change token',
  creating: 'Creating…',
  rememberLabel: 'Remember on this device (this browser session)',
  successHeading: 'Deployment set up',
  keyLabel: 'Owner API key',
  keyWarning: 'Shown once — store it now. It cannot be retrieved again.',
  inviteLinkLabel: 'Invite link',
  inviteLinkHelp: "One-time link to set the owner's password later.",
  continueToStudio: 'Continue to the Studio',
  reload: 'Reload',
  errorBadToken:
    'The setup token was not accepted. Check the server log for the current token and try again.',
  errorThrottled: 'Too many attempts. Wait a minute and try again.',
  errorConflict: 'Someone already set up this deployment. Reload to sign in.',
  errorUnsupported:
    'Setup is unavailable on this server: access control is off or no key-minting identity provider is configured.',
} as const;

/** The owner's minimum password length when a password login is attached at setup. */
export const SETUP_PASSWORD_MIN = 10;

/** Whether a form method should render given the deployment/URL context:
 * `login` forms always; `invite` only when the login URL carries an invite token. */
function isFormVisible(purpose: 'login' | 'invite', inviteToken: string | undefined): boolean {
  if (purpose === 'invite') return inviteToken !== undefined && inviteToken !== '';
  return true;
}

/** The sign-in methods to render when the deployment is already initialized:
 * every `button` method, `login` forms, and an `invite` form only when the login
 * URL carries an invite token. */
export function visibleMethods(data: LoginMethods, inviteToken: string | undefined): LoginMethod[] {
  return data.methods.filter((m) => m.shape === 'button' || isFormVisible(m.purpose, inviteToken));
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
