/**
 * The key-paste leg of the login screen (and the setup entry's key-paste
 * fallback): VERIFY a pasted API key before accepting it. The key IS the session
 * credential — there is no mint step as on the form/SSO/claim legs — so
 * verification is one authenticated call carrying the pasted key against the
 * cheapest authed route, `GET /api/auth/me`. A live key answers 200 and signs in;
 * a refused key answers 401 and surfaces a loud inline error without ever reaching
 * the auth store or a navigation.
 *
 * The probe rides a one-shot client bound to the PASTED key through the documented
 * token-binding factory, so the shell's in-memory credential is never written for
 * an unverified key, and the probe's own 401 is handled here rather than tripping
 * the global unauthorized bounce.
 */
import { ApiUnauthorizedError, createApiClient } from '@tai42/api-client';
import { useApi, useAuth } from '@tai42/studio-sdk';
import { useState } from 'react';

import { GENERIC_ERROR } from './login-methods';

/** The inline copy for a key the server refused on the identity probe. */
export const INVALID_KEY_ERROR = 'That API key was not accepted. Check it and try again.';

export function useKeyLogin({
  remember,
  onError,
}: {
  /** The live "remember on this device" opt-in, passed to `login` on a verified key. */
  remember: boolean;
  /** Set the screen's login error, or clear it with `null` on a fresh submit. */
  onError: (message: string | null) => void;
}): {
  submitting: boolean;
  submitKey: (key: string) => Promise<void>;
} {
  const api = useApi();
  const { login } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  async function submitKey(key: string): Promise<void> {
    const trimmed = key.trim();
    if (trimmed === '') return;
    setSubmitting(true);
    onError(null);
    try {
      // Bind a one-shot client to the pasted key and probe the cheapest authed
      // route — same base URL as the shell's client, default `fetch` (the shell
      // customizes neither in production).
      const verifier = createApiClient({ getToken: () => trimmed, baseUrl: api.baseUrl });
      await verifier.getMe();
      login(trimmed, remember);
    } catch (error) {
      if (error instanceof ApiUnauthorizedError) onError(INVALID_KEY_ERROR);
      else {
        onError(GENERIC_ERROR);
        console.error(error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return { submitting, submitKey };
}
