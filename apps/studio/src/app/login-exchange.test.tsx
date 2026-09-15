/**
 * The login screen's one-time credential exchanges: the SSO hand-back
 * (`/login?sso=<code>`) and the claim hand-off (`/login#claim=<token>`). Both
 * exchange a single-use code for a session, latch to run exactly once, and strip the
 * consumed value from the URL.
 */
import { __resetContributions } from '@tai42/studio-sdk/testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installServer, renderStudio, server } from './test-harness';
import {
  capturingMetrics,
  capturingTools,
  methods,
  okPlugins,
  okToolTags,
  passwordForm,
} from './test-login-support';

installServer();

beforeEach(() => {
  __resetContributions();
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
    const metrics = capturingMetrics();
    let calls = 0;
    let body: unknown;
    server.use(
      http.post('*/api/login/claim', async ({ request }) => {
        calls += 1;
        body = await request.json();
        return HttpResponse.json({ data: { token: 'tai-sess-claim', user_id: 'u-claim' } });
      }),
      okPlugins,
      metrics.handler,
      okToolTags,
    );
    window.location.hash = '#claim=clm-abc';
    // StrictMode double-invokes mount effects (setup → cleanup → setup): a missing
    // synchronous latch would let the single-use token be exchanged twice (the
    // second 404s and paints failure over a successful login), so `calls` MUST stay
    // 1 exactly.
    const { studio } = renderStudio({ initialPath: '/login', strictMode: true });

    // No redirect was requested, so returnTo is `/` and the landing route lands
    // the full projection on the Dashboard.
    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/observability');
    });
    expect(calls).toBe(1);
    expect(body).toEqual({ token: 'clm-abc' });
    // The minted session token rides the normal key pipeline (x-api-key) on the
    // Dashboard's metrics read — the first authenticated data request.
    await waitFor(() => {
      expect(metrics.header()).toBe('tai-sess-claim');
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
      expect(studio.router.state.location.pathname).toBe('/observability');
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
