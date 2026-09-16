/**
 * The setup entry's state machine: the token step, the revealed owner form, and
 * the single `POST /api/setup` submit. The token is NEVER sent before the owner
 * form is submitted — "Continue" is pure client-side progressive disclosure, so a
 * wrong token surfaces only as the submit's inline error. A refused/throttled
 * token, an already-initialized deployment, an unsupported door, or an invalid
 * body maps to per-status copy; any other failure surfaces loudly (the generic
 * message plus the logged diagnostic).
 */
import { ApiSetupFailedError, type SetupBody, type SetupResult } from '@tai42/api-client';
import { useApi } from '@tai42/studio-sdk';
import { useState } from 'react';

import { GENERIC_ERROR, SETUP_COPY, SETUP_PASSWORD_MIN } from './login-methods';

/** The login-credential kinds the setup door can attach, or `null`/absent for a
 * keys-only deployment (no login-attaching accounts provider). */
export type SetupLogin = { readonly kinds: readonly ('password' | 'invite')[] } | null | undefined;

/** How the owner's login is attached at setup, when a provider allows one. */
export type LoginChoice = 'password' | 'invite';

/** An inline setup error: the copy to show, and whether a "Reload" affordance is
 * offered (only the already-initialized 409). */
export interface SetupError {
  readonly message: string;
  readonly canReload: boolean;
}

export interface SetupForm {
  readonly token: string;
  setToken: (value: string) => void;
  readonly revealed: boolean;
  reveal: () => void;
  changeToken: () => void;
  readonly displayName: string;
  setDisplayName: (value: string) => void;
  readonly email: string;
  setEmail: (value: string) => void;
  readonly loginChoice: LoginChoice;
  setLoginChoice: (value: LoginChoice) => void;
  readonly password: string;
  setPassword: (value: string) => void;
  /** Whether the deployment attaches an interactive login at setup. */
  readonly attachesLogin: boolean;
  readonly canReveal: boolean;
  readonly canSubmit: boolean;
  readonly submitting: boolean;
  readonly error: SetupError | null;
  readonly result: SetupResult | null;
  submit: () => Promise<void>;
}

/** Map a setup-door status onto the inline copy the entry renders. */
function errorFor(status: number): SetupError {
  if (status === 403) return { message: SETUP_COPY.errorBadToken, canReload: false };
  if (status === 429) return { message: SETUP_COPY.errorThrottled, canReload: false };
  if (status === 409) return { message: SETUP_COPY.errorConflict, canReload: true };
  if (status === 501) return { message: SETUP_COPY.errorUnsupported, canReload: false };
  return { message: GENERIC_ERROR, canReload: false };
}

export function useSetupForm(setupLogin: SetupLogin): SetupForm {
  const api = useApi();
  const attachesLogin = setupLogin != null;
  const kinds = setupLogin?.kinds ?? [];
  const [token, setToken] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [loginChoice, setLoginChoice] = useState<LoginChoice>(
    kinds.includes('password') ? 'password' : 'invite',
  );
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<SetupError | null>(null);
  const [result, setResult] = useState<SetupResult | null>(null);

  const canReveal = token.trim() !== '';
  const loginFilled =
    !attachesLogin ||
    (email.trim() !== '' && (loginChoice !== 'password' || password.length >= SETUP_PASSWORD_MIN));
  const canSubmit = displayName.trim() !== '' && loginFilled;

  function reveal(): void {
    if (canReveal) setRevealed(true);
  }

  function changeToken(): void {
    setRevealed(false);
  }

  function buildLogin(): SetupBody['login'] {
    if (!attachesLogin) return undefined;
    if (loginChoice === 'invite') return { kind: 'invite', email: email.trim() };
    return { kind: 'password', email: email.trim(), password };
  }

  async function submit(): Promise<void> {
    const login = buildLogin();
    const body: SetupBody =
      login === undefined
        ? { setup_token: token.trim(), owner_display_name: displayName.trim() }
        : { setup_token: token.trim(), owner_display_name: displayName.trim(), login };
    setSubmitting(true);
    setError(null);
    try {
      setResult(await api.submitSetup(body));
    } catch (caught) {
      if (caught instanceof ApiSetupFailedError) setError(errorFor(caught.status));
      else {
        setError({ message: GENERIC_ERROR, canReload: false });
        console.error(caught);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return {
    token,
    setToken,
    revealed,
    reveal,
    changeToken,
    displayName,
    setDisplayName,
    email,
    setEmail,
    loginChoice,
    setLoginChoice,
    password,
    setPassword,
    attachesLogin,
    canReveal,
    canSubmit,
    submitting,
    error,
    result,
    submit,
  };
}
