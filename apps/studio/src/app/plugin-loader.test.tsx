/**
 * The Studio-plugin loader: registry fetch → dynamic import → `register(context)`
 * stages and commits contributions; a version mismatch, a genuine load failure, a
 * bundle with no `register` export, and a `register` that throws each render a LOUD
 * error card; a 401 during the registry fetch is a login redirect, never an error
 * card; and a cold deep link to a plugin page resolves through the gate (no 404 on
 * first paint).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { type PluginContext } from '@tai42/studio-sdk';
import { getContributions } from '@tai42/studio-sdk/host';
import { __resetContributions } from '@tai42/studio-sdk/testing';

import { installServer, renderStudio, server } from './test-harness';

installServer();

beforeEach(() => {
  __resetContributions();
});

interface ManifestOverrides {
  readonly api_version?: number;
  readonly pages?: string[];
  readonly integrity?: Record<string, string>;
}

function manifest(overrides: ManifestOverrides = {}) {
  return {
    name: 'acme',
    version: '1.0.0',
    api_version: overrides.api_version ?? 1,
    entry: 'index.js',
    integrity: overrides.integrity ?? { 'index.js': 'sha384-abc' },
    contributions: {
      tool_panels: {},
      pages: overrides.pages ?? ['dashboard'],
      settings_tabs: [],
    },
  };
}

/** A module whose `register` runs `body` against the host-bound context. */
function pluginModule(body: (ctx: PluginContext) => void | Promise<void> = () => undefined) {
  return Promise.resolve({ register: body });
}

const AUTH = { sessionKey: 'plugin-key' } as const;

describe('studio-plugin loader', () => {
  it('fetches the registry, imports each bundle, and registers its contributions', async () => {
    server.use(http.get('*/api/plugins', () => HttpResponse.json({ data: [manifest()] })));

    const importModule = vi.fn((_url: string) =>
      pluginModule((ctx) => {
        ctx.registerPage({
          path: 'dashboard',
          title: 'Dashboard',
          component: () => <div>acme dashboard</div>,
        });
        ctx.registerToolPanel({ toolName: 'echo', component: () => <div>echo panel</div> });
      }),
    );

    const { studio } = renderStudio({
      ...AUTH,
      initialPath: '/plugins/acme/dashboard',
      importModule,
    });

    expect(await screen.findByText('acme dashboard')).toBeInTheDocument();
    expect(importModule).toHaveBeenCalledWith('/api/plugins/acme/studio/index.js');
    expect(getContributions().toolPanels.has('echo')).toBe(true);
    expect(studio.router.state.location.pathname).toBe('/plugins/acme/dashboard');
  });

  it('resolves same-path pages by owning plugin (no cross-plugin collision)', async () => {
    const acme = manifest();
    const globex = { ...manifest(), name: 'globex' };
    server.use(http.get('*/api/plugins', () => HttpResponse.json({ data: [acme, globex] })));

    // Both plugins register the SAME path; the registry stamps each page with its
    // owning plugin, so the URL's pluginId selects the right one.
    const importModule = vi.fn((url: string) => {
      const label = url.includes('/globex/') ? 'globex home' : 'acme home';
      return pluginModule((ctx) => {
        ctx.registerPage({
          path: 'dashboard',
          title: 'Dashboard',
          component: () => <div>{label}</div>,
        });
      });
    });

    renderStudio({ ...AUTH, initialPath: '/plugins/globex/dashboard', importModule });

    // globex's page renders — NOT acme's, which registered the same path first.
    expect(await screen.findByText('globex home')).toBeInTheDocument();
    expect(screen.queryByText('acme home')).not.toBeInTheDocument();
  });

  it('renders a loud error card on a Studio-plugin API version mismatch (never imports it)', async () => {
    server.use(
      http.get('*/api/plugins', () => HttpResponse.json({ data: [manifest({ api_version: 0 })] })),
    );
    const importModule = vi.fn(() => pluginModule());

    renderStudio({ ...AUTH, initialPath: '/plugins/acme/dashboard', importModule });

    // Target the plugin error card by its text (the integrity banner is also an alert).
    const card = await screen.findByText(/acme.*failed to load/i);
    expect(card).toHaveTextContent(/rebuilt/i);
    expect(importModule).not.toHaveBeenCalled();
  });

  it('renders a loud error card when a bundle fails to load', async () => {
    server.use(http.get('*/api/plugins', () => HttpResponse.json({ data: [manifest()] })));
    const importModule = vi.fn(() => Promise.reject(new Error('integrity mismatch')));

    renderStudio({ ...AUTH, initialPath: '/plugins/acme/dashboard', importModule });

    const card = await screen.findByText(/acme.*failed to load/i);
    expect(card).toHaveTextContent(/integrity mismatch/i);
  });

  it('renders a loud error card when a bundle exports no register function', async () => {
    server.use(http.get('*/api/plugins', () => HttpResponse.json({ data: [manifest()] })));
    // A bundle that resolves to a module WITHOUT a `register` entry is a broken
    // plugin, not a silent no-op — the loader must surface it loudly.
    const importModule = vi.fn(() => Promise.resolve({ default: 'not a register export' }));

    renderStudio({ ...AUTH, initialPath: '/plugins/acme/dashboard', importModule });

    const card = await screen.findByText(/acme.*failed to load/i);
    expect(card).toHaveTextContent(/does not export a register\(context\) function/i);
  });

  it('renders a loud error card and registers nothing when a bundle register throws', async () => {
    server.use(http.get('*/api/plugins', () => HttpResponse.json({ data: [manifest()] })));
    // The register stages a page and a panel, then throws — buffer-then-commit
    // means NONE of them land, and the failure surfaces as a loud card.
    const importModule = vi.fn(() =>
      pluginModule((ctx) => {
        ctx.registerPage({
          path: 'dashboard',
          title: 'Dashboard',
          component: () => <div>acme dashboard</div>,
        });
        ctx.registerToolPanel({ toolName: 'echo', component: () => <div>echo</div> });
        throw new Error('register blew up');
      }),
    );

    renderStudio({ ...AUTH, initialPath: '/plugins/acme/dashboard', importModule });

    const card = await screen.findByText(/acme.*failed to load/i);
    expect(card).toHaveTextContent(/register blew up/i);
    // Nothing the failed register staged was committed.
    expect(getContributions().pages).toHaveLength(0);
    expect(getContributions().toolPanels.has('echo')).toBe(false);
  });

  it('renders a loud error card and registers nothing when an async register throws after an await', async () => {
    server.use(http.get('*/api/plugins', () => HttpResponse.json({ data: [manifest()] })));
    // The async register stages a page and a panel across an await, then rejects.
    // The loader awaits `loadPlugin`, so the rejection is caught as a loud card and
    // NONE of the staged contributions commit — no unhandled rejection, no leak.
    const importModule = vi.fn(() =>
      pluginModule(async (ctx) => {
        ctx.registerPage({
          path: 'dashboard',
          title: 'Dashboard',
          component: () => <div>acme dashboard</div>,
        });
        await Promise.resolve();
        ctx.registerToolPanel({ toolName: 'echo', component: () => <div>echo</div> });
        await Promise.resolve();
        throw new Error('async register blew up');
      }),
    );

    renderStudio({ ...AUTH, initialPath: '/plugins/acme/dashboard', importModule });

    const card = await screen.findByText(/acme.*failed to load/i);
    expect(card).toHaveTextContent(/async register blew up/i);
    expect(getContributions().pages).toHaveLength(0);
    expect(getContributions().toolPanels.has('echo')).toBe(false);
  });

  it('a 401 during the registry fetch is a login redirect, NOT an error card', async () => {
    server.use(
      http.get('*/api/plugins', () =>
        HttpResponse.json({ error: 'unauthorized' }, { status: 401 }),
      ),
    );
    const importModule = vi.fn(() => pluginModule());

    const { studio } = renderStudio({
      ...AUTH,
      initialPath: '/plugins/acme/dashboard',
      importModule,
    });

    await waitFor(() => {
      expect(studio.router.state.location.pathname).toBe('/login');
    });
    expect(screen.queryByText(/failed to load/i)).toBeNull();
    expect(importModule).not.toHaveBeenCalled();
  });

  it('a 403 during the registry fetch is ABSENCE, NOT an error card', async () => {
    // The registry route is outside this session's capabilities: the pass completes
    // empty, so the deep-linked plugin page falls through to its neutral EmptyState
    // rather than the loud "registry could not be loaded" card.
    server.use(
      http.get('*/api/plugins', () => HttpResponse.json({ error: 'forbidden' }, { status: 403 })),
    );
    const importModule = vi.fn(() => pluginModule());

    renderStudio({ ...AUTH, initialPath: '/plugins/acme/dashboard', importModule });

    expect(await screen.findByText(/Page not found/i)).toBeInTheDocument();
    expect(screen.queryByText(/registry could not be loaded/i)).toBeNull();
    expect(importModule).not.toHaveBeenCalled();
  });

  it('renders a loud not-found card when no page is registered for the path', async () => {
    server.use(
      http.get('*/api/plugins', () => HttpResponse.json({ data: [manifest({ pages: [] })] })),
    );
    const importModule = vi.fn(() => pluginModule());

    renderStudio({ ...AUTH, initialPath: '/plugins/acme/missing', importModule });

    expect(await screen.findByText(/Page not found/i)).toBeInTheDocument();
  });

  it('commits registered nav entries readable from the registry after the pass', async () => {
    server.use(http.get('*/api/plugins', () => HttpResponse.json({ data: [manifest()] })));
    const importModule = vi.fn(() =>
      pluginModule((ctx) => {
        ctx.registerPage({
          path: 'dashboard',
          title: 'Dashboard',
          component: () => <div>acme dashboard</div>,
        });
        ctx.registerNavEntry({ path: 'dashboard', title: 'Dashboard' });
      }),
    );

    renderStudio({ ...AUTH, initialPath: '/plugins/acme/dashboard', importModule });

    expect(await screen.findByText('acme dashboard')).toBeInTheDocument();
    const entries = getContributions().navEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ pluginId: 'acme', path: 'dashboard' });
  });

  it('injects manifest .css assets (sorted, exact url+integrity) BEFORE importing the JS', async () => {
    server.use(
      http.get('*/api/plugins', () =>
        HttpResponse.json({
          data: [
            manifest({
              integrity: {
                'index.js': 'sha384-js',
                'b.css': 'sha384-bbb',
                'a.css': 'sha384-aaa',
              },
            }),
          ],
        }),
      ),
    );

    const order: string[] = [];
    const loadStylesheet = vi.fn((url: string) => {
      order.push(`css:${url}`);
      return Promise.resolve(() => undefined);
    });
    const importModule = vi.fn((url: string) => {
      order.push(`import:${url}`);
      return pluginModule((ctx) => {
        ctx.registerPage({
          path: 'dashboard',
          title: 'Dashboard',
          component: () => <div>acme dashboard</div>,
        });
      });
    });

    renderStudio({
      ...AUTH,
      initialPath: '/plugins/acme/dashboard',
      importModule,
      loadStylesheet,
    });

    expect(await screen.findByText('acme dashboard')).toBeInTheDocument();
    // Lexicographic css order, each with its own integrity value, then the JS.
    expect(order).toEqual([
      'css:/api/plugins/acme/studio/a.css',
      'css:/api/plugins/acme/studio/b.css',
      'import:/api/plugins/acme/studio/index.js',
    ]);
    expect(loadStylesheet).toHaveBeenNthCalledWith(
      1,
      '/api/plugins/acme/studio/a.css',
      'sha384-aaa',
    );
    expect(loadStylesheet).toHaveBeenNthCalledWith(
      2,
      '/api/plugins/acme/studio/b.css',
      'sha384-bbb',
    );
  });

  it('never calls loadStylesheet for a plugin with no .css assets', async () => {
    server.use(http.get('*/api/plugins', () => HttpResponse.json({ data: [manifest()] })));
    const loadStylesheet = vi.fn(() => Promise.resolve(() => undefined));
    const importModule = vi.fn(() =>
      pluginModule((ctx) => {
        ctx.registerPage({
          path: 'dashboard',
          title: 'Dashboard',
          component: () => <div>acme dashboard</div>,
        });
      }),
    );

    renderStudio({
      ...AUTH,
      initialPath: '/plugins/acme/dashboard',
      importModule,
      loadStylesheet,
    });

    expect(await screen.findByText('acme dashboard')).toBeInTheDocument();
    expect(loadStylesheet).not.toHaveBeenCalled();
  });

  it('a stylesheet failure is a loud error card: skips the JS import and removes injected links', async () => {
    server.use(
      http.get('*/api/plugins', () =>
        HttpResponse.json({
          data: [
            manifest({
              integrity: {
                'index.js': 'sha384-js',
                'a.css': 'sha384-aaa',
                'b.css': 'sha384-bbb',
              },
            }),
          ],
        }),
      ),
    );

    const removeA = vi.fn();
    // a.css injects (returns a remover); b.css fails its integrity check.
    const loadStylesheet = vi.fn((url: string) =>
      url.endsWith('a.css')
        ? Promise.resolve(removeA)
        : Promise.reject(new Error('integrity mismatch on b.css')),
    );
    const importModule = vi.fn(() => pluginModule());

    renderStudio({
      ...AUTH,
      initialPath: '/plugins/acme/dashboard',
      importModule,
      loadStylesheet,
    });

    const card = await screen.findByText(/acme.*failed to load/i);
    expect(card).toHaveTextContent(/integrity mismatch on b\.css/i);
    // The JS bundle is never imported, and the already-injected a.css is removed.
    expect(importModule).not.toHaveBeenCalled();
    expect(removeA).toHaveBeenCalledTimes(1);
  });

  it('a register that throws AFTER css injection removes the links and commits nothing', async () => {
    server.use(
      http.get('*/api/plugins', () =>
        HttpResponse.json({
          data: [manifest({ integrity: { 'index.js': 'sha384-js', 'a.css': 'sha384-aaa' } })],
        }),
      ),
    );

    const removeA = vi.fn();
    const loadStylesheet = vi.fn(() => Promise.resolve(removeA));
    const importModule = vi.fn(() =>
      pluginModule((ctx) => {
        ctx.registerPage({
          path: 'dashboard',
          title: 'Dashboard',
          component: () => <div>acme dashboard</div>,
        });
        throw new Error('register blew up after css');
      }),
    );

    renderStudio({
      ...AUTH,
      initialPath: '/plugins/acme/dashboard',
      importModule,
      loadStylesheet,
    });

    const card = await screen.findByText(/acme.*failed to load/i);
    expect(card).toHaveTextContent(/register blew up after css/i);
    // The injected stylesheet is detached and nothing the register staged commits.
    expect(removeA).toHaveBeenCalledTimes(1);
    expect(getContributions().pages).toHaveLength(0);
  });
});
