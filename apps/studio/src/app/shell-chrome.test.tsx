/**
 * Shell chrome behaviors: the globally-mounted interactions badge gates on the
 * projection (never opens a stream the server would deny), and sign-out revokes the
 * server session before clearing local auth (quiet on the expected 404, loud on a real
 * failure).
 */
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiClient } from '@tai42/api-client';
import { __resetContributions, __resetPluginHostState } from '@tai42/studio-sdk/testing';

import { installServer, renderStudio, server } from './test-harness';
import { meHandler, okChannels, okPlugins, scoped } from './test-capabilities-support';

installServer();

beforeEach(() => {
  __resetContributions();
  __resetPluginHostState();
});

describe('interactions badge gating', () => {
  const okTools = http.get('*/api/tools', () => HttpResponse.json({ data: ['echo'] }));
  const okToolTags = http.get('*/api/tools/tags', () => HttpResponse.json({ data: [] }));

  /** An inert interactions stream whose open can be observed. */
  function streamSpy(): Mock<ApiClient['streamInteractions']> {
    async function* empty(): AsyncGenerator<never> {
      // no frames
    }
    return vi.fn<ApiClient['streamInteractions']>(() => Promise.resolve(empty()));
  }

  it('a scoped session WITHOUT interactions access never opens the SSE', async () => {
    server.use(meHandler(scoped(['/api/tools'])), okTools, okToolTags);
    const streamInteractions = streamSpy();
    renderStudio({ initialPath: '/tools', sessionKey: 'k-cap', streamInteractions });

    // The scoped nav has rendered (Tools is covered) — the badge would have mounted
    // by now had it not been gated.
    await screen.findByRole('link', { name: 'Tools' });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Settings' })).toBeInTheDocument();
    });
    expect(streamInteractions).not.toHaveBeenCalled();
    expect(screen.queryByTestId('interactions-badge')).toBeNull();
  });

  it('a session WITH interactions access mounts the badge and opens the SSE', async () => {
    server.use(meHandler(scoped(['/api/tools', '/api/interactions'])), okTools, okToolTags);
    const streamInteractions = streamSpy();
    renderStudio({ initialPath: '/tools', sessionKey: 'k-cap', streamInteractions });

    await screen.findByRole('link', { name: 'Tools' });
    await waitFor(() => {
      expect(streamInteractions).toHaveBeenCalled();
    });
  });
});

describe('sign-out', () => {
  function logoutHandler(
    status: number,
    body: Record<string, unknown>,
  ): { handler: ReturnType<typeof http.post>; calls: () => number } {
    let calls = 0;
    const handler = http.post('*/api/auth/logout', () => {
      calls += 1;
      return HttpResponse.json(body, { status });
    });
    return { handler, calls: () => calls };
  }

  it('revokes server-side then clears local auth on a 200 {revoked}', async () => {
    const logout = logoutHandler(200, { data: { revoked: true } });
    server.use(logout.handler, okPlugins, okChannels);
    const user = userEvent.setup();
    const { studio } = renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/login');
    });
    expect(logout.calls()).toBe(1);
    // Local credential cleared: the remembered session key is gone.
    expect(globalThis.sessionStorage.getItem('tai-studio.apiKey')).toBeNull();
  });

  it('stays QUIET on the expected 404 (a plain key has no session) and still clears', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logout = logoutHandler(404, { error: 'no session to revoke' });
    server.use(logout.handler, okPlugins, okChannels);
    const user = userEvent.setup();
    const { studio } = renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/login');
    });
    expect(logout.calls()).toBe(1);
    // A 404 is expected, not a failure — never a loud log.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('surfaces a real (5xx) revoke failure LOUDLY, but still clears local auth', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logout = logoutHandler(500, { error: 'revoke exploded' });
    server.use(logout.handler, okPlugins, okChannels);
    const user = userEvent.setup();
    const { studio } = renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/login');
    });
    // The diagnostic is logged (a real session may not have revoked), never swallowed.
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('surfaces a non-blocking one-shot notice on the login screen after a failed revoke', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const logout = logoutHandler(500, { error: 'revoke exploded' });
    server.use(logout.handler, okPlugins, okChannels);
    const user = userEvent.setup();
    const { studio } = renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/login');
    });
    // The login screen shows the inline, non-blocking sign-out notice…
    const notice = await screen.findByText(/the server session may still be active/i);
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveAttribute('role', 'status');
    // …and it is one-shot: the flag has been read and cleared.
    expect(globalThis.sessionStorage.getItem('tai-studio.signout-notice')).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('shows no sign-out notice on the login screen when the revoke succeeded', async () => {
    const logout = logoutHandler(200, { data: { revoked: true } });
    server.use(logout.handler, okPlugins, okChannels);
    const user = userEvent.setup();
    const { studio } = renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });

    await user.click(await screen.findByRole('button', { name: 'Sign out' }));

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/login');
    });
    // A clean sign-out leaves no notice behind.
    await screen.findByRole('heading', { name: 'Sign in to the Studio' });
    expect(screen.queryByText(/the server session may still be active/i)).toBeNull();
  });
});
