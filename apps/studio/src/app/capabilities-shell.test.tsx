/**
 * The capability-gated shell: the nav renders from the caller's `/api/auth/me`
 * projection (full → every token; scoped → only covered tokens; loading →
 * skeleton; failed → a loud retryable ErrorState), plugin nav entries + pages gate
 * on their optional `requiredCapabilities`, the eager plugin load pass skips for a
 * scoped session that cannot reach the registry route, and sign-out revokes the
 * server session before clearing local auth (quiet on the expected 404, loud on a
 * real failure).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PluginContext } from '@tai42/studio-sdk';
import type { MeProjection } from '@tai42/api-client';
import { __resetContributions, __resetPluginHostState } from '@tai42/studio-sdk/testing';

import { installServer, renderStudio, server, FULL_PROJECTION } from './test-harness';
import { FEATURE_TOKENS } from './routes';
import { TOKEN_REQUIREMENTS, contributionCovered, tokenCovered } from './token-requirements';

installServer();

beforeEach(() => {
  __resetContributions();
  __resetPluginHostState();
});

/** A scoped (`admin: false`) projection reaching exactly the given concrete routes. */
function scoped(paths: readonly string[]): MeProjection {
  return {
    user_id: 'u-scoped',
    owner_user_id: null,
    admin: false,
    scopes: [],
    routes: paths.map((path) => ({ path, methods: ['GET'] })),
    route_patterns: [],
    sub_mcp: [],
    tools: [],
    agents: [],
    mintable: false,
  };
}

/** Serve a specific `/api/auth/me` projection (overrides the harness default). */
function meHandler(projection: MeProjection): ReturnType<typeof http.get> {
  return http.get('*/api/auth/me', () => HttpResponse.json({ data: projection }));
}

const okPlugins = http.get('*/api/plugins', () => HttpResponse.json({ data: [] }));
// The Interactions page mounts a channels-catalog card; an empty list satisfies the
// strict unhandled-request guard while the SSE stream (harness) stays empty.
const okChannels = http.get('*/api/channels', () => HttpResponse.json({ data: { channels: [] } }));

/** Land authenticated on `/interactions` (whose nav is what these tests inspect). */
function landAuthed(): void {
  server.use(okPlugins, okChannels);
  renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });
}

describe('TOKEN_REQUIREMENTS map', () => {
  it('classifies every feature token exactly once (exhaustive, no strays)', () => {
    const keys = Object.keys(TOKEN_REQUIREMENTS).sort();
    expect(keys).toEqual([...FEATURE_TOKENS].sort());
  });

  it('tokenCovered: a full projection shows every token', () => {
    for (const token of FEATURE_TOKENS) {
      expect(tokenCovered(FULL_PROJECTION, token)).toBe(true);
    }
  });

  it('tokenCovered: a scoped projection shows a token only when its route is covered', () => {
    const projection = scoped(['/api/tools']);
    expect(tokenCovered(projection, 'tools')).toBe(true);
    // `/api/tools` is a prefix, so `/api/tools/tags` etc. are covered too.
    expect(tokenCovered(projection, 'agents')).toBe(false);
    // `settings` self-limits server-side, so it is always shown.
    expect(tokenCovered(projection, 'settings')).toBe(true);
  });

  it('contributionCovered: full shows all; absent ⇒ full-only; declared ⇒ any-of', () => {
    expect(contributionCovered(FULL_PROJECTION, undefined)).toBe(true);
    expect(contributionCovered(FULL_PROJECTION, { routes: ['/api/x'] })).toBe(true);
    const projection = scoped(['/api/special']);
    // Absent requirement is safe-by-default: hidden for a scoped session.
    expect(contributionCovered(projection, undefined)).toBe(false);
    expect(contributionCovered(projection, { routes: ['/api/special'] })).toBe(true);
    expect(contributionCovered(projection, { routes: ['/api/other'] })).toBe(false);
  });
});

describe('capability-gated nav', () => {
  it('a full projection renders every feature token (today’s nav)', async () => {
    landAuthed();
    // A representative spread across the sidebar.
    expect(await screen.findByRole('link', { name: 'Tools' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agents' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'System' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marketplace' })).toBeInTheDocument();
  });

  it('a scoped projection renders only covered tokens (plus always-on settings)', async () => {
    server.use(meHandler(scoped(['/api/tools', '/api/agents'])), okPlugins, okChannels);
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });

    expect(await screen.findByRole('link', { name: 'Tools' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agents' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    // Not covered → hidden, even though the page itself still renders by direct URL.
    expect(screen.queryByRole('link', { name: 'System' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Notifications' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Marketplace' })).toBeNull();
  });

  it('a minimal projection renders only always-on settings', async () => {
    server.use(meHandler(scoped([])), okChannels);
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });

    expect(await screen.findByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tools' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Agents' })).toBeNull();
  });

  it('a /me failure renders a loud retryable ErrorState, never an optimistic full nav', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let attempts = 0;
    server.use(
      http.get('*/api/auth/me', () => {
        attempts += 1;
        return attempts === 1
          ? HttpResponse.json({ error: 'boom' }, { status: 500 })
          : HttpResponse.json({ data: FULL_PROJECTION });
      }),
      okPlugins,
      okChannels,
    );
    const user = userEvent.setup();
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });

    // Fail closed: the loud error, and NOT the nav, is shown.
    expect(await screen.findByText(/Your access could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Tools' })).toBeNull();
    expect(spy).toHaveBeenCalled();

    // Retry re-fetches; the second attempt succeeds and the full nav appears.
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('link', { name: 'Tools' })).toBeInTheDocument();
    expect(attempts).toBe(2);
    spy.mockRestore();
  });
});

describe('route capability boundary (content-area gate)', () => {
  const okTools = http.get('*/api/tools', () => HttpResponse.json({ data: ['echo'] }));
  const okToolTags = http.get('*/api/tools/tags', () => HttpResponse.json({ data: [] }));

  const NOT_AVAILABLE = /This area isn't available for your session/;

  it('renders the page when the projection covers the route’s token', async () => {
    server.use(meHandler(scoped(['/api/tools'])), okTools, okToolTags);
    renderStudio({ initialPath: '/tools', sessionKey: 'k-cap' });

    // The Tools page renders (its heading), and the not-available panel is absent.
    expect(await screen.findByRole('heading', { name: 'Tools', level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
  });

  it('renders the page for a full projection (covers everything)', async () => {
    // A full projection also runs the plugin load pass (→ /api/plugins) and mounts the
    // interactions badge (inert SSE via the harness), so both are satisfied here.
    server.use(okTools, okToolTags, okPlugins);
    renderStudio({ initialPath: '/tools', sessionKey: 'k-cap' });

    expect(await screen.findByRole('heading', { name: 'Tools', level: 1 })).toBeInTheDocument();
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
  });

  it('shows the neutral not-available panel for an uncovered token (no redirect)', async () => {
    // The projection reaches tools but not system; a direct URL to /system renders the
    // static panel instead of the page (whose reads would 403) — and never redirects.
    server.use(meHandler(scoped(['/api/tools'])), okTools, okToolTags);
    const { studio } = renderStudio({ initialPath: '/system', sessionKey: 'k-cap' });

    expect(await screen.findByText(NOT_AVAILABLE)).toBeInTheDocument();
    // No redirect: the location is still /system (the landing route may itself be
    // uncovered, so a redirect would risk a loop).
    expect(studio.router.state.location.pathname).toBe('/system');
  });

  it('shows a content skeleton while the projection is still loading', async () => {
    // A /me that never resolves keeps the projection `loading`; the content area mirrors
    // the nav skeleton rather than rendering a page whose reads may 403.
    server.use(http.get('*/api/auth/me', () => new Promise(() => undefined)));
    renderStudio({ initialPath: '/tools', sessionKey: 'k-cap' });

    expect(await screen.findByTestId('route-content-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tools', level: 1 })).toBeNull();
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
  });

  it('renders nothing in the content area on a /me failure (nav ErrorState is the loud surface)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
    );
    renderStudio({ initialPath: '/tools', sessionKey: 'k-cap' });

    // The nav's retryable ErrorState shows; the content area is empty (no page, no panel).
    expect(await screen.findByText(/Your access could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Tools', level: 1 })).toBeNull();
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
    spy.mockRestore();
  });

  it('passes a /plugins/* path through (no token → the plugin surface gates itself)', async () => {
    // A path that maps to no feature token is passed through untouched: the plugin page
    // renders (and applies its own contribution gating), never the boundary’s panel.
    const manifest = {
      name: 'acme',
      version: '1.0.0',
      api_version: 1,
      entry: 'index.js',
      integrity: { 'index.js': 'sha384-abc' },
      contributions: { tool_panels: {}, pages: ['demo'], settings_tabs: [] },
    };
    server.use(
      http.get('*/api/plugins', () => HttpResponse.json({ data: [manifest] })),
      okChannels,
    );
    const importModule = vi.fn(() =>
      Promise.resolve({
        register: (ctx: PluginContext) => {
          ctx.registerPage({
            path: 'demo',
            title: 'Demo',
            component: () => <div>secret demo page</div>,
          });
        },
      }),
    );
    renderStudio({ initialPath: '/plugins/acme/demo', sessionKey: 'k-cap', importModule });

    expect(await screen.findByText('secret demo page')).toBeInTheDocument();
    expect(screen.queryByText(NOT_AVAILABLE)).toBeNull();
  });
});

describe('plugin capability gating', () => {
  function pluginManifest() {
    return {
      name: 'acme',
      version: '1.0.0',
      api_version: 1,
      entry: 'index.js',
      integrity: { 'index.js': 'sha384-abc' },
      contributions: { tool_panels: {}, pages: ['demo'], settings_tabs: [] },
    };
  }

  /** Register a page + nav entry, optionally with a capability requirement. */
  function register(required?: { routes: string[] }) {
    return (ctx: PluginContext): void => {
      ctx.registerPage({
        path: 'demo',
        title: 'Demo',
        component: () => <div>secret demo page</div>,
        ...(required ? { requiredCapabilities: required } : {}),
      });
      ctx.registerNavEntry({
        path: 'demo',
        title: 'Reference',
        ...(required ? { requiredCapabilities: required } : {}),
      });
    };
  }

  it('a full projection shows a plugin nav entry (with or without requiredCapabilities)', async () => {
    server.use(
      http.get('*/api/plugins', () => HttpResponse.json({ data: [pluginManifest()] })),
      okChannels,
    );
    const importModule = vi.fn(() =>
      Promise.resolve({ register: register({ routes: ['/api/special'] }) }),
    );
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap', importModule });

    expect(await screen.findByRole('link', { name: 'Reference' })).toBeInTheDocument();
  });

  it('a scoped session hides a plugin nav entry whose requiredCapabilities it lacks', async () => {
    // The projection reaches the registry route (so the pass LOADS) but not the
    // entry's required `/api/special`, so the entry is hidden — no error card.
    server.use(
      meHandler(scoped(['/api/plugins'])),
      http.get('*/api/plugins', () => HttpResponse.json({ data: [pluginManifest()] })),
      okChannels,
    );
    const importModule = vi.fn(() =>
      Promise.resolve({ register: register({ routes: ['/api/special'] }) }),
    );
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap', importModule });

    // Settings (always-on) confirms the scoped nav has rendered before we assert absence.
    await screen.findByRole('link', { name: 'Settings' });
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Reference' })).toBeNull();
    });
    expect(screen.queryByRole('navigation', { name: 'Plugins' })).toBeNull();
  });

  it('a scoped session shows a plugin nav entry whose requiredCapabilities it holds', async () => {
    server.use(
      meHandler(scoped(['/api/plugins', '/api/special'])),
      http.get('*/api/plugins', () => HttpResponse.json({ data: [pluginManifest()] })),
      okChannels,
    );
    const importModule = vi.fn(() =>
      Promise.resolve({ register: register({ routes: ['/api/special'] }) }),
    );
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap', importModule });

    expect(await screen.findByRole('link', { name: 'Reference' })).toBeInTheDocument();
  });

  it('a scoped session that cannot reach the registry route SKIPS the load pass (info, no error)', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    // No `/api/plugins` handler: if the loader fired it would 500 on an unhandled
    // request; the skip means it never fires.
    server.use(meHandler(scoped(['/api/tools'])), okChannels);
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });

    await screen.findByRole('link', { name: 'Tools' });
    await waitFor(() => {
      expect(info).toHaveBeenCalled();
    });
    expect(screen.queryByRole('navigation', { name: 'Plugins' })).toBeNull();
    info.mockRestore();
  });

  it('a plugin PAGE gated by requiredCapabilities the session lacks renders "Not available"', async () => {
    server.use(
      meHandler(scoped(['/api/plugins'])),
      http.get('*/api/plugins', () => HttpResponse.json({ data: [pluginManifest()] })),
      okChannels,
    );
    const importModule = vi.fn(() =>
      Promise.resolve({ register: register({ routes: ['/api/special'] }) }),
    );
    renderStudio({ initialPath: '/plugins/acme/demo', sessionKey: 'k-cap', importModule });

    expect(await screen.findByText(/Not available/)).toBeInTheDocument();
    expect(screen.queryByText('secret demo page')).toBeNull();
  });

  it('a plugin PAGE whose requiredCapabilities are covered renders normally', async () => {
    server.use(
      meHandler(scoped(['/api/plugins', '/api/special'])),
      http.get('*/api/plugins', () => HttpResponse.json({ data: [pluginManifest()] })),
      okChannels,
    );
    const importModule = vi.fn(() =>
      Promise.resolve({ register: register({ routes: ['/api/special'] }) }),
    );
    renderStudio({ initialPath: '/plugins/acme/demo', sessionKey: 'k-cap', importModule });

    expect(await screen.findByText('secret demo page')).toBeInTheDocument();
  });

  it('shows the boundary content skeleton while the projection is still loading (never the page)', async () => {
    // A /me that never resolves keeps the projection `loading`; the plugin page mirrors
    // the route boundary and shows the content skeleton, never the plugin's reads.
    server.use(
      http.get('*/api/auth/me', () => new Promise(() => undefined)),
      http.get('*/api/plugins', () => HttpResponse.json({ data: [pluginManifest()] })),
      okChannels,
    );
    const importModule = vi.fn(() =>
      Promise.resolve({ register: register({ routes: ['/api/special'] }) }),
    );
    renderStudio({ initialPath: '/plugins/acme/demo', sessionKey: 'k-cap', importModule });

    expect(await screen.findByTestId('route-content-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('secret demo page')).toBeNull();
    expect(screen.queryByText(/Not available/)).toBeNull();
  });

  it('renders nothing in the plugin content area on a projection failure (fail closed)', async () => {
    // The nav's loud retryable ErrorState is the single failure surface; the plugin
    // page fails closed to nothing rather than rendering fail-open.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json({ error: 'boom' }, { status: 500 })),
      http.get('*/api/plugins', () => HttpResponse.json({ data: [pluginManifest()] })),
      okChannels,
    );
    const importModule = vi.fn(() =>
      Promise.resolve({ register: register({ routes: ['/api/special'] }) }),
    );
    renderStudio({ initialPath: '/plugins/acme/demo', sessionKey: 'k-cap', importModule });

    expect(await screen.findByText(/Your access could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText('secret demo page')).toBeNull();
    expect(screen.queryByTestId('route-content-skeleton')).toBeNull();
    spy.mockRestore();
  });
});

describe('interactions badge gating', () => {
  const okTools = http.get('*/api/tools', () => HttpResponse.json({ data: ['echo'] }));
  const okToolTags = http.get('*/api/tools/tags', () => HttpResponse.json({ data: [] }));

  /** An inert interactions stream whose open can be observed. */
  function streamSpy(): ReturnType<typeof vi.fn> {
    async function* empty(): AsyncGenerator<never> {
      // no frames
    }
    return vi.fn(() => Promise.resolve(empty()));
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
