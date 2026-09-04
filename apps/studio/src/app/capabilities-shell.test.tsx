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
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NavEntrySection, PluginContext } from '@tai42/studio-sdk';
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

  it('tokenCovered: connectors is reachable via EITHER /api/connectors or /api/mcp-status', () => {
    // The unified Connectors page hosts the MCP config surface, whose own doors are
    // /api/mcp-status etc. A session holding only the MCP doors must still see the
    // Connectors nav entry, so the requirement is an anyOf over both route families.
    expect(tokenCovered(scoped(['/api/connectors']), 'connectors')).toBe(true);
    expect(tokenCovered(scoped(['/api/mcp-status']), 'connectors')).toBe(true);
    expect(tokenCovered(scoped(['/api/tools']), 'connectors')).toBe(false);
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

  it('renders Connectors for a session holding only the MCP doors (not /api/connectors)', async () => {
    // The Connectors page now hosts the MCP config surface; a session that reaches only
    // /api/mcp-status must keep the nav entry discoverable even without /api/connectors.
    server.use(meHandler(scoped(['/api/mcp-status'])), okPlugins, okChannels);
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });

    expect(await screen.findByRole('link', { name: 'Connectors' })).toBeInTheDocument();
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

describe('grouped nav structure', () => {
  const SECTIONS = [
    'Capabilities',
    'Connections',
    'Triggers',
    'Activity',
    'Administration',
  ] as const;

  it('leads with Dashboard, then renders the five sections in order with their headers', async () => {
    landAuthed();
    const nav = await screen.findByRole('navigation', { name: 'Primary' });

    // The section headers appear in the approved order.
    const headers = Array.from(nav.querySelectorAll('.tai-nav-section-header')).map(
      (el) => el.textContent,
    );
    expect(headers).toEqual([...SECTIONS]);

    // Each header names its own item list (accessible group, not a fake link).
    for (const label of SECTIONS) {
      expect(within(nav).getByRole('list', { name: label })).toBeInTheDocument();
    }

    // Dashboard leads: its row precedes the first section header in the DOM.
    const dashboard = within(nav).getByRole('link', { name: 'Dashboard' });
    const firstHeader = nav.querySelector('.tai-nav-section-header');
    expect(firstHeader).not.toBeNull();
    expect(
      dashboard.compareDocumentPosition(firstHeader as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('places each token under its section (a representative from each)', async () => {
    landAuthed();
    await screen.findByRole('link', { name: 'Tools' });
    // A representative link lives inside the list named by its section header.
    const inSection = (section: string, link: string): HTMLElement =>
      within(screen.getByRole('list', { name: section })).getByRole('link', { name: link });
    expect(inSection('Capabilities', 'Templates')).toBeInTheDocument();
    expect(inSection('Connections', 'Connectors')).toBeInTheDocument();
    expect(inSection('Connections', 'Served endpoints')).toBeInTheDocument();
    expect(inSection('Triggers', 'Scheduling')).toBeInTheDocument();
    expect(inSection('Activity', 'Conversations')).toBeInTheDocument();
    expect(inSection('Administration', 'Marketplace')).toBeInTheDocument();
  });

  it('hides a section whose items are all filtered out (no empty labelled header)', async () => {
    // Only `/api/tools` is reachable: Capabilities has a covered item (Tools), and
    // Administration shows via always-on Settings — Integrations and Activity have
    // no covered item, and Dashboard's route is uncovered.
    server.use(meHandler(scoped(['/api/tools'])), okPlugins, okChannels);
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });

    await screen.findByRole('link', { name: 'Tools' });
    expect(screen.getByText('Capabilities')).toBeInTheDocument();
    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();

    // Fail-closed grouping: no header AND no list for a fully-filtered section.
    expect(screen.queryByText('Connections')).toBeNull();
    expect(screen.queryByText('Triggers')).toBeNull();
    expect(screen.queryByText('Activity')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Connections' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Triggers' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Activity' })).toBeNull();

    // The standalone Dashboard row respects the filter too.
    expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();
  });

  it('shows the Dashboard lead row when its route is covered', async () => {
    server.use(meHandler(scoped(['/api/observability'])), okPlugins, okChannels);
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap' });

    // Dashboard leads; the only other visible row is always-on Settings.
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.queryByText('Capabilities')).toBeNull();
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

  /** Register a page + nav entry, optionally with a capability requirement and a
   * declared sidebar section (a raw string, so an unknown value can be exercised). */
  function register(required?: { routes: string[] }, section?: string) {
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
        ...(section !== undefined ? { section: section as NavEntrySection } : {}),
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

describe('plugin nav sections', () => {
  function pluginManifest(name = 'acme') {
    return {
      name,
      version: '1.0.0',
      api_version: 1,
      entry: 'index.js',
      integrity: { 'index.js': 'sha384-abc' },
      contributions: { tool_panels: {}, pages: ['demo'], settings_tabs: [] },
    };
  }

  /** Register a page + nav entry titled "Reference", optionally declaring a section. */
  function register(section?: string) {
    return (ctx: PluginContext): void => {
      ctx.registerPage({
        path: 'demo',
        title: 'Demo',
        component: () => <div>demo page</div>,
      });
      ctx.registerNavEntry({
        path: 'demo',
        title: 'Reference',
        ...(section !== undefined ? { section: section as NavEntrySection } : {}),
      });
    };
  }

  /** The nav-row links (not the provenance badge) inside a list, in DOM order. */
  function rowTexts(list: HTMLElement): (string | null)[] {
    return within(list)
      .getAllByRole('link')
      .filter((el) => el.classList.contains('tai-nav-link'))
      .map((el) => el.textContent);
  }

  /** Land on `/interactions` with one full-projection plugin nav entry loaded. */
  function landWithEntry(section?: string, pluginName = 'acme'): void {
    server.use(
      http.get('*/api/plugins', () => HttpResponse.json({ data: [pluginManifest(pluginName)] })),
      okChannels,
    );
    const importModule = vi.fn(() => Promise.resolve({ register: register(section) }));
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap', importModule });
  }

  it('renders an undeclared plugin nav entry as its own self-named section (no Plugins wrapper)', async () => {
    landWithEntry();

    // The section is headed by the plugin's display name (its id) and names its list.
    const list = await screen.findByRole('list', { name: 'acme' });
    expect(within(list).getByRole('link', { name: 'Reference' })).toBeInTheDocument();
    // No generic "Plugins" wrapper landmark, section, or header.
    expect(screen.queryByRole('navigation', { name: 'Plugins' })).toBeNull();
    expect(screen.queryByText('Plugins')).toBeNull();
    // It is not injected into a core section.
    const admin = within(screen.getByRole('list', { name: 'Administration' }));
    expect(admin.queryByRole('link', { name: 'Reference' })).toBeNull();
  });

  it('marks a self-named section header with a host provenance badge (bare id → marketplace Installed tab)', async () => {
    landWithEntry();

    await screen.findByRole('list', { name: 'acme' });
    // The badge is a shell-rendered link, named for a11y + hover. A bare plugin id is
    // NOT a marketplace "namespace/name" ref, so the badge must NOT carry the
    // `plugin` deep-link param — that would land the detail page on its
    // Malformed-reference ErrorState. It links to the marketplace Installed tab instead, where
    // installed plugins are listed.
    const badge = screen.getByRole('link', { name: 'Plugin: acme 1.0.0' });
    expect(badge.getAttribute('href')).toContain('/marketplace');
    expect(badge.getAttribute('href')).toContain('tab=installed');
    expect(badge.getAttribute('href')).not.toContain('plugin=');
    expect(badge).toHaveAttribute('title', 'Plugin: acme 1.0.0');
    // The badge sits on the header, NOT duplicated onto the entry row.
    const list = screen.getByRole('list', { name: 'acme' });
    expect(within(list).queryByRole('link', { name: 'Plugin: acme 1.0.0' })).toBeNull();
  });

  it('deep-links the provenance badge to the plugin row when the id is a namespace/name ref', async () => {
    landWithEntry(undefined, 'acme/widget');

    await screen.findByRole('list', { name: 'acme/widget' });
    // A "namespace/name" id IS a valid marketplace ref, so the badge carries the
    // `plugin` deep-link param — the detail page resolves it (no Malformed ErrorState).
    const badge = screen.getByRole('link', { name: 'Plugin: acme/widget 1.0.0' });
    const href = badge.getAttribute('href');
    expect(href).toMatch(/^\/marketplace\?/);
    expect(href).toContain('plugin=');
  });

  it('renders a core-section plugin entry after the core rows, each carrying a per-entry badge', async () => {
    landWithEntry('Administration');

    const admin = await screen.findByRole('list', { name: 'Administration' });
    // The plugin row lands in Administration, ordered after every core row.
    expect(rowTexts(admin)).toEqual([
      'Settings',
      'Storage',
      'Marketplace',
      'Manifest',
      'System',
      'Reference',
    ]);
    // The injected entry carries its OWN provenance badge (per-entry, inside the list).
    expect(within(admin).getByRole('link', { name: 'Plugin: acme 1.0.0' })).toBeInTheDocument();
    // No separate self-named section is created for a declared entry.
    expect(screen.queryByRole('list', { name: 'acme' })).toBeNull();
  });

  it('renders a retired section value (Integrations) in the plugin self-named section', async () => {
    // `'Integrations'` is no longer a core section; it takes the ordinary unknown-section
    // path — the plugin's own self-named section — never a core section.
    landWithEntry('Integrations');

    const list = await screen.findByRole('list', { name: 'acme' });
    expect(within(list).getByRole('link', { name: 'Reference' })).toBeInTheDocument();
    // Not injected into the former target core section.
    const connections = within(screen.getByRole('list', { name: 'Connections' }));
    expect(connections.queryByRole('link', { name: 'Reference' })).toBeNull();
  });

  it('falls back to a self-named section for an unrecognised declared section value', async () => {
    landWithEntry('Nowhere');

    const list = await screen.findByRole('list', { name: 'acme' });
    expect(within(list).getByRole('link', { name: 'Reference' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Plugins' })).toBeNull();
  });

  it('renders no self-named section when every plugin entry declares a core section', async () => {
    // The only entry declares a core section, so nothing is left to self-name.
    landWithEntry('Administration');

    await screen.findByRole('list', { name: 'Administration' });
    expect(screen.queryByRole('list', { name: 'acme' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Plugins' })).toBeNull();
  });
});

describe('plugin nav ordering', () => {
  function pluginManifest() {
    return {
      name: 'acme',
      version: '2.0.0',
      api_version: 1,
      entry: 'index.js',
      integrity: { 'index.js': 'sha384-abc' },
      contributions: { tool_panels: {}, pages: ['a', 'b', 'c'], settings_tabs: [] },
    };
  }

  it('orders entries within a section by `order` (undefined last, then registration order)', async () => {
    server.use(
      http.get('*/api/plugins', () => HttpResponse.json({ data: [pluginManifest()] })),
      okChannels,
    );
    const register = (ctx: PluginContext): void => {
      ctx.registerPage({ path: 'a', title: 'A', component: () => <div>a</div> });
      ctx.registerPage({ path: 'b', title: 'B', component: () => <div>b</div> });
      ctx.registerPage({ path: 'c', title: 'C', component: () => <div>c</div> });
      // Registration order A, B, C. Weights A=2, B=1, C=absent ⇒ B (1), A (2), C last.
      ctx.registerNavEntry({ path: 'a', title: 'A', order: 2 });
      ctx.registerNavEntry({ path: 'b', title: 'B', order: 1 });
      ctx.registerNavEntry({ path: 'c', title: 'C' });
    };
    const importModule = vi.fn(() => Promise.resolve({ register }));
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap', importModule });

    const list = await screen.findByRole('list', { name: 'acme' });
    const rows = within(list)
      .getAllByRole('link')
      .filter((el) => el.classList.contains('tai-nav-link'))
      .map((el) => el.textContent);
    expect(rows).toEqual(['B', 'A', 'C']);
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
