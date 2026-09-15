/**
 * The presentational pieces of the login screen: one rendered sign-in method
 * (`MethodView`) with its invalid-target guard (`InvalidMethod`), the status/error
 * notices (`LoginNotices`), and the permanent API-key paste fallback (`KeyPasteForm`).
 * All state and effects live in `LoginPage`; these are pure views over its props.
 */
import { isSafeApiPath, type LoginMethod } from '@tai42/api-client';
import { Button, Field, Spinner, TextInput } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { errorStyle, type MethodsState, sectionStyle } from './login-methods';

/** One rendered login method — a `form` (fields + submit) or a `button`
 * (full-page-navigation anchor). An invalid `/api/` target renders a loud inline
 * error card naming the method id; the other methods still render. */
export function MethodView({
  method,
  submitting,
  values,
  onFieldChange,
  onSubmit,
}: {
  method: LoginMethod;
  submitting: boolean;
  values: Record<string, string>;
  onFieldChange: (name: string, value: string) => void;
  onSubmit: () => void;
}): ReactNode {
  if (method.shape === 'button') {
    if (!isSafeApiPath(method.href)) return <InvalidMethod id={method.id} />;
    return (
      <div style={sectionStyle}>
        {/* A full-page navigation — the OIDC flow leaves the SPA — so the Button
            link variant renders a plain same-origin anchor for this `/api/` path,
            not a router link. */}
        <Button href={method.href} variant="secondary">
          {method.icon !== undefined ? (
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(method.icon)}`}
              width={16}
              height={16}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          {method.label}
        </Button>
      </div>
    );
  }

  if (!isSafeApiPath(method.submit_path)) return <InvalidMethod id={method.id} />;
  return (
    <form
      style={sectionStyle}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h2 style={{ margin: '0 0 var(--tai-space-3)' }}>{method.title}</h2>
      {method.fields.map((field) => (
        <div key={field.name} style={{ marginTop: 'var(--tai-space-3)' }}>
          <Field label={field.label}>
            <TextInput
              type={field.secret ? 'password' : 'text'}
              autoComplete={field.autocomplete ?? 'off'}
              value={values[field.name] ?? ''}
              onChange={(event) => {
                onFieldChange(field.name, event.target.value);
              }}
              aria-label={field.label}
            />
          </Field>
        </div>
      ))}
      <div style={{ marginTop: 'var(--tai-space-4)' }}>
        <Button type="submit" variant="primary" disabled={submitting}>
          {method.title}
        </Button>
      </div>
    </form>
  );
}

function InvalidMethod({ id }: { id: string }): ReactNode {
  return (
    <p role="alert" style={{ ...sectionStyle, color: 'var(--tai-color-danger)' }}>
      Sign-in method &quot;{id}&quot; declares an invalid target.
    </p>
  );
}

/**
 * The status/error notices above the methods: the bootstrap owner-creation hint, the
 * login error, the one-shot sign-out notice, the claim-in-flight spinner, and the
 * methods-discovery loading/failed states.
 */
export function LoginNotices({
  methods,
  loginError,
  signOutNotice,
  claiming,
}: {
  methods: MethodsState;
  loginError: string | null;
  signOutNotice: string | null;
  claiming: boolean;
}): ReactNode {
  return (
    <>
      {methods.status === 'ready' && methods.data.bootstrap ? (
        <p
          role="status"
          style={{ color: 'var(--tai-color-text-muted)', marginTop: 'var(--tai-space-2)' }}
        >
          No accounts exist yet — create the admin account.
        </p>
      ) : null}

      {loginError !== null ? (
        <p role="alert" style={errorStyle}>
          {loginError}
        </p>
      ) : null}

      {signOutNotice !== null ? (
        <p
          role="status"
          style={{ margin: '0 0 var(--tai-space-3)', color: 'var(--tai-color-text-muted)' }}
        >
          {signOutNotice}
        </p>
      ) : null}

      {claiming ? (
        <div style={{ marginTop: 'var(--tai-space-4)' }}>
          <Spinner label="Signing you in…" />
        </div>
      ) : null}

      {methods.status === 'loading' ? (
        <div style={{ marginTop: 'var(--tai-space-4)' }}>
          <Spinner label="Loading sign-in methods" />
        </div>
      ) : null}

      {methods.status === 'failed' ? (
        <p role="alert" style={errorStyle}>
          Could not load sign-in methods — you can still sign in with an API key.
        </p>
      ) : null}
    </>
  );
}

/**
 * The permanent API-key paste fallback. It is the whole screen when no methods are
 * declared, and an opt-in "Use an API key instead" affordance otherwise. The key is
 * full-privilege; `onSubmit` trims and signs in.
 */
export function KeyPasteForm({
  hasMethods,
  expanded,
  keyValue,
  onKeyChange,
  onOpen,
  onSubmit,
}: {
  hasMethods: boolean;
  expanded: boolean;
  keyValue: string;
  onKeyChange: (value: string) => void;
  onOpen: () => void;
  onSubmit: () => void;
}): ReactNode {
  return (
    <>
      {hasMethods && !expanded ? (
        <div style={{ marginTop: 'var(--tai-space-4)' }}>
          <Button type="button" variant="secondary" onClick={onOpen}>
            Use an API key instead
          </Button>
        </div>
      ) : null}

      {expanded ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          style={sectionStyle}
        >
          <p style={{ color: 'var(--tai-color-text-muted)', marginTop: 0 }}>
            Paste your deployment API key. It is full-privilege, including tool execution — treat it
            like a password. The first key is provisioned by the deployment; once signed in you can
            provision more keys — full-privilege or scoped — from the API-keys settings tab.
          </p>
          <Field label="API key">
            <TextInput
              type="password"
              autoComplete="off"
              value={keyValue}
              onChange={(event) => {
                onKeyChange(event.target.value);
              }}
              placeholder="Paste your API key"
              aria-label="API key"
            />
          </Field>
          <div style={{ marginTop: 'var(--tai-space-4)' }}>
            <Button type="submit" variant="primary" disabled={keyValue.trim() === ''}>
              Sign in
            </Button>
          </div>
        </form>
      ) : null}
    </>
  );
}
