/**
 * The capability-gated shell nav: it renders from the caller's `/api/auth/me`
 * projection (full → every token; scoped → only covered tokens; loading → skeleton;
 * failed → a loud retryable ErrorState), and the content-area route boundary gates the
 * same way.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PluginContext } from '@tai42/studio-sdk';
import { __resetContributions, __resetPluginHostState } from '@tai42/studio-sdk/testing';

import { installServer, renderStudio, server, FULL_PROJECTION } from './test-harness';
import { FEATURE_TOKENS } from './routes';
import { TOKEN_REQUIREMENTS, contributionCovered, tokenCovered } from './token-requirements';
import { landAuthed, meHandler, okChannels, okPlugins, scoped } from './test-capabilities-support';

installServer();

beforeEach(() => {
  __resetContributions();
  __resetPluginHostState();
});

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

  it('tokenCovered: storage keys off the MANAGEMENT surface, not the always-mounted presence read', () => {
    // `/api/storage` (presence) is mounted in every deployment, so a projection that
    // reaches only it must NOT show the storage nav — the management page it opens
    // would error where no management surface is mounted. The token keys off the
    // management route `/api/storage/resources` instead.
    expect(tokenCovered(scoped(['/api/storage/resources']), 'storage')).toBe(true);
    expect(tokenCovered(scoped(['/api/storage']), 'storage')).toBe(false);
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
