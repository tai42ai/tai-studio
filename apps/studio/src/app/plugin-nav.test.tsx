/**
 * Plugin-contributed nav: entries + pages gate on their optional
 * `requiredCapabilities`, entries render in their targeted core section or the generic
 * Plugins section, and the eager load pass skips for a scoped session that cannot reach
 * the registry route.
 */
import type { NavEntrySection, PluginContext } from '@tai42/studio-sdk';
import { __resetContributions, __resetPluginHostState } from '@tai42/studio-sdk/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { meHandler, okChannels, scoped } from './test-capabilities-support';
import { installServer, renderStudio, server } from './test-harness';

installServer();

beforeEach(() => {
  __resetContributions();
  __resetPluginHostState();
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

  it('renders an undeclared plugin nav entry under the single generic Plugins section', async () => {
    landWithEntry();

    // The entry lands in the one generic "Plugins" section, whose header names its list;
    // the section is NOT headed by the plugin's raw id.
    const list = await screen.findByRole('list', { name: 'Plugins' });
    expect(within(list).getByRole('link', { name: 'Reference' })).toBeInTheDocument();
    // No per-plugin self-named section (headed by the raw plugin id), and no separate
    // "Plugins" navigation landmark.
    expect(screen.queryByRole('list', { name: 'acme' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Plugins' })).toBeNull();
    // It is not injected into a core section.
    const admin = within(screen.getByRole('list', { name: 'Administration' }));
    expect(admin.queryByRole('link', { name: 'Reference' })).toBeNull();
  });

  it('marks each Plugins-section entry with a per-entry host provenance badge (bare id → marketplace Installed tab)', async () => {
    landWithEntry();

    const list = await screen.findByRole('list', { name: 'Plugins' });
    // The badge is a shell-rendered link, named for a11y + hover. A bare plugin id is
    // NOT a marketplace "namespace/name" ref, so the badge must NOT carry the
    // `plugin` deep-link param — that would land the detail page on its
    // Malformed-reference ErrorState. It links to the marketplace Installed tab instead, where
    // installed plugins are listed. Plugins share the one section, so the badge is
    // per-entry (inside the list), never on a per-plugin header.
    const badge = within(list).getByRole('link', { name: 'Plugin: acme 1.0.0' });
    expect(badge.getAttribute('href')).toContain('/marketplace');
    expect(badge.getAttribute('href')).toContain('tab=installed');
    expect(badge.getAttribute('href')).not.toContain('plugin=');
    expect(badge).toHaveAttribute('title', 'Plugin: acme 1.0.0');
  });

  it('deep-links the per-entry provenance badge to the plugin row when the id is a namespace/name ref', async () => {
    landWithEntry(undefined, 'acme/widget');

    const list = await screen.findByRole('list', { name: 'Plugins' });
    // A "namespace/name" id IS a valid marketplace ref, so the badge carries the
    // `plugin` deep-link param — the detail page resolves it (no Malformed ErrorState).
    const badge = within(list).getByRole('link', { name: 'Plugin: acme/widget 1.0.0' });
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

  it('renders a non-core section value (Integrations) in the generic Plugins section', async () => {
    // `'Integrations'` is not a core section; it takes the ordinary unknown-section
    // path — the single generic Plugins section — never a core section, and never a
    // per-plugin self-named section headed by the raw id.
    landWithEntry('Integrations');

    const list = await screen.findByRole('list', { name: 'Plugins' });
    expect(within(list).getByRole('link', { name: 'Reference' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'acme' })).toBeNull();
    // Not injected into the former target core section.
    const connections = within(screen.getByRole('list', { name: 'Connections' }));
    expect(connections.queryByRole('link', { name: 'Reference' })).toBeNull();
  });

  it('falls back to the generic Plugins section for an unrecognised declared section value', async () => {
    landWithEntry('Nowhere');

    const list = await screen.findByRole('list', { name: 'Plugins' });
    expect(within(list).getByRole('link', { name: 'Reference' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'acme' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Plugins' })).toBeNull();
  });

  it('renders no Plugins section when every plugin entry declares a core section', async () => {
    // The only entry declares a core section, so nothing is left for the fallback section.
    landWithEntry('Administration');

    await screen.findByRole('list', { name: 'Administration' });
    expect(screen.queryByRole('list', { name: 'Plugins' })).toBeNull();
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

    const list = await screen.findByRole('list', { name: 'Plugins' });
    const rows = within(list)
      .getAllByRole('link')
      .filter((el) => el.classList.contains('tai-nav-link'))
      .map((el) => el.textContent);
    expect(rows).toEqual(['B', 'A', 'C']);
  });
});

describe('plugin nav — multiple plugins share the generic Plugins section', () => {
  function manifest(name: string, version: string) {
    return {
      name,
      version,
      api_version: 1,
      entry: 'index.js',
      integrity: { 'index.js': 'sha384-abc' },
      contributions: { tool_panels: {}, pages: ['p'], settings_tabs: [] },
    };
  }

  it('interleaves fallback entries from different plugins by `order` (then registration), each with its own badge', async () => {
    // Two plugins both contribute a single fallback nav entry. Registration order is
    // alpha then beta; weights alpha=2, beta=1 ⇒ beta's row precedes alpha's, proving
    // the sort spans plugins rather than grouping per plugin. The load pass loads them
    // in listing order, so both share the ONE "Plugins" section.
    server.use(
      http.get('*/api/plugins', () =>
        HttpResponse.json({ data: [manifest('alpha', '2.0.0'), manifest('beta', '3.0.0')] }),
      ),
      okChannels,
    );
    const registerFor = (title: string, order: number) => (ctx: PluginContext) => {
      ctx.registerPage({ path: 'p', title, component: () => <div>{title}</div> });
      ctx.registerNavEntry({ path: 'p', title, order });
    };
    // The loader eval order follows the listing; alpha (order 2) evals before beta (order 1).
    const importModule = vi.fn((url: string) =>
      Promise.resolve({
        register: url.includes('beta') ? registerFor('Beta page', 1) : registerFor('Alpha page', 2),
      }),
    );
    renderStudio({ initialPath: '/interactions', sessionKey: 'k-cap', importModule });

    const list = await screen.findByRole('list', { name: 'Plugins' });
    const rows = within(list)
      .getAllByRole('link')
      .filter((el) => el.classList.contains('tai-nav-link'))
      .map((el) => el.textContent);
    // Sorted across plugins by ascending order: beta (1) before alpha (2).
    expect(rows).toEqual(['Beta page', 'Alpha page']);
    // Each entry carries ITS OWN provenance badge naming its own plugin + version.
    expect(within(list).getByRole('link', { name: 'Plugin: alpha 2.0.0' })).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: 'Plugin: beta 3.0.0' })).toBeInTheDocument();
    // One shared section — no per-plugin self-named sections headed by the raw ids.
    expect(screen.queryByRole('list', { name: 'alpha' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'beta' })).toBeNull();
  });
});
