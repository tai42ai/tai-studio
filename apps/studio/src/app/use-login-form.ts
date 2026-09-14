/**
 * The metadata-form leg of the login screen: per-method field values and the
 * form POST. `submitForm` posts a FLAT body (the invite token merged in for an
 * invite form), signs in with the minted token, and surfaces a failure loudly.
 */
import { useState } from 'react';
import { useApi, useAuth } from '@tai42/studio-sdk';
import { ApiLoginFailedError, type LoginMethod } from '@tai42/api-client';

import { GENERIC_ERROR } from './login-methods';

export function useLoginForm({
  inviteToken,
  remember,
  onError,
}: {
  inviteToken?: string;
  /** The live "remember on this device" opt-in, passed to `login` on a successful submit. */
  remember: boolean;
  /** Set the screen's login error, or clear it with `null` on a fresh submit. */
  onError: (message: string | null) => void;
}): {
  formValues: Record<string, Record<string, string>>;
  setFieldValue: (methodId: string, name: string, value: string) => void;
  submitting: string | null;
  submitForm: (method: Extract<LoginMethod, { shape: 'form' }>) => Promise<void>;
} {
  const api = useApi();
  const { login } = useAuth();
  const [formValues, setFormValues] = useState<Record<string, Record<string, string>>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);

  function setFieldValue(methodId: string, name: string, value: string): void {
    setFormValues((prev) => ({ ...prev, [methodId]: { ...prev[methodId], [name]: value } }));
  }

  async function submitForm(method: Extract<LoginMethod, { shape: 'form' }>): Promise<void> {
    const current = formValues[method.id] ?? {};
    const values: Record<string, string> = {};
    for (const field of method.fields) values[field.name] = current[field.name] ?? '';
    // The invite token rides the flat body top-level, where the server's accept
    // route reads `invite_token`.
    if (method.purpose === 'invite' && inviteToken !== undefined) {
      values.invite_token = inviteToken;
    }
    setSubmitting(method.id);
    onError(null);
    try {
      const result = await api.submitLoginForm(method.submit_path, values);
      login(result.token, remember);
    } catch (error) {
      if (error instanceof ApiLoginFailedError) onError(error.message);
      else {
        onError(GENERIC_ERROR);
        console.error(error);
      }
    } finally {
      setSubmitting(null);
    }
  }

  return { formValues, setFieldValue, submitting, submitForm };
}
