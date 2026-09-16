/**
 * The `needs_setup` setup entry: a token step whose "Continue" reveals the owner
 * form client-side (no probe — the token is sent only with the single
 * `POST /api/setup` submit), and the once-shown success view that signs the
 * operator in as the new owner. All state lives in {@link useSetupForm}; this file
 * is the view plus its focus wiring. The key-paste fallback stays reachable below
 * the entry, and vanishes only on the success view where the key is shown once.
 */
import type { SetupResult } from '@tai42/api-client';
import {
  Button,
  Checkbox,
  CopyField,
  Field,
  RadioGroup,
  Spinner,
  TextInput,
  useAuth,
} from '@tai42/studio-sdk';
import { type ReactNode, type RefObject, useEffect, useRef } from 'react';

import { KeyPasteForm } from './login-method-view';
import { errorStyle, SETUP_COPY } from './login-methods';
import { type LoginChoice, type SetupForm, type SetupLogin, useSetupForm } from './use-setup-form';

export function SetupEntry({
  setupLogin,
  remember,
  onRememberChange,
  keyValue,
  onKeyChange,
  keyPasteOpen,
  onKeyPasteOpen,
}: {
  setupLogin: SetupLogin;
  remember: boolean;
  onRememberChange: (value: boolean) => void;
  keyValue: string;
  onKeyChange: (value: string) => void;
  keyPasteOpen: boolean;
  onKeyPasteOpen: () => void;
}): ReactNode {
  const { login } = useAuth();
  const form = useSetupForm(setupLogin);
  const tokenRef = useRef<HTMLInputElement>(null);
  const displayNameRef = useRef<HTMLInputElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (form.revealed) displayNameRef.current?.focus();
    else tokenRef.current?.focus();
  }, [form.revealed]);

  useEffect(() => {
    if (form.error !== null) alertRef.current?.focus();
  }, [form.error]);

  if (form.result !== null) {
    const key = form.result.api_key;
    return (
      <SetupSuccess
        result={form.result}
        displayName={form.displayName.trim()}
        email={form.email.trim()}
        onContinue={() => {
          login(key, remember);
        }}
      />
    );
  }

  return (
    <>
      <h1 style={{ margin: 'var(--tai-space-4) 0 0' }}>{SETUP_COPY.heading}</h1>
      <p style={{ color: 'var(--tai-color-text-muted)', marginTop: 'var(--tai-space-2)' }}>
        {SETUP_COPY.lead}
      </p>

      {form.revealed ? (
        <OwnerForm
          form={form}
          setupLogin={setupLogin}
          remember={remember}
          onRememberChange={onRememberChange}
          displayNameRef={displayNameRef}
          alertRef={alertRef}
          onChangeToken={form.changeToken}
        />
      ) : (
        <form
          aria-label={SETUP_COPY.tokenLabel}
          style={{ marginTop: 'var(--tai-space-4)' }}
          onSubmit={(event) => {
            event.preventDefault();
            form.reveal();
          }}
        >
          <Field label={SETUP_COPY.tokenLabel} description={SETUP_COPY.tokenHelp}>
            <TextInput
              ref={tokenRef}
              type="password"
              autoComplete="off"
              value={form.token}
              onChange={(event) => {
                form.setToken(event.target.value);
              }}
            />
          </Field>
          <div style={{ marginTop: 'var(--tai-space-4)' }}>
            <Button type="submit" variant="primary" disabled={!form.canReveal}>
              {SETUP_COPY.continue}
            </Button>
          </div>
        </form>
      )}

      <KeyPasteForm
        hasMethods
        expanded={keyPasteOpen}
        keyValue={keyValue}
        onKeyChange={onKeyChange}
        onOpen={onKeyPasteOpen}
        onSubmit={() => {
          const trimmed = keyValue.trim();
          if (trimmed === '') return;
          login(trimmed, remember);
        }}
      />
    </>
  );
}

function OwnerForm({
  form,
  setupLogin,
  remember,
  onRememberChange,
  displayNameRef,
  alertRef,
  onChangeToken,
}: {
  form: SetupForm;
  setupLogin: SetupLogin;
  remember: boolean;
  onRememberChange: (value: boolean) => void;
  displayNameRef: RefObject<HTMLInputElement | null>;
  alertRef: RefObject<HTMLParagraphElement | null>;
  onChangeToken: () => void;
}): ReactNode {
  return (
    <form
      aria-label={SETUP_COPY.ownerFormLabel}
      style={{ marginTop: 'var(--tai-space-5)' }}
      onSubmit={(event) => {
        event.preventDefault();
        if (!form.canSubmit || form.submitting) return;
        void form.submit();
      }}
    >
      <Field label={SETUP_COPY.displayNameLabel} description={SETUP_COPY.displayNameHelp}>
        <TextInput
          ref={displayNameRef}
          type="text"
          autoComplete="name"
          value={form.displayName}
          onChange={(event) => {
            form.setDisplayName(event.target.value);
          }}
        />
      </Field>

      {form.attachesLogin ? (
        <OwnerLoginFields form={form} setupLogin={setupLogin} />
      ) : (
        <p style={{ color: 'var(--tai-color-text-muted)', marginTop: 'var(--tai-space-3)' }}>
          {SETUP_COPY.noProviderNote}
        </p>
      )}

      <div style={{ marginTop: 'var(--tai-space-4)' }}>
        <Checkbox
          label={SETUP_COPY.rememberLabel}
          checked={remember}
          onCheckedChange={onRememberChange}
        />
      </div>

      {form.error !== null ? (
        <div style={{ marginTop: 'var(--tai-space-4)' }}>
          <p ref={alertRef} role="alert" tabIndex={-1} style={{ ...errorStyle, marginBottom: 0 }}>
            {form.error.message}
          </p>
          {form.error.canReload ? (
            <div style={{ marginTop: 'var(--tai-space-3)' }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  window.location.reload();
                }}
              >
                {SETUP_COPY.reload}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: 'var(--tai-space-4)', display: 'flex', gap: 'var(--tai-space-3)' }}>
        <Button type="submit" variant="primary" disabled={!form.canSubmit || form.submitting}>
          {form.submitting ? <Spinner label={SETUP_COPY.creating} /> : SETUP_COPY.createOwner}
        </Button>
        <Button type="button" variant="secondary" onClick={onChangeToken}>
          {SETUP_COPY.changeToken}
        </Button>
      </div>
    </form>
  );
}

function OwnerLoginFields({
  form,
  setupLogin,
}: {
  form: SetupForm;
  setupLogin: SetupLogin;
}): ReactNode {
  const kinds = setupLogin?.kinds ?? [];
  const options: { value: LoginChoice; label: string }[] = [];
  if (kinds.includes('password')) {
    options.push({ value: 'password', label: SETUP_COPY.passwordOption });
  }
  if (kinds.includes('invite')) {
    options.push({ value: 'invite', label: SETUP_COPY.inviteOption });
  }

  return (
    <>
      <div style={{ marginTop: 'var(--tai-space-3)' }}>
        <Field label={SETUP_COPY.emailLabel}>
          <TextInput
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => {
              form.setEmail(event.target.value);
            }}
          />
        </Field>
      </div>

      <div style={{ marginTop: 'var(--tai-space-4)' }}>
        <RadioGroup
          label={SETUP_COPY.ownerLoginLabel}
          options={options}
          value={form.loginChoice}
          onValueChange={(value) => {
            form.setLoginChoice(value as LoginChoice);
          }}
        />
      </div>

      {form.loginChoice === 'password' ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <Field label={SETUP_COPY.passwordLabel} description={SETUP_COPY.passwordHelp}>
            <TextInput
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => {
                form.setPassword(event.target.value);
              }}
            />
          </Field>
        </div>
      ) : null}
    </>
  );
}

function SetupSuccess({
  result,
  displayName,
  email,
  onContinue,
}: {
  result: SetupResult;
  displayName: string;
  email: string;
  onContinue: () => void;
}): ReactNode {
  const inviteLink =
    result.invite_token != null && result.login_path != null
      ? `${window.location.origin}${result.login_path}?invite=${result.invite_token}`
      : null;

  return (
    <>
      <h1 style={{ margin: 'var(--tai-space-4) 0 0' }}>{SETUP_COPY.successHeading}</h1>
      <p style={{ marginTop: 'var(--tai-space-3)' }}>Signed-in owner: {displayName}</p>

      <div style={{ marginTop: 'var(--tai-space-4)' }}>
        <CopyField idPrefix="setup-api-key" label={SETUP_COPY.keyLabel} value={result.api_key} />
      </div>
      <p
        role="status"
        style={{ marginTop: 'var(--tai-space-2)', color: 'var(--tai-color-danger)' }}
      >
        {SETUP_COPY.keyWarning}
      </p>

      {inviteLink !== null ? (
        <div style={{ marginTop: 'var(--tai-space-4)' }}>
          <CopyField
            idPrefix="setup-invite-link"
            label={SETUP_COPY.inviteLinkLabel}
            value={inviteLink}
            caption={SETUP_COPY.inviteLinkHelp}
          />
        </div>
      ) : null}

      {result.login_attached ? (
        <p style={{ marginTop: 'var(--tai-space-3)', color: 'var(--tai-color-text-muted)' }}>
          Password set for {email}.
        </p>
      ) : null}

      <div style={{ marginTop: 'var(--tai-space-5)' }}>
        <Button type="button" variant="primary" onClick={onContinue}>
          {SETUP_COPY.continueToStudio}
        </Button>
      </div>
    </>
  );
}
