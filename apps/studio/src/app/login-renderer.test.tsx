/**
 * The metadata-driven login renderer: it consumes `GET /api/login/methods` and
 * renders the deployment's sign-in methods (form + button shapes) around the
 * permanent key-paste fallback, plus the one-time SSO hand-back exchange. The
 * pre-existing `auth.test.tsx` scenarios stay the key-paste regression suite;
 * these cases cover the new surface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { __resetContributions } from '@tai42/studio-sdk/testing';

import { installServer, renderStudio, server } from './test-harness';

installServer();

beforeEach(() => {
  __resetContributions();
});

const okPlugins = http.get('*/api/plugins', () => HttpResponse.json({ data: [] }));
const okToolTags = http.get('*/api/tools/tags', () => HttpResponse.json({ data: [] }));

/** A `GET /api/tools` handler that records the auth header the shell attaches on
 * the first authenticated data request after sign-in. */
function capturingTools(): { handler: ReturnType<typeof http.get>; header: () => string | null } {
  let seen: string | null = null;
  const handler = http.get('*/api/tools', ({ request }) => {
    seen = request.headers.get('x-api-key');
    return HttpResponse.json({ data: [] });
  });
  return { handler, header: () => seen };
}

function methods(payload: unknown): ReturnType<typeof http.get> {
  return http.get('*/api/login/methods', () => HttpResponse.json({ data: payload }));
}

const passwordForm = {
  shape: 'form',
  id: 'password',
  title: 'Sign in',
  fields: [
    { name: 'email', label: 'Email', secret: false, autocomplete: 'email' },
    { name: 'password', label: 'Password', secret: true, autocomplete: 'current-password' },
  ],
  submit_path: '/api/login/password',
};

describe('login renderer', () => {
  it('renders a form method, POSTs a FLAT body, and signs in with the minted token', async () => {
    const user = userEvent.setup();
    const tools = capturingTools();
    let body: unknown;
    server.use(
      methods({ bootstrap: false, methods: [passwordForm] }),
      http.post('*/api/login/password', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { token: 'tai-sess-x', user_id: 'u1' } });
      }),
      okPlugins,
      tools.handler,
      okToolTags,
    );
    const { studio } = renderStudio({ initialPath: '/tools' });

    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
    expect(body).toEqual({ email: 'a@b.co', password: 'pw' });
    // The minted session token rides the exact key-paste pipeline (x-api-key). The Tools
    // page mounts once its capability projection resolves, so await its first read.
    await waitFor(() => {
      expect(tools.header()).toBe('tai-sess-x');
    });
  });

  it('renders a button method as an anchor with an <img> data-URI icon (never injected SVG)', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1H0z"/></svg>';
    server.use(
      methods({
        bootstrap: false,
        methods: [
          {
            shape: 'button',
            id: 'oidc',
            label: 'Continue with SSO',
            icon: svg,
            href: '/api/login/oidc/start',
          },
        ],
      }),
    );
    renderStudio({ initialPath: '/login' });

    const link = await screen.findByRole('link', { name: /Continue with SSO/ });
    expect(link).toHaveAttribute('href', '/api/login/oidc/start');
    const img = link.querySelector('img');
    expect(img?.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true);
    // The SVG markup never became live DOM.
    expect(document.querySelector('svg')).toBeNull();
    expect(document.querySelector('path')).toBeNull();
  });

  it('renders an inline error card (not a request) for a method with an off-origin target', async () => {
    server.use(
      methods({
        bootstrap: false,
        methods: [
          { shape: 'button', id: 'evil', label: 'Off-origin', href: 'https://evil.test/api/x' },
        ],
      }),
    );
    renderStudio({ initialPath: '/login' });

    expect(
      await screen.findByText(/method "evil" declares an invalid target/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Off-origin' })).toBeNull();
  });

  it('empty methods render the key-paste form expanded (today’s screen)', async () => {
    const user = userEvent.setup();
    const tools = capturingTools();
    // The harness default handler already serves empty methods.
    server.use(okPlugins, tools.handler, okToolTags);
    const { studio } = renderStudio({ initialPath: '/tools' });

    const input = await screen.findByLabelText('API key');
    await user.type(input, 'paste-key');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
    expect(tools.header()).toBe('paste-key');
  });

  it('collapses key-paste behind a toggle when methods exist, then signs in with a pasted key', async () => {
    const user = userEvent.setup();
    const tools = capturingTools();
    server.use(
      methods({
        bootstrap: false,
        methods: [
          {
            shape: 'button',
            id: 'oidc',
            label: 'Continue with SSO',
            href: '/api/login/oidc/start',
          },
        ],
      }),
      okPlugins,
      tools.handler,
      okToolTags,
    );
    const { studio } = renderStudio({ initialPath: '/tools' });

    // With a method present the key-paste input is hidden behind the toggle.
    await screen.findByRole('link', { name: 'Continue with SSO' });
    expect(screen.queryByLabelText('API key')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Use an API key instead' }));
    await user.type(await screen.findByLabelText('API key'), 'toggle-key');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
    expect(tools.header()).toBe('toggle-key');
  });

  it('bootstrap mode shows the banner and the owner form; bootstrap:false hides the owner form', async () => {
    const ownerForm = {
      shape: 'form',
      id: 'owner',
      title: 'Create the owner account',
      purpose: 'bootstrap',
      fields: [{ name: 'password', label: 'Password', secret: true }],
      submit_path: '/api/login/bootstrap',
    };

    server.use(methods({ bootstrap: true, methods: [passwordForm, ownerForm] }));
    const { unmount } = renderStudio({ initialPath: '/login' });
    expect(await screen.findByText(/No accounts exist yet/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Create the owner account' })).toBeInTheDocument();
    unmount();

    server.resetHandlers();
    server.use(methods({ bootstrap: false, methods: [passwordForm, ownerForm] }));
    renderStudio({ initialPath: '/login' });
    // The same owner form is hidden when the deployment already has accounts.
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByRole('heading', { name: 'Create the owner account' })).toBeNull();
    expect(screen.queryByText(/No accounts exist yet/)).toBeNull();
  });

  it('invite mode renders the invite form only with ?invite and merges invite_token into the body', async () => {
    const user = userEvent.setup();
    const inviteForm = {
      shape: 'form',
      id: 'invite',
      title: 'Accept invite',
      purpose: 'invite',
      fields: [{ name: 'password', label: 'Password', secret: true }],
      submit_path: '/api/login/accept-invite',
    };
    const tools = capturingTools();
    let body: unknown;
    server.use(
      methods({ bootstrap: false, methods: [inviteForm] }),
      http.post('*/api/login/accept-invite', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { token: 'tai-sess-inv', user_id: 'invitee' } });
      }),
      okPlugins,
      tools.handler,
      okToolTags,
    );
    const { studio } = renderStudio({ initialPath: '/login?invite=tok1' });

    await user.type(await screen.findByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Accept invite' }));

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
    expect(body).toEqual({ password: 'pw', invite_token: 'tok1' });
  });

  it('hides an invite form when the login URL carries no invite token', async () => {
    const inviteForm = {
      shape: 'form',
      id: 'invite',
      title: 'Accept invite',
      purpose: 'invite',
      fields: [{ name: 'password', label: 'Password', secret: true }],
      submit_path: '/api/login/accept-invite',
    };
    server.use(methods({ bootstrap: false, methods: [passwordForm, inviteForm] }));
    renderStudio({ initialPath: '/login' });

    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByRole('heading', { name: 'Accept invite' })).toBeNull();
  });

  it('a login-submit 401 renders inline and never redirect-loops', async () => {
    const user = userEvent.setup();
    server.use(
      methods({ bootstrap: false, methods: [passwordForm] }),
      http.post('*/api/login/password', () =>
        HttpResponse.json({ error: 'bad creds' }, { status: 401 }),
      ),
    );
    const { studio } = renderStudio({ initialPath: '/tools' });

    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'nope');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sign-in failed — check your credentials.');
    // Still on /login with the returnTo pin preserved — no logout-navigate churn.
    expect(studio.router.state.location.pathname).toBe('/login');
    expect(studio.router.state.location.search).toEqual({ redirect: '/tools' });
  });

  it('passes a 429 rate-limit message through to the inline error surface', async () => {
    const user = userEvent.setup();
    server.use(
      methods({ bootstrap: false, methods: [passwordForm] }),
      http.post('*/api/login/password', () =>
        HttpResponse.json(
          { error: 'Too many attempts — try again in 15 minutes' },
          { status: 429 },
        ),
      ),
    );
    renderStudio({ initialPath: '/tools' });

    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('Too many attempts — try again in 15 minutes'),
    ).toBeInTheDocument();
  });

  it('a form-submit non-login-failure (500) shows a generic message AND logs the original', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    server.use(
      methods({ bootstrap: false, methods: [passwordForm] }),
      http.post('*/api/login/password', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { studio } = renderStudio({ initialPath: '/tools' });

    await user.type(await screen.findByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong signing in');
    // The original diagnostic is logged, never swallowed…
    expect(spy).toHaveBeenCalled();
    // …and the user stays on /login with the returnTo pin intact.
    expect(studio.router.state.location.pathname).toBe('/login');
    expect(studio.router.state.location.search).toEqual({ redirect: '/tools' });
    spy.mockRestore();
  });

  it('bootstrap sorts the owner-creation form ahead of the standard login form', async () => {
    const ownerForm = {
      shape: 'form',
      id: 'owner',
      title: 'Create the owner account',
      purpose: 'bootstrap',
      fields: [{ name: 'password', label: 'Password', secret: true }],
      submit_path: '/api/login/bootstrap',
    };
    // List the standard login form FIRST — the renderer must still rank the
    // bootstrap owner form ahead of it.
    server.use(methods({ bootstrap: true, methods: [passwordForm, ownerForm] }));
    renderStudio({ initialPath: '/login' });

    const owner = await screen.findByRole('heading', { name: 'Create the owner account' });
    const login = screen.getByRole('heading', { name: 'Sign in' });
    // The owner form precedes the login form in document order.
    expect(owner.compareDocumentPosition(login) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a methods-discovery failure shows a loud notice and the expanded key-paste still signs in', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const tools = capturingTools();
    server.use(
      http.get('*/api/login/methods', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
      okPlugins,
      tools.handler,
      okToolTags,
    );
    const { studio } = renderStudio({ initialPath: '/tools' });

    expect(await screen.findByText(/Could not load sign-in methods/)).toBeInTheDocument();
    // The original diagnostic is logged, never swallowed.
    expect(spy).toHaveBeenCalled();

    await user.type(await screen.findByLabelText('API key'), 'fallback-key');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
    expect(tools.header()).toBe('fallback-key');
    spy.mockRestore();
  });
});

describe('SSO hand-back exchange', () => {
  it('exchanges the one-time code, signs in, lands on returnTo, and strips ?sso', async () => {
    const tools = capturingTools();
    let body: unknown;
    server.use(
      http.post('*/api/login/sso/exchange', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: { token: 'tai-sess-sso', user_id: 'u9' } });
      }),
      okPlugins,
      tools.handler,
      okToolTags,
    );
    const { studio } = renderStudio({ initialPath: '/login?sso=abc&redirect=%2Ftools' });

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
    expect(body).toEqual({ code: 'abc' });
    await waitFor(() => {
      expect(tools.header()).toBe('tai-sess-sso');
    });
    // The single-use code is gone from the address.
    expect(studio.router.state.location.search).not.toHaveProperty('sso');
  });

  it('renders an inline error and stays on /login when the code is expired/reused (400)', async () => {
    server.use(
      http.post('*/api/login/sso/exchange', () =>
        HttpResponse.json({ error: 'code expired' }, { status: 400 }),
      ),
    );
    const { studio } = renderStudio({ initialPath: '/login?sso=stale&redirect=%2Ftools' });

    expect(await screen.findByText('code expired')).toBeInTheDocument();
    expect(studio.router.state.location.pathname).toBe('/login');
    expect(studio.router.state.location.search).not.toHaveProperty('sso');
  });

  it('a non-login-failure exchange error (500) shows a generic message AND logs the original', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(
      http.post('*/api/login/sso/exchange', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
    );
    const { studio } = renderStudio({ initialPath: '/login?sso=oops' });

    expect(await screen.findByText(/Something went wrong signing in/)).toBeInTheDocument();
    expect(spy).toHaveBeenCalled();
    expect(studio.router.state.location.pathname).toBe('/login');
    spy.mockRestore();
  });

  it('NEVER writes localStorage on a form login or an SSO exchange', async () => {
    const setItem = vi.fn();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        setItem,
        getItem: () => null,
        removeItem: () => undefined,
        clear: () => undefined,
        key: () => null,
        length: 0,
      },
    });

    try {
      const tools = capturingTools();
      server.use(
        methods({ bootstrap: false, methods: [passwordForm] }),
        http.post('*/api/login/password', () =>
          HttpResponse.json({ data: { token: 'tai-sess-x', user_id: 'u1' } }),
        ),
        okPlugins,
        tools.handler,
        okToolTags,
      );
      const user = userEvent.setup();
      const { studio } = renderStudio({ initialPath: '/tools' });

      await user.type(await screen.findByLabelText('Email'), 'a@b.co');
      await user.type(screen.getByLabelText('Password'), 'pw');
      // Opt into "remember" — it must still never reach localStorage.
      await user.click(screen.getByLabelText(/Remember on this device/));
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() => {
        expect(studio.router.state.location.pathname).toBe('/tools');
      });
      expect(setItem).not.toHaveBeenCalled();

      // …and an SSO exchange follows the same in-memory/sessionStorage policy.
      server.resetHandlers();
      const tools2 = capturingTools();
      server.use(
        http.post('*/api/login/sso/exchange', () =>
          HttpResponse.json({ data: { token: 'tai-sess-sso', user_id: 'u9' } }),
        ),
        okPlugins,
        tools2.handler,
        okToolTags,
      );
      const { studio: studio2 } = renderStudio({ initialPath: '/login?sso=abc&redirect=%2Ftools' });
      await waitFor(() => {
        expect(studio2.router.state.location.pathname).toBe('/tools');
      });
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('honors a "remember" toggle made WHILE the exchange is in flight (reads it at completion, not mount)', async () => {
    const user = userEvent.setup();
    const tools = capturingTools();
    // Park the exchange open so the checkbox can be toggled with the POST still
    // in flight: the handler waits on `released`, which the test resolves only
    // AFTER checking the box. The mount-time render captured remember:false; the
    // success path must read the checkbox as it stands at completion instead.
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.post('*/api/login/sso/exchange', async () => {
        await released;
        return HttpResponse.json({ data: { token: 'tai-sess-sso', user_id: 'u9' } });
      }),
      okPlugins,
      tools.handler,
      okToolTags,
    );
    const { studio } = renderStudio({ initialPath: '/login?sso=abc&redirect=%2Ftools' });

    // Opt into "remember" during the in-flight window, then let it resolve.
    await user.click(await screen.findByLabelText(/Remember on this device/));
    release();

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
    // The toggled-true checkbox is honored — the token is persisted to
    // sessionStorage (login(token, true)), not dropped as the stale mount false.
    expect(globalThis.sessionStorage.getItem('tai-studio.apiKey')).toBe('tai-sess-sso');
    await waitFor(() => {
      expect(tools.header()).toBe('tai-sess-sso');
    });
  });
});

describe('claim login leg (#claim=<token>)', () => {
  // The claim token rides the URL FRAGMENT (window.location.hash), never a query
  // param. Reset it between cases so a stripped/unstripped fragment never leaks.
  afterEach(() => {
    window.location.hash = '';
  });

  it('exchanges the fragment token exactly once under StrictMode, signs in, lands on returnTo, and strips the hash', async () => {
    const tools = capturingTools();
    let calls = 0;
    let body: unknown;
    server.use(
      http.post('*/api/login/claim', async ({ request }) => {
        calls += 1;
        body = await request.json();
        return HttpResponse.json({ data: { token: 'tai-sess-claim', user_id: 'u-claim' } });
      }),
      okPlugins,
      tools.handler,
      okToolTags,
    );
    window.location.hash = '#claim=clm-abc';
    // StrictMode double-invokes mount effects (setup → cleanup → setup): a missing
    // synchronous latch would let the single-use token be exchanged twice (the
    // second 404s and paints failure over a successful login), so `calls` MUST stay
    // 1 exactly.
    const { studio } = renderStudio({ initialPath: '/login', strictMode: true });

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
    expect(calls).toBe(1);
    expect(body).toEqual({ token: 'clm-abc' });
    // The minted session token rides the normal key pipeline (x-api-key).
    await waitFor(() => {
      expect(tools.header()).toBe('tai-sess-claim');
    });
    // The single-use token is gone from the address bar.
    expect(window.location.hash).toBe('');
  });

  it('shows a busy indicator while the claim exchange is in flight', async () => {
    // A never-settling exchange keeps the leg pending, so the in-flight indicator
    // ("Signing you in…") stays rendered.
    server.use(
      http.post('*/api/login/claim', () => new Promise<Response>(() => undefined)),
      okPlugins,
      okToolTags,
    );
    window.location.hash = '#claim=pending';
    renderStudio({ initialPath: '/login' });

    expect(await screen.findByRole('status', { name: 'Signing you in…' })).toBeInTheDocument();
  });

  it('a 404 (unknown/used/expired) renders inline and expands the key-paste fallback', async () => {
    server.use(
      methods({ bootstrap: false, methods: [passwordForm] }),
      http.post('*/api/login/claim', () =>
        HttpResponse.json(
          { error: 'This claim link is invalid, expired, or already used' },
          { status: 404 },
        ),
      ),
    );
    window.location.hash = '#claim=stale';
    const { studio } = renderStudio({ initialPath: '/login' });

    expect(await screen.findByText(/invalid, expired, or already used/)).toBeInTheDocument();
    // Still on /login (never a silent bounce), the fragment stripped.
    expect(studio.router.state.location.pathname).toBe('/login');
    expect(window.location.hash).toBe('');
    // With a method present the key-paste form is normally collapsed; a claim
    // failure expands it so the operator has an immediate recovery path.
    expect(await screen.findByLabelText('API key')).toBeInTheDocument();
  });

  it('rides the fragment only — never a query param, a storage write, or a console call', async () => {
    const TOKEN = 'super-secret-claim-token';
    const consoleSpies = (['log', 'error', 'info', 'warn'] as const).map((name) =>
      vi.spyOn(console, name).mockImplementation(() => undefined),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const tools = capturingTools();
    server.use(
      http.post('*/api/login/claim', () =>
        HttpResponse.json({ data: { token: 'tai-sess-claim', user_id: 'u-claim' } }),
      ),
      okPlugins,
      tools.handler,
      okToolTags,
    );
    window.location.hash = `#claim=${TOKEN}`;
    const { studio } = renderStudio({ initialPath: '/login' });

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
    // Never in a URL query (search), and stripped from the fragment.
    expect(JSON.stringify(studio.router.state.location.search)).not.toContain(TOKEN);
    expect(window.location.hash).toBe('');
    // Never written to any storage key.
    for (const [, value] of setItem.mock.calls) expect(value).not.toContain(TOKEN);
    // Never logged on any console channel.
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(TOKEN);
    }
    setItem.mockRestore();
    for (const spy of consoleSpies) spy.mockRestore();
  });
});
