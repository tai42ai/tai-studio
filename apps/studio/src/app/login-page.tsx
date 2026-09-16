/**
 * The credential screen. It renders the deployment's sign-in methods from
 * METADATA (`GET /api/login/methods`) — exactly two shapes, `form` and `button`
 * — around the permanent key-paste fallback. When no accounts plugin is
 * installed the methods list is empty and the screen is exactly the key-paste
 * form: the operator pastes a full-privilege API key provisioned on the
 * skeleton. The key/session token is held IN MEMORY by default; an explicit
 * "remember on this device" opt-in persists it to sessionStorage (never
 * localStorage — the SDK `useAuth` owns that policy; this screen only calls
 * `login`).
 *
 * On authentication the screen navigates to `returnTo` — the location the
 * operator originally requested (the returnTo pin) — defaulting to `/`, where the
 * capability-gated landing route resolves the actual destination. The navigate
 * runs from an effect keyed on `isAuthenticated`, so the router's injected auth
 * context has already flipped before the guarded destination re-evaluates.
 *
 * Method discovery, the SSO hand-back, and the claim hand-off run in dedicated
 * hooks; the method/notice/key-paste views are their own components. The renderer
 * HARDENS the metadata it consumes: a method's target must be a same-origin
 * relative `/api/` path (checked in the method view) or it renders a loud error
 * card instead of a credential-leaking off-origin request.
 */
import { Card, Checkbox, useAuth, useTheme } from '@tai42/studio-sdk';
import { useNavigate } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { KeyPasteForm, LoginNotices, MethodView } from './login-method-view';
import { SIGN_OUT_NOTICE, visibleMethods } from './login-methods';
import { SetupEntry } from './setup-entry';
import { SIGN_OUT_NOTICE_KEY } from './sign-out-notice';
import { useClaimLogin } from './use-claim-login';
import { useLoginForm } from './use-login-form';
import { useLoginMethods } from './use-login-methods';
import { useSsoExchange } from './use-sso-exchange';

export function LoginPage({
  returnTo,
  ssoCode,
  inviteToken,
}: {
  returnTo: string;
  ssoCode?: string;
  inviteToken?: string;
}): ReactNode {
  const { login, isAuthenticated } = useAuth();
  const { theme } = useTheme();
  const navigate = useNavigate();
  // The brand mark, matched to the active theme: the light mark's gradient runs to
  // near-black and is illegible on the dark card ground, so dark theme takes the
  // dark variant.
  const brandMark = theme === 'dark' ? '/tai42-logo-icon-dark.png' : '/tai42-logo-icon.png';
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  // Mirror the live `remember` state into a ref every render, so the SSO exchange's
  // success path honors the checkbox as it stands AT EXCHANGE COMPLETION.
  const rememberRef = useRef(remember);
  rememberRef.current = remember;
  const [loginError, setLoginError] = useState<string | null>(null);
  const [keyPasteOpen, setKeyPasteOpen] = useState(false);
  // A non-blocking notice threaded from a failed sign-out revoke: read the one-shot
  // flag once and clear it so the notice shows exactly once, never on a later visit.
  const [signOutNotice, setSignOutNotice] = useState<string | null>(null);

  const methods = useLoginMethods();
  const { formValues, setFieldValue, submitting, submitForm } = useLoginForm({
    inviteToken,
    remember,
    onError: setLoginError,
  });
  useSsoExchange({ ssoCode, rememberRef, onError: setLoginError });
  const claiming = useClaimLogin({
    onError: setLoginError,
    onFailure: () => {
      setKeyPasteOpen(true);
    },
  });

  useEffect(() => {
    try {
      if (globalThis.sessionStorage.getItem(SIGN_OUT_NOTICE_KEY) !== null) {
        globalThis.sessionStorage.removeItem(SIGN_OUT_NOTICE_KEY);
        setSignOutNotice(SIGN_OUT_NOTICE);
      }
    } catch {
      // Storage unavailable — there is simply no notice to surface.
    }
  }, []);

  useEffect(() => {
    // `returnTo` is a full internal href (may carry a `?search`), so navigate by
    // `href` — `{ to }` treats the string as a pathname template and would drop
    // the query. It is origin-checked upstream.
    if (isAuthenticated) void navigate({ href: returnTo });
  }, [isAuthenticated, navigate, returnTo]);

  const shown = methods.status === 'ready' ? visibleMethods(methods.data, inviteToken) : [];
  const hasMethods = shown.length > 0;
  const keyPasteExpanded = !hasMethods || keyPasteOpen;

  return (
    <main
      style={{
        minHeight: '100%',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--tai-space-6)',
      }}
    >
      <Card style={{ width: 'min(28rem, 100%)' }}>
        <img
          src={brandMark}
          alt=""
          width={40}
          height={40}
          style={{ display: 'block', borderRadius: 'var(--tai-radius-tile)' }}
        />

        {methods.status === 'ready' && methods.data.needs_setup ? (
          <SetupEntry
            setupLogin={methods.data.setup_login}
            remember={remember}
            onRememberChange={setRemember}
            keyValue={key}
            onKeyChange={setKey}
            keyPasteOpen={keyPasteOpen}
            onKeyPasteOpen={() => {
              setKeyPasteOpen(true);
            }}
          />
        ) : (
          <>
            <h1 style={{ margin: 'var(--tai-space-4) 0 0' }}>Sign in to the Studio</h1>

            <LoginNotices
              methods={methods}
              loginError={loginError}
              signOutNotice={signOutNotice}
              claiming={claiming}
            />

            {shown.map((method) => (
              <MethodView
                key={method.id}
                method={method}
                submitting={submitting === method.id}
                values={formValues[method.id] ?? {}}
                onFieldChange={(name, value) => {
                  setFieldValue(method.id, name, value);
                }}
                onSubmit={() => {
                  if (method.shape === 'form') void submitForm(method);
                }}
              />
            ))}

            <div style={{ marginTop: 'var(--tai-space-4)' }}>
              <Checkbox
                label="Remember on this device (this browser session)"
                checked={remember}
                onCheckedChange={setRemember}
              />
            </div>

            <KeyPasteForm
              hasMethods={hasMethods}
              expanded={keyPasteExpanded}
              keyValue={key}
              onKeyChange={setKey}
              onOpen={() => {
                setKeyPasteOpen(true);
              }}
              onSubmit={() => {
                const trimmed = key.trim();
                if (trimmed === '') return;
                login(trimmed, remember);
              }}
            />
          </>
        )}
      </Card>
    </main>
  );
}
