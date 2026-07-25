/**
 * Auth flow: the credential screen, the returnTo pin, the in-memory
 * default, the sessionStorage opt-in, the 401→/login redirect, and the invariant
 * that localStorage is NEVER written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type PluginContext } from '@tai42/studio-sdk';
import { __resetContributions } from '@tai42/studio-sdk/testing';

import { installServer, renderStudio, server } from './test-harness';

installServer();

beforeEach(() => {
  __resetContributions();
});

const okPlugins = http.get('*/api/plugins', () => HttpResponse.json({ data: [] }));
const okTools = http.get('*/api/tools', () => HttpResponse.json({ data: [] }));
// The tools page additionally reads the per-tool tag map on mount; an empty map
// keeps the flat list (no grouping) while satisfying the strict unhandled-request guard.
const okToolTags = http.get('*/api/tools/tags', () => HttpResponse.json({ data: [] }));

async function signIn(key: string): Promise<void> {
  const user = userEvent.setup();
  const input = await screen.findByLabelText('API key');
  await user.type(input, key);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('auth flow', () => {
  it('in-memory default: an unauthenticated data route redirects to /login capturing returnTo', async () => {
    const { studio } = renderStudio({ initialPath: '/tools' });

    await screen.findByLabelText('API key');
    expect(studio.router.state.location.pathname).toBe('/login');
    expect(studio.router.state.location.search).toEqual({ redirect: '/tools' });
  });

  it('paste-key success lands on the returnTo (default /tools)', async () => {
    server.use(okPlugins, okTools, okToolTags);
    const { studio } = renderStudio({ initialPath: '/tools' });

    await signIn('secret-key');

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
  });

  it('a 401 from a data route routes back to /login', async () => {
    server.use(
      okPlugins,
      http.get('*/api/tools', () => HttpResponse.json({ error: 'unauthorized' }, { status: 401 })),
      okToolTags,
    );
    const { studio } = renderStudio({ initialPath: '/tools', sessionKey: 'expired-key' });

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/login');
    });
  });

  it('sessionStorage opt-in survives a reload (a fresh shell reads the credential)', async () => {
    server.use(okPlugins, okTools, okToolTags);
    // A prior "remember" opt-in persisted the key; a fresh shell instance mounts.
    const { studio } = renderStudio({ initialPath: '/tools', sessionKey: 'remembered-key' });

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
    expect(screen.queryByLabelText('API key')).toBeNull();
  });

  it('NEVER writes localStorage — even with "remember on this device" checked', async () => {
    server.use(okPlugins, okTools, okToolTags);
    // Install a fully-spied localStorage so the invariant is asserted deterministically
    // (this runtime does not otherwise expose a global localStorage).
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
      const user = userEvent.setup();
      renderStudio({ initialPath: '/tools' });

      const input = await screen.findByLabelText('API key');
      await user.type(input, 'remember-me-key');
      await user.click(screen.getByLabelText(/Remember on this device/));
      await user.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => {
        expect(globalThis.sessionStorage.getItem('tai-studio.apiKey')).toBe('remember-me-key');
      });
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });

  it('returnTo pin: a cold deep link redirects to /login and returns there after auth', async () => {
    server.use(
      http.get('*/api/plugins', () =>
        HttpResponse.json({
          data: [
            {
              name: 'acme',
              version: '1.0.0',
              api_version: 1,
              entry: 'index.js',
              integrity: { 'index.js': 'sha384-abc' },
              contributions: { tool_panels: {}, pages: ['dashboard'], settings_tabs: [] },
            },
          ],
        }),
      ),
    );

    const importModule = vi.fn((_url: string) =>
      Promise.resolve({
        register: (ctx: PluginContext) => {
          ctx.registerPage({
            path: 'dashboard',
            title: 'Dashboard',
            component: () => <div>acme dashboard</div>,
          });
        },
      }),
    );

    const { studio } = renderStudio({
      initialPath: '/plugins/acme/dashboard',
      importModule,
    });

    // Cold deep link → bounced to /login with the requested location as returnTo.
    await screen.findByLabelText('API key');
    expect(studio.router.state.location.pathname).toBe('/login');
    expect(studio.router.state.location.search).toEqual({ redirect: '/plugins/acme/dashboard' });

    await signIn('deep-link-key');

    // …and after auth the operator lands back on the originally-requested page.
    expect(await screen.findByText('acme dashboard')).toBeInTheDocument();
    expect(studio.router.state.location.pathname).toBe('/plugins/acme/dashboard');
  });
});
