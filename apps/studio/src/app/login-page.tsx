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
 * operator originally requested (the returnTo pin) — defaulting to `/tools`. The
 * navigate runs from an effect keyed on `isAuthenticated`, not inline in a
 * submit handler, so the router's injected auth context has already flipped to
 * authenticated before the guarded destination re-evaluates its `beforeLoad`.
 *
 * The renderer HARDENS the metadata it consumes: a method's target must be a
 * same-origin relative `/api/` path (`isSafeApiPath`) or it renders a loud error
 * card instead of a credential-leaking off-origin request, and a button `icon`
 * (SVG markup) renders inside an `<img>` data-URI — which executes no scripts —
 * never `dangerouslySetInnerHTML`.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  Button,
  Card,
  Checkbox,
  Field,
  Spinner,
  TextInput,
  useApi,
  useAuth,
} from '@tai42/studio-sdk';
import {
  ApiLoginFailedError,
  isSafeApiPath,
  type LoginMethod,
  type LoginMethods,
} from '@tai42/api-client';

const GENERIC_ERROR = 'Something went wrong signing in. Please try again.';

/**
 * A one-shot sessionStorage flag the shell writes when a sign-out's server-side
 * revoke FAILS (5xx/network): local sign-out still proceeds, but the server session
 * may not have been revoked. The login page reads it once, clears it, and surfaces a
 * non-blocking inline notice. Shared with `shell-layout` (the writer).
 */
export const SIGN_OUT_NOTICE_KEY = 'tai-studio.signout-notice';

const SIGN_OUT_NOTICE = 'Signed out on this device; the server session may still be active.';

type MethodsState =
  { status: 'loading' } | { status: 'ready'; data: LoginMethods } | { status: 'failed' };

/** A button-method anchor styled like a secondary `Button` (full-page navigation
 * — the OIDC flow leaves the SPA, so a router `<Link>` would be wrong). */
const buttonLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  padding: 'var(--tai-space-2) var(--tai-space-4)',
  borderRadius: 'var(--tai-radius-md)',
  font: 'var(--tai-text-md) var(--tai-font-sans)',
  background: 'var(--tai-color-surface-raised)',
  color: 'var(--tai-color-text)',
  border: '1px solid var(--tai-color-border)',
  textDecoration: 'none',
  cursor: 'pointer',
};

const sectionStyle: CSSProperties = { marginTop: 'var(--tai-space-5)' };
const errorStyle: CSSProperties = {
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

/** Visible methods with the bootstrap owner-creation form pulled to the front. */
function visibleMethods(data: LoginMethods, inviteToken: string | undefined): LoginMethod[] {
  const shown = data.methods.filter(
    (m) => m.shape === 'button' || isFormVisible(m.purpose, data.bootstrap, inviteToken),
  );
  return [...shown].sort((a, b) => rank(a) - rank(b));
}

function rank(m: LoginMethod): number {
  return m.shape === 'form' && m.purpose === 'bootstrap' ? 0 : 1;
}

/**
 * The one-time claim token carried in the URL FRAGMENT (`#claim=<token>`), or
 * `null` when absent. It rides the fragment on purpose — a fragment is never sent
 * to the server as part of a request URL, so the token is not logged by proxies or
 * access logs, and it is stripped from the address the instant it is read.
 */
function readClaimToken(): string | null {
  const hash = window.location.hash;
  if (hash === '' || hash === '#') return null;
  const token = new URLSearchParams(hash.slice(1)).get('claim');
  return token !== null && token !== '' ? token : null;
}

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
  const api = useApi();
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(false);
  // Mirror the live `remember` state into a ref every render. The SSO exchange
  // effect closes over its mount-time render, so reading `remember` directly
  // would capture the stale default; the ref lets its success path honor the
  // checkbox as it stands AT EXCHANGE COMPLETION, even if the user toggled it
  // while the exchange POST was in flight.
  const rememberRef = useRef(remember);
  rememberRef.current = remember;
  const [methods, setMethods] = useState<MethodsState>({ status: 'loading' });
  const [formValues, setFormValues] = useState<Record<string, Record<string, string>>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [keyPasteOpen, setKeyPasteOpen] = useState(false);
  // Busy while the one-time claim exchange is in flight: a QR/onboarding
  // link lands here and the token is exchanged automatically, so an in-flight
  // indicator tells the operator a sign-in is under way. On success the
  // `isAuthenticated` effect navigates away; on failure it clears back to false and
  // the inline error + key-paste fallback show.
  const [claiming, setClaiming] = useState(false);
  // A non-blocking notice threaded from a failed sign-out revoke: read the one-shot
  // flag once and clear it so the notice shows exactly once, never on a later visit.
  const [signOutNotice, setSignOutNotice] = useState<string | null>(null);

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
    // the query (and fail to match the route). It is origin-checked upstream.
    if (isAuthenticated) void navigate({ href: returnTo });
  }, [isAuthenticated, navigate, returnTo]);

  // Discover the sign-in methods. A plain fetch with local state, NOT a TanStack
  // query: the shell wipes the query cache around auth flips and the login page
  // renders inside that logged-out window, so a cache buys nothing. The fallback
  // key-paste form IS the recovery — no retry loop. Any error is loud (the inline
  // notice alone would discard the diagnostic: schema drift vs 500 vs network).
  useEffect(() => {
    const controller = new AbortController();
    api.getLoginMethods({ signal: controller.signal }).then(
      (data) => {
        setMethods({ status: 'ready', data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setMethods({ status: 'failed' });
        console.error(error);
      },
    );
    return () => {
      controller.abort();
    };
  }, [api]);

  // The SSO hand-back: the OIDC callback route 302s to `/login?sso=<code>` after
  // minting a session server-side; exchange the one-time code for a token here,
  // then strip the param. A `useRef` latch runs the exchange exactly once —
  // strict-mode's double effect invoke would otherwise consume the single-use
  // code twice and always fail.
  const ssoExchanged = useRef(false);
  useEffect(() => {
    if (ssoCode === undefined || ssoCode === '' || ssoExchanged.current) return;
    ssoExchanged.current = true;
    void (async () => {
      try {
        const result = await api.exchangeSsoCode(ssoCode);
        // Read the current remember state via the ref (default false =
        // in-memory) so a toggle made during the in-flight exchange is honored.
        login(result.token, rememberRef.current);
      } catch (error) {
        if (error instanceof ApiLoginFailedError) setLoginError(error.message);
        else {
          setLoginError(GENERIC_ERROR);
          console.error(error);
        }
      } finally {
        // Drop `sso` (single-use, now consumed) while keeping `redirect`.
        void navigate({
          to: '/login',
          search: (prev) => ({ redirect: prev.redirect }),
          replace: true,
        });
      }
    })();
    // The latch guards re-execution; the effect intentionally runs on the mount
    // `ssoCode` only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssoCode]);

  // The claim hand-off: a QR/onboarding link lands on `/login#claim=<token>`.
  // Mirror the SSO leg — exchange the one-time token for a session, then let the
  // `isAuthenticated` effect navigate to `returnTo`. The latch is flipped
  // SYNCHRONOUSLY before the async exchange because the token is single-use and
  // burns server-side: a strict-mode double-invoke or a remount mid-flight would
  // otherwise fire a second exchange that 404s and paints failure over a
  // SUCCESSFUL login. The fragment is stripped immediately (replaceState, not a
  // push) so the single-use token never persists in the URL bar or history.
  const claimExchanged = useRef(false);
  useEffect(() => {
    if (claimExchanged.current) return;
    const token = readClaimToken();
    if (token === null) return;
    claimExchanged.current = true;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    setClaiming(true);
    void (async () => {
      try {
        const result = await api.claimLogin({ token });
        // Session-only by default (remember=false); the user can re-login with
        // "remember" later. The existing `isAuthenticated` effect does the navigate,
        // so the busy state stays up until this screen unmounts.
        login(result.token, false);
      } catch (error) {
        if (error instanceof ApiLoginFailedError) setLoginError(error.message);
        else {
          setLoginError(GENERIC_ERROR);
          console.error(error);
        }
        // The exchange failed — drop the busy state and expand the key-paste
        // fallback so the operator has an immediate recovery.
        setClaiming(false);
        setKeyPasteOpen(true);
      }
    })();
    // The latch guards re-execution; the effect runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setLoginError(null);
    try {
      const result = await api.submitLoginForm(method.submit_path, values);
      login(result.token, remember);
    } catch (error) {
      if (error instanceof ApiLoginFailedError) setLoginError(error.message);
      else {
        setLoginError(GENERIC_ERROR);
        console.error(error);
      }
    } finally {
      setSubmitting(null);
    }
  }

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
        <h1 style={{ marginTop: 0, font: 'var(--tai-text-lg) var(--tai-font-sans)' }}>
          Sign in to the Studio
        </h1>

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

        {hasMethods && !keyPasteExpanded ? (
          <div style={{ marginTop: 'var(--tai-space-4)' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setKeyPasteOpen(true);
              }}
            >
              Use an API key instead
            </Button>
          </div>
        ) : null}

        {keyPasteExpanded ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = key.trim();
              if (trimmed === '') return;
              login(trimmed, remember);
            }}
            style={sectionStyle}
          >
            <p style={{ color: 'var(--tai-color-text-muted)', marginTop: 0 }}>
              Paste your deployment API key. It is full-privilege, including tool execution — treat
              it like a password. The first key is provisioned by the deployment; once signed in you
              can provision more keys — full-privilege or scoped — from the API-keys settings tab.
            </p>
            <Field label="API key">
              <TextInput
                type="password"
                autoComplete="off"
                value={key}
                onChange={(event) => {
                  setKey(event.target.value);
                }}
                placeholder="Paste your API key"
                aria-label="API key"
              />
            </Field>
            <div style={{ marginTop: 'var(--tai-space-4)' }}>
              <Button type="submit" variant="primary" disabled={key.trim() === ''}>
                Sign in
              </Button>
            </div>
          </form>
        ) : null}
      </Card>
    </main>
  );
}

/** One rendered login method — a `form` (fields + submit) or a `button`
 * (full-page-navigation anchor). An invalid `/api/` target renders a loud inline
 * error card naming the method id; the other methods still render. */
function MethodView({
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
        <a href={method.href} style={buttonLinkStyle}>
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
        </a>
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
      <h2
        style={{
          font: 'var(--tai-text-md) var(--tai-font-sans)',
          margin: '0 0 var(--tai-space-3)',
        }}
      >
        {method.title}
      </h2>
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
