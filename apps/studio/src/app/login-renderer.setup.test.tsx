/**
 * The metadata-driven login renderer in setup mode: when `GET /api/login/methods`
 * reports `needs_setup`, the screen renders the owner-setup entry — the token
 * step, the owner form, the once-shown key, the invite variant, and the
 * per-status inline errors — while the permanent key-paste fallback stays
 * reachable.
 */
import { __resetContributions } from '@tai42/studio-sdk/testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installServer, renderStudio, server } from './test-harness';
import { capturingTools, methods, okPlugins, okToolTags, passwordForm } from './test-login-support';

installServer();

beforeEach(() => {
  __resetContributions();
});

describe('login renderer setup mode', () => {
  it('setup mode renders only the setup entry; Continue reveals the owner form without any request', async () => {
    const user = userEvent.setup();
    const setupSpy = vi.fn();
    server.use(
      methods({
        needs_setup: true,
        setup_login: { kinds: ['password', 'invite'] },
        methods: [passwordForm],
      }),
      http.post('*/api/setup', () => {
        setupSpy();
        return HttpResponse.json({ data: {} });
      }),
    );
    renderStudio({ initialPath: '/login' });

    // The setup heading, never the sign-in heading, and none of the sign-in
    // form's own fields — until the token reveals the owner form there is no
    // Email/Password on screen.
    await screen.findByRole('heading', { name: 'Set up this deployment' });
    expect(screen.queryByRole('heading', { name: 'Sign in to the Studio' })).toBeNull();
    expect(screen.queryByLabelText('Email')).toBeNull();

    await user.type(screen.getByLabelText('Setup token', { selector: 'input' }), 'tok');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // The owner form appears with Display name focused, and Continue sent nothing.
    const displayName = await screen.findByLabelText('Display name');
    await waitFor(() => {
      expect(displayName).toHaveFocus();
    });
    expect(setupSpy).not.toHaveBeenCalled();
  });

  it('setup submits ONE POST /api/setup with the token and owner fields, shows the key once, and Continue signs in with it', async () => {
    const user = userEvent.setup();
    const tools = capturingTools();
    let body: unknown;
    server.use(
      methods({ needs_setup: true, setup_login: { kinds: ['password'] }, methods: [] }),
      http.post('*/api/setup', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          data: {
            owner_user_id: 'usr-1',
            key_user_id: 'usr-1-key',
            api_key: 'sk-owner-123',
            key_fingerprint: 'fp',
            login_attached: true,
          },
        });
      }),
      okPlugins,
      tools.handler,
      okToolTags,
    );
    const { studio } = renderStudio({ initialPath: '/tools' });

    await user.type(await screen.findByLabelText('Setup token', { selector: 'input' }), 'tok');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Display name'), 'Owner');
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.type(screen.getByLabelText('Password'), 'super-secret-pw');
    await user.click(screen.getByRole('button', { name: 'Create owner and key' }));

    expect(await screen.findByText('sk-owner-123')).toBeInTheDocument();
    expect(body).toEqual({
      setup_token: 'tok',
      owner_display_name: 'Owner',
      login: { kind: 'password', email: 'a@b.co', password: 'super-secret-pw' },
    });

    await user.click(screen.getByRole('button', { name: 'Continue to the Studio' }));
    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
    await waitFor(() => {
      expect(tools.header()).toBe('sk-owner-123');
    });
  });

  it('setup keys-only when setup_login is null: no login fields, body has no login', async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      methods({ needs_setup: true, setup_login: null, methods: [] }),
      http.post('*/api/setup', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          data: {
            owner_user_id: 'u',
            key_user_id: 'k',
            api_key: 'sk-keys-only',
            key_fingerprint: 'fp',
            login_attached: false,
          },
        });
      }),
      okPlugins,
    );
    renderStudio({ initialPath: '/login' });

    await user.type(await screen.findByLabelText('Setup token', { selector: 'input' }), 'tok');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Display name'), 'Owner');
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.queryByLabelText('Password')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Create owner and key' }));

    expect(await screen.findByText('sk-keys-only')).toBeInTheDocument();
    expect(body).toEqual({ setup_token: 'tok', owner_display_name: 'Owner' });
  });

  it('setup invite option carries kind invite and shows the invite link', async () => {
    const user = userEvent.setup();
    let body: unknown;
    server.use(
      methods({ needs_setup: true, setup_login: { kinds: ['password', 'invite'] }, methods: [] }),
      http.post('*/api/setup', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({
          data: {
            owner_user_id: 'u',
            key_user_id: 'k',
            api_key: 'sk-invite',
            key_fingerprint: 'fp',
            login_attached: false,
            invite_token: 'inv-9',
            login_path: '/login',
          },
        });
      }),
      okPlugins,
    );
    renderStudio({ initialPath: '/login' });

    await user.type(await screen.findByLabelText('Setup token', { selector: 'input' }), 'tok');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.type(await screen.findByLabelText('Display name'), 'Owner');
    await user.type(screen.getByLabelText('Email'), 'a@b.co');
    await user.click(screen.getByRole('radio', { name: 'Send me an invite link' }));
    await user.click(screen.getByRole('button', { name: 'Create owner and key' }));

    expect(await screen.findByText('sk-invite')).toBeInTheDocument();
    expect(body).toEqual({
      setup_token: 'tok',
      owner_display_name: 'Owner',
      login: { kind: 'invite', email: 'a@b.co' },
    });
    expect(screen.getByText(`${window.location.origin}/login?invite=inv-9`)).toBeInTheDocument();
  });

  it('setup errors: 403 token copy, 429 throttle, 409 reload, 501 unsupported, 400/422 generic', async () => {
    const user = userEvent.setup();

    async function attempt(status: number): Promise<ReturnType<typeof renderStudio>> {
      server.resetHandlers();
      server.use(
        methods({ needs_setup: true, setup_login: null, methods: [] }),
        http.post('*/api/setup', () => HttpResponse.json({ error: 'no' }, { status })),
        okPlugins,
      );
      const view = renderStudio({ initialPath: '/login' });
      await user.type(await screen.findByLabelText('Setup token', { selector: 'input' }), 'tok');
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.type(await screen.findByLabelText('Display name'), 'Owner');
      await user.click(screen.getByRole('button', { name: 'Create owner and key' }));
      return view;
    }

    const v403 = await attempt(403);
    expect(await screen.findByRole('alert')).toHaveTextContent('The setup token was not accepted');
    v403.unmount();

    const v429 = await attempt(429);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Wait a minute and try again.',
    );
    v429.unmount();

    const v409 = await attempt(409);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Someone already set up this deployment',
    );
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    v409.unmount();

    const v501 = await attempt(501);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Setup is unavailable on this server',
    );
    v501.unmount();

    // An invalid setup body (400/422) is not a keyed setup status, so the entry
    // shows the generic sign-in failure copy.
    const v400 = await attempt(400);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong signing in. Please try again.',
    );
    v400.unmount();

    const v422 = await attempt(422);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong signing in. Please try again.',
    );
    v422.unmount();
  });

  it('setup "Change token" collapses the owner form and keeps the token, restoring the token form', async () => {
    const user = userEvent.setup();
    server.use(methods({ needs_setup: true, setup_login: null, methods: [] }));
    renderStudio({ initialPath: '/login' });

    const token = await screen.findByLabelText('Setup token', { selector: 'input' });
    await user.type(token, 'tok');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByLabelText('Display name');

    // Once revealed the owner form replaces the token step — the token form is gone.
    expect(screen.queryByLabelText('Setup token')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Change token' }));
    // Back on the token step: the owner form is gone, the token form returns with the
    // token value kept and its input focused.
    expect(screen.queryByLabelText('Display name')).toBeNull();
    const tokenAgain = await screen.findByLabelText('Setup token', { selector: 'input' });
    expect(tokenAgain).toHaveValue('tok');
    await waitFor(() => {
      expect(tokenAgain).toHaveFocus();
    });
  });

  it('setup keeps the key-paste fallback reachable', async () => {
    const user = userEvent.setup();
    const tools = capturingTools();
    server.use(
      methods({ needs_setup: true, setup_login: null, methods: [] }),
      okPlugins,
      tools.handler,
      okToolTags,
    );
    const { studio } = renderStudio({ initialPath: '/tools' });

    await screen.findByRole('heading', { name: 'Set up this deployment' });
    await user.click(screen.getByRole('button', { name: 'Use an API key instead' }));
    await user.type(await screen.findByLabelText('API key'), 'paste-key');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
    expect(tools.header()).toBe('paste-key');
  });
});
