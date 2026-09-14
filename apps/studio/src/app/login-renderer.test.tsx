/**
 * The metadata-driven login renderer: it consumes `GET /api/login/methods` and
 * renders the deployment's sign-in methods (form + button shapes) around the
 * permanent key-paste fallback.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { __resetContributions } from '@tai42/studio-sdk/testing';

import { installServer, renderStudio, server } from './test-harness';
import { capturingTools, methods, okPlugins, okToolTags, passwordForm } from './test-login-support';

installServer();

beforeEach(() => {
  __resetContributions();
});

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

    // No redirect was requested, so the login default returnTo is `/`, and the
    // landing route replace-navigates the full projection to the Dashboard.
    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/observability');
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
