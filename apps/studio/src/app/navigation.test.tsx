/**
 * The shell's navigation contract: the `PATH` map binds every route token, and the
 * `NavigationContextValue` resolves tokens → hrefs (what an `AppLink` anchors to)
 * and drives real client-side transitions.
 */
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from '@tanstack/react-router';
import type { PluginContext, RouteSearch, RouteToken } from '@tai42/studio-sdk';
import { getPluginHostState } from '@tai42/studio-sdk/host';
import { __resetContributions, __resetPluginHostState } from '@tai42/studio-sdk/testing';

import { buildRouter } from './router';
import { createNavigation } from './navigation';
import { createPluginLoader } from './plugin-loader';
import { PATH } from './routes';
import { installServer, renderStudio, server } from './test-harness';

installServer();

function makeNav() {
  const loader = createPluginLoader({
    api: { listStudioPlugins: () => Promise.resolve([]) },
    importModule: () => Promise.resolve(undefined),
    loadStylesheet: () => Promise.resolve(() => undefined),
    onUnauthorized: () => undefined,
  });
  const router = buildRouter({
    plugins: loader,
    getAuth: () => ({
      token: null,
      isAuthenticated: false,
      login: () => undefined,
      logout: () => undefined,
    }),
  });
  return createNavigation(router);
}

describe('shell navigation', () => {
  it('resolvePath binds every RouteToken to its PATH entry', () => {
    const nav = makeNav();
    const tokens = Object.keys(PATH) as RouteToken[];
    for (const token of tokens) {
      const href = nav.resolvePath(token);
      expect(href).toBe(PATH[token]);
    }
  });

  it('resolvePath encodes typed search params into the href', () => {
    const nav = makeNav();
    expect(nav.resolvePath('tools', { tool: 'echo' })).toBe('/tools?tool=echo');
    expect(nav.resolvePath('connectors', { connection: 'c1' })).toBe('/connectors?connection=c1');
    expect(nav.resolvePath('templates', { template: 'welcome.md' })).toBe(
      '/templates?template=welcome.md',
    );
  });

  it('renders sidebar AppLinks with resolved hrefs and navigate drives the router', async () => {
    server.use(
      http.get('*/api/plugins', () => HttpResponse.json({ data: [] })),
      http.get('*/api/tools', () => HttpResponse.json({ data: [] })),
      http.get('*/api/tools/tags', () => HttpResponse.json({ data: [] })),
    );

    const user = userEvent.setup();
    // Land authenticated on /interactions (its page makes no GET on mount).
    const { studio } = renderStudio({ initialPath: '/interactions', sessionKey: 'k-nav' });

    const toolsLink = await screen.findByRole('link', { name: 'Tools' });
    expect(toolsLink).toHaveAttribute('href', '/tools');
    expect(screen.getByRole('link', { name: 'System' })).toHaveAttribute('href', '/system');

    await user.click(toolsLink);
    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/tools');
    });
  });
});

describe('shell plugin nav', () => {
  beforeEach(() => {
    __resetContributions();
    __resetPluginHostState();
  });

  interface NavManifestOptions {
    readonly pages?: string[];
  }

  function pluginManifest(options: NavManifestOptions = {}) {
    return {
      name: 'acme',
      version: '1.0.0',
      api_version: 1,
      entry: 'index.js',
      integrity: { 'index.js': 'sha384-abc' },
      contributions: {
        tool_panels: {},
        pages: options.pages ?? ['demo'],
        settings_tabs: [],
      },
    };
  }

  /** Serve one plugin manifest plus the read-only GETs the landed pages make. */
  function serveShell(pages?: string[]): void {
    server.use(
      http.get('*/api/plugins', () => HttpResponse.json({ data: [pluginManifest({ pages })] })),
      http.get('*/api/tools', () => HttpResponse.json({ data: [] })),
      http.get('*/api/tools/tags', () => HttpResponse.json({ data: [] })),
    );
  }

  const Icon = (): ReactElement => <svg data-testid="nav-icon-svg" />;

  function registerPageAndNav(withIcon: boolean) {
    return (ctx: PluginContext): void => {
      ctx.registerPage({ path: 'demo', title: 'Demo', component: () => <div>demo page</div> });
      ctx.registerNavEntry({
        path: 'demo',
        title: 'Reference',
        ...(withIcon ? { icon: Icon } : {}),
      });
    };
  }

  it('renders a registered nav entry in the Plugins nav with its icon box and href', async () => {
    serveShell();
    const importModule = vi.fn(() => Promise.resolve({ register: registerPageAndNav(true) }));

    renderStudio({ initialPath: '/interactions', sessionKey: 'k-nav', importModule });

    const link = await screen.findByRole('link', { name: 'Reference' });
    expect(link).toHaveAttribute('href', '/plugins/acme/demo');
    // The Plugins landmark exists and owns the link.
    const pluginsNav = screen.getByRole('navigation', { name: 'Plugins' });
    expect(within(pluginsNav).getByRole('link', { name: 'Reference' })).toBe(link);
    // The icon renders in an aria-hidden slot (its accessible name stays the title).
    const iconBox = link.querySelector('[aria-hidden="true"]');
    expect(iconBox).not.toBeNull();
    expect(iconBox?.querySelector('[data-testid="nav-icon-svg"]')).not.toBeNull();
    // Core nav is unaffected.
    expect(screen.getByRole('link', { name: 'Tools' })).toHaveAttribute('href', '/tools');
  });

  it('gives the plugin nav icon box NO inline margin, so the icon gap is the row gap', async () => {
    serveShell();
    const importModule = vi.fn(() => Promise.resolve({ register: registerPageAndNav(true) }));

    renderStudio({ initialPath: '/interactions', sessionKey: 'k-nav', importModule });

    const link = await screen.findByRole('link', { name: 'Reference' });
    const iconBox = link.querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(iconBox).not.toBeNull();
    // `.tai-nav-link` is a flex row that already sets the icon-to-label gap from
    // the spacing scale; any margin beside the icon is ADDITIVE and would set the
    // plugin row apart from every other nav row. The declaration is read off the
    // element rather than checked property by property, so a logical or shorthand
    // margin is caught too.
    const declared = Array.from(iconBox?.style ?? []);
    expect(declared.filter((property) => property.startsWith('margin'))).toEqual([]);
    // The box IS styled inline, so an empty declaration cannot pass vacuously.
    expect(declared.length).toBeGreaterThan(0);
  });

  it('drives the SDK plugin host state to ready as the load pass commits the nav entry', async () => {
    serveShell();
    const importModule = vi.fn(() => Promise.resolve({ register: registerPageAndNav(true) }));

    renderStudio({ initialPath: '/interactions', sessionKey: 'k-nav', importModule });

    // The nav link renders only once the pass commits; the mirrored host state that
    // feature pages read (via the SDK, not this app shell) reaches 'ready' with it.
    await screen.findByRole('link', { name: 'Reference' });
    expect(getPluginHostState().status).toBe('ready');
  });

  it('renders a text-only nav entry (no icon box) when the entry has no icon', async () => {
    serveShell();
    const importModule = vi.fn(() => Promise.resolve({ register: registerPageAndNav(false) }));

    renderStudio({ initialPath: '/interactions', sessionKey: 'k-nav', importModule });

    const link = await screen.findByRole('link', { name: 'Reference' });
    expect(link.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('marks the plugin nav link aria-current on its own active path', async () => {
    serveShell();
    const importModule = vi.fn(() => Promise.resolve({ register: registerPageAndNav(true) }));

    renderStudio({ initialPath: '/plugins/acme/demo', sessionKey: 'k-nav', importModule });

    const link = await screen.findByRole('link', { name: 'Reference' });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('omits the Plugins nav entirely when no plugin registered a nav entry', async () => {
    serveShell();
    // The plugin registers a page but NO nav entry.
    const importModule = vi.fn(() =>
      Promise.resolve({
        register: (ctx: PluginContext) => {
          ctx.registerPage({ path: 'demo', title: 'Demo', component: () => <div>demo page</div> });
        },
      }),
    );

    renderStudio({ initialPath: '/interactions', sessionKey: 'k-nav', importModule });

    // Wait for the load pass to settle (core nav is always present).
    const toolsLink = await screen.findByRole('link', { name: 'Tools' });
    expect(toolsLink).toBeInTheDocument();
    // No empty labeled landmark, no stray plugin link.
    expect(screen.queryByRole('navigation', { name: 'Plugins' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Reference' })).toBeNull();
  });
});

describe('observability search parsing', () => {
  async function loadObservabilitySearch(url: string): Promise<RouteSearch<'observability'>> {
    const loader = createPluginLoader({
      api: { listStudioPlugins: () => Promise.resolve([]) },
      importModule: () => Promise.resolve(undefined),
      loadStylesheet: () => Promise.resolve(() => undefined),
      onUnauthorized: () => undefined,
    });
    const router = buildRouter({
      plugins: loader,
      getAuth: () => ({
        token: 't',
        isAuthenticated: true,
        login: () => undefined,
        logout: () => undefined,
      }),
      history: createMemoryHistory({ initialEntries: [url] }),
    });
    await router.load();
    // Each route's `validateSearch` output lands on its match; the leaf match is
    // the observability route, whose `search` is the typed, parsed shape.
    const leaf = router.state.matches.at(-1);
    const search: unknown = leaf?.search;
    return search as RouteSearch<'observability'>;
  }

  it('parses a tab + filters URL into the typed search', async () => {
    const search = await loadObservabilitySearch(
      '/observability?tab=tracing&from=24h&to=2026-01-01T00:00:00Z&tags=a,b' +
        '&status=error&minCost=1.5&maxTokens=1000&minLatencyMs=50' +
        '&sort=cost&dir=asc&trace=t-123',
    );
    expect(search).toMatchObject({
      tab: 'tracing',
      from: '24h',
      to: '2026-01-01T00:00:00Z',
      tags: ['a', 'b'],
      status: 'error',
      minCost: 1.5,
      maxTokens: 1000,
      minLatencyMs: 50,
      sort: 'cost',
      dir: 'asc',
      trace: 't-123',
    });
  });

  it('accepts tags as a JSON array', async () => {
    const search = await loadObservabilitySearch('/observability?tags=["x","y"]');
    expect(search.tags).toEqual(['x', 'y']);
  });

  it('drops garbage numerics and invalid enums without throwing', async () => {
    const search = await loadObservabilitySearch(
      '/observability?tab=bogus&status=maybe&minCost=abc&sort=nope&dir=sideways',
    );
    expect(search.tab).toBeUndefined();
    expect(search.status).toBeUndefined();
    expect(search.minCost).toBeUndefined();
    expect(search.sort).toBeUndefined();
    expect(search.dir).toBeUndefined();
  });

  it('treats a bare /observability as valid empty search', async () => {
    const search = await loadObservabilitySearch('/observability');
    expect(search.tab).toBeUndefined();
    expect(search.tags).toBeUndefined();
    expect(search.trace).toBeUndefined();
  });
});
