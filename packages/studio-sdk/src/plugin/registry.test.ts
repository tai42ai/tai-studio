import { afterEach, describe, expect, it } from 'vitest';

import { __resetContributions, getContributions, loadPlugin } from './registry';

/** No route mounts and no declared route panels: the host inputs of a plugin that contributes none. */
const NO_HOST_INPUTS = { mounts: {}, declaredRoutePanels: [] };

afterEach(() => {
  __resetContributions();
});

const page = (path: string) => ({ path, title: path, component: () => null });
const tab = (id: string) => ({ id, title: id, component: () => null });
const nav = (path: string) => ({ path, title: path });

describe('plugin registry — loadPlugin', () => {
  it('stamps each page with the plugin the host loaded', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerPage(page('dashboard'));
      },
      NO_HOST_INPUTS,
    );
    await loadPlugin(
      'globex',
      (ctx) => {
        ctx.registerPage(page('dashboard'));
      },
      NO_HOST_INPUTS,
    );

    const pages = getContributions().pages;
    // Two plugins registered the SAME path; both survive, each stamped with its
    // owner, so `(pluginId, path)` resolves them independently — no collision.
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => p.pluginId).sort()).toEqual(['acme', 'globex']);
    expect(pages.every((p) => p.path === 'dashboard')).toBe(true);
  });

  it('throws when one plugin registers the same path twice', async () => {
    // A within-plugin duplicate would leave one page unreachable — it is loud.
    await expect(
      loadPlugin(
        'acme',
        (ctx) => {
          ctx.registerPage(page('dashboard'));
          ctx.registerPage(page('dashboard'));
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow(/already registered a page/i);
  });

  it('throws when the same plugin id is loaded twice and re-registers a path', async () => {
    // The first load commits the page; the second load hits the committed-side
    // dedupe guard for the same `(pluginId, path)`.
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerPage(page('dashboard'));
      },
      NO_HOST_INPUTS,
    );
    await expect(
      loadPlugin(
        'acme',
        (ctx) => {
          ctx.registerPage(page('dashboard'));
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow(/already registered a page/i);
  });

  it('throws when one plugin registers the same tool panel twice', async () => {
    // The staged-side dedupe fires before anything commits.
    await expect(
      loadPlugin(
        'acme',
        (ctx) => {
          ctx.registerToolPanel({ toolName: 'echo', component: () => null });
          ctx.registerToolPanel({ toolName: 'echo', component: () => null });
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow(/already registered for echo/i);
  });

  it('throws when two plugins register the same tool panel', async () => {
    const panel = { component: () => null };
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerToolPanel({ toolName: 'echo', ...panel });
      },
      NO_HOST_INPUTS,
    );
    // The second plugin cannot claim a tool another plugin already owns.
    await expect(
      loadPlugin(
        'globex',
        (ctx) => {
          ctx.registerToolPanel({ toolName: 'echo', ...panel });
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow(/already registered for echo/i);
  });

  it('commits NOTHING when a plugin entry throws after staging contributions', async () => {
    // A first plugin loads cleanly so the registry is non-empty going in.
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerPage(page('home'));
      },
      NO_HOST_INPUTS,
    );
    const before = getContributions();
    const pagesBefore = [...before.pages];
    const toolPanelsBefore = new Map(before.toolPanels);

    // A second plugin stages a page AND a panel, then throws mid-register. Because
    // contributions commit only after the entry returns, none of them land — no
    // partial-registration leak.
    await expect(
      loadPlugin(
        'globex',
        (ctx) => {
          ctx.registerPage(page('dashboard'));
          ctx.registerToolPanel({ toolName: 'echo', component: () => null });
          throw new Error('boom mid-register');
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow(/boom mid-register/);

    const after = getContributions();
    expect(after.pages).toEqual(pagesBefore);
    expect([...after.toolPanels]).toEqual([...toolPanelsBefore]);
    expect(after.pages.some((p) => p.pluginId === 'globex')).toBe(false);
    expect(after.toolPanels.has('echo')).toBe(false);
  });

  it('commits an async register that resolves after staging its contributions', async () => {
    // An `async register` that stages, awaits, then stages more must commit its
    // full set — the host awaits it before committing.
    await loadPlugin(
      'acme',
      async (ctx) => {
        ctx.registerPage(page('dashboard'));
        await Promise.resolve();
        ctx.registerToolPanel({ toolName: 'echo', component: () => null });
      },
      NO_HOST_INPUTS,
    );

    expect(getContributions().pages).toHaveLength(1);
    expect(getContributions().pages.map((p) => p.pluginId)).toEqual(['acme']);
    expect(getContributions().toolPanels.has('echo')).toBe(true);
  });

  it('commits NOTHING when an async register throws after an await', async () => {
    // A first plugin loads cleanly so the registry is non-empty going in.
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerPage(page('home'));
      },
      NO_HOST_INPUTS,
    );
    const before = getContributions();
    const pagesBefore = [...before.pages];
    const toolPanelsBefore = new Map(before.toolPanels);

    // The async entry stages a page, awaits, stages a panel, awaits, then throws.
    // Because the host awaits the entry BEFORE committing, the post-await rejection
    // skips the commit — nothing lands.
    await expect(
      loadPlugin(
        'globex',
        async (ctx) => {
          ctx.registerPage(page('dashboard'));
          await Promise.resolve();
          ctx.registerToolPanel({ toolName: 'echo', component: () => null });
          await Promise.resolve();
          throw new Error('async boom');
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow(/async boom/);

    const after = getContributions();
    expect(after.pages).toEqual(pagesBefore);
    expect([...after.toolPanels]).toEqual([...toolPanelsBefore]);
    expect(after.pages.some((p) => p.pluginId === 'globex')).toBe(false);
    expect(after.toolPanels.has('echo')).toBe(false);
  });

  it('throws "registration is closed" when a register defers a call past its resolution', async () => {
    let deferred: () => void = () => undefined;
    await loadPlugin(
      'acme',
      (ctx) => {
        // Capture the context and call it AFTER register resolves — the model of a
        // stray microtask/`setTimeout` registration.
        deferred = () => {
          ctx.registerPage(page('late'));
        };
      },
      NO_HOST_INPUTS,
    );

    // The context is sealed once register settles: the deferred call fails loudly
    // instead of pushing into an orphaned staged array that never commits.
    expect(deferred).toThrow(/registration is closed/i);
    expect(getContributions().pages).toHaveLength(0);
  });

  it('stamps settings tabs and lets two plugins share a tab id', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerSettingsTab(tab('general'));
      },
      NO_HOST_INPUTS,
    );
    await loadPlugin(
      'globex',
      (ctx) => {
        ctx.registerSettingsTab(tab('general'));
      },
      NO_HOST_INPUTS,
    );

    const tabs = getContributions().settingsTabs;
    // Two plugins registered the SAME tab id; both survive, each stamped with its
    // owner, so they never collide.
    expect(tabs).toHaveLength(2);
    expect(tabs.map((t) => t.pluginId).sort()).toEqual(['acme', 'globex']);
    expect(tabs.every((t) => t.id === 'general')).toBe(true);
  });

  it('throws when one plugin registers the same settings tab id twice', async () => {
    // A within-plugin duplicate id would leave one tab unreachable — it is loud.
    await expect(
      loadPlugin(
        'acme',
        (ctx) => {
          ctx.registerSettingsTab(tab('general'));
          ctx.registerSettingsTab(tab('general'));
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow(/already registered a settings tab/i);
  });

  it('stamps a nav entry with the loading plugin and a page staged in the same call satisfies it', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerPage(page('dashboard'));
        ctx.registerNavEntry(nav('dashboard'));
      },
      NO_HOST_INPUTS,
    );

    const entries = getContributions().navEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ pluginId: 'acme', path: 'dashboard' });
  });

  it('carries an optional requiredCapabilities through page, nav, and settings-tab registration', async () => {
    // The capability gate rides the contribution as an optional field; the
    // registry stamps `pluginId` via a spread and must not drop it.
    const required = { routes: ['/api/tools'] };
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerPage({ ...page('dashboard'), requiredCapabilities: required });
        ctx.registerNavEntry({ ...nav('dashboard'), requiredCapabilities: required });
        ctx.registerSettingsTab({ ...tab('general'), requiredCapabilities: required });
      },
      NO_HOST_INPUTS,
    );

    const contributions = getContributions();
    expect(contributions.pages[0]?.requiredCapabilities).toEqual(required);
    expect(contributions.navEntries[0]?.requiredCapabilities).toEqual(required);
    expect(contributions.settingsTabs[0]?.requiredCapabilities).toEqual(required);
  });

  it('leaves requiredCapabilities absent for a contribution that omits it (full-only default)', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerPage(page('dashboard'));
      },
      NO_HOST_INPUTS,
    );
    expect(getContributions().pages[0]?.requiredCapabilities).toBeUndefined();
  });

  it('lets two plugins register the same nav path without colliding', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerPage(page('dashboard'));
        ctx.registerNavEntry(nav('dashboard'));
      },
      NO_HOST_INPUTS,
    );
    await loadPlugin(
      'globex',
      (ctx) => {
        ctx.registerPage(page('dashboard'));
        ctx.registerNavEntry(nav('dashboard'));
      },
      NO_HOST_INPUTS,
    );

    const entries = getContributions().navEntries;
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.pluginId).sort()).toEqual(['acme', 'globex']);
    expect(entries.every((e) => e.path === 'dashboard')).toBe(true);
  });

  it('throws when one plugin registers the same nav path twice (staged)', async () => {
    await expect(
      loadPlugin(
        'acme',
        (ctx) => {
          ctx.registerPage(page('dashboard'));
          ctx.registerNavEntry(nav('dashboard'));
          ctx.registerNavEntry(nav('dashboard'));
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow(/already registered a nav entry/i);
  });

  it('throws when a reloaded plugin re-registers a committed nav path (staged-vs-committed)', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerPage(page('dashboard'));
        ctx.registerNavEntry(nav('dashboard'));
      },
      NO_HOST_INPUTS,
    );
    // The page still resolves the committed-side page guard on reload, so the nav
    // entry reaches its OWN committed-side dedupe rather than the missing-page one.
    await expect(
      loadPlugin(
        'acme',
        (ctx) => {
          ctx.registerNavEntry(nav('dashboard'));
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow(/already registered a nav entry/i);
  });

  it('throws "registration is closed" when a nav entry is registered after resolution', async () => {
    let deferred: () => void = () => undefined;
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerPage(page('demo'));
        deferred = () => {
          ctx.registerNavEntry(nav('demo'));
        };
      },
      NO_HOST_INPUTS,
    );

    expect(deferred).toThrow(/registration is closed/i);
    expect(getContributions().navEntries).toHaveLength(0);
  });

  it('rejects a nav entry that has no matching page, committing NOTHING', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerPage(page('home'));
      },
      NO_HOST_INPUTS,
    );
    const before = getContributions();
    const pagesBefore = [...before.pages];

    // The nav entry points at a path with no page — a guaranteed dead link — so
    // the commit-time check throws and NOTHING (the staged page included) lands.
    await expect(
      loadPlugin(
        'globex',
        (ctx) => {
          ctx.registerPage(page('other'));
          ctx.registerNavEntry(nav('missing'));
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow(/nav entry at .*missing.* but no page at that path/i);

    const after = getContributions();
    expect(after.pages).toEqual(pagesBefore);
    expect(after.navEntries).toHaveLength(0);
    expect(after.pages.some((p) => p.pluginId === 'globex')).toBe(false);
  });

  it('commits NOTHING (nav included) when a register throws after staging a nav entry', async () => {
    const before = getContributions();
    await expect(
      loadPlugin(
        'acme',
        (ctx) => {
          ctx.registerPage(page('dashboard'));
          ctx.registerNavEntry(nav('dashboard'));
          throw new Error('boom after nav');
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow(/boom after nav/);

    const after = getContributions();
    expect(after.navEntries).toEqual(before.navEntries);
    expect(after.navEntries).toHaveLength(0);
    expect(after.pages).toHaveLength(0);
  });

  it('commits a nav entry from an async register that resolves after an await', async () => {
    await loadPlugin(
      'acme',
      async (ctx) => {
        ctx.registerPage(page('dashboard'));
        await Promise.resolve();
        ctx.registerNavEntry(nav('dashboard'));
      },
      NO_HOST_INPUTS,
    );

    const entries = getContributions().navEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ pluginId: 'acme', path: 'dashboard' });
  });
});

const routePanel = (channel: string) => ({
  channel,
  title: `${channel} panel`,
  component: () => null,
});
const declaring = (...channels: string[]) => ({ mounts: {}, declaredRoutePanels: channels });

describe('plugin registry — route panels', () => {
  it('commits a route panel stamped with its plugin', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerRoutePanel(routePanel('synthetic'));
      },
      declaring('synthetic'),
    );
    const panel = getContributions().routePanels.get('synthetic');
    expect(panel?.pluginId).toBe('acme');
    expect(panel?.title).toBe('synthetic panel');
  });

  it('throws on a second panel for one channel inside one plugin', async () => {
    await expect(
      loadPlugin(
        'acme',
        (ctx) => {
          ctx.registerRoutePanel(routePanel('synthetic'));
          ctx.registerRoutePanel(routePanel('synthetic'));
        },
        declaring('synthetic'),
      ),
    ).rejects.toThrow('a route panel is already registered for channel synthetic');
    expect(getContributions().routePanels.size).toBe(0);
  });

  it('throws when a second plugin claims a channel another plugin already decorates', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerRoutePanel(routePanel('synthetic'));
      },
      declaring('synthetic'),
    );
    await expect(
      loadPlugin(
        'globex',
        (ctx) => {
          ctx.registerRoutePanel(routePanel('synthetic'));
        },
        declaring('synthetic'),
      ),
    ).rejects.toThrow('a route panel is already registered for channel synthetic');
    expect(getContributions().routePanels.get('synthetic')?.pluginId).toBe('acme');
  });

  it('seals registerRoutePanel once register settles', async () => {
    let late: (() => void) | undefined;
    await loadPlugin(
      'acme',
      (ctx) => {
        late = () => {
          ctx.registerRoutePanel(routePanel('synthetic'));
        };
      },
      NO_HOST_INPUTS,
    );
    expect(late).toThrow(/registration is closed/);
  });

  it('clears route panels on reset', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerRoutePanel(routePanel('synthetic'));
      },
      declaring('synthetic'),
    );
    __resetContributions();
    expect(getContributions().routePanels.size).toBe(0);
  });

  it('refuses a staged channel the manifest does not declare, committing nothing', async () => {
    await expect(
      loadPlugin(
        'acme',
        (ctx) => {
          ctx.registerPage(page('home'));
          ctx.registerRoutePanel(routePanel('synthetic'));
        },
        declaring(),
      ),
    ).rejects.toThrow(
      'plugin “acme” registered route panels [synthetic] but its manifest declares []',
    );
    expect(getContributions().pages).toHaveLength(0);
    expect(getContributions().routePanels.size).toBe(0);
  });

  it('refuses a declared channel the bundle never registers', async () => {
    await expect(
      loadPlugin(
        'acme',
        (ctx) => {
          ctx.registerRoutePanel(routePanel('beta'));
        },
        declaring('beta', 'alpha'),
      ),
    ).rejects.toThrow(
      'plugin “acme” registered route panels [beta] but its manifest declares [alpha, beta]',
    );
  });
});

describe('plugin registry — routeBase', () => {
  it('answers a mounted item with its base and an unmounted one with null', async () => {
    const seen: (string | null)[] = [];
    await loadPlugin(
      'acme',
      (ctx) => {
        seen.push(ctx.routeBase('synthetic'), ctx.routeBase('absent'));
      },
      { mounts: { synthetic: '/api/synthetic-alt' }, declaredRoutePanels: [] },
    );
    expect(seen).toEqual(['/api/synthetic-alt', null]);
  });

  it('a plugin whose optional router is not mounted still registers its other contributions', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        expect(ctx.routeBase('absent')).toBeNull();
        ctx.registerPage(page('home'));
        ctx.registerNavEntry(nav('home'));
        ctx.registerRoutePanel(routePanel('synthetic'));
      },
      { mounts: {}, declaredRoutePanels: ['synthetic'] },
    );
    const contributions = getContributions();
    expect(contributions.pages.map((p) => p.path)).toEqual(['home']);
    expect(contributions.navEntries.map((e) => e.path)).toEqual(['home']);
    expect(contributions.routePanels.has('synthetic')).toBe(true);
  });
});

describe('plugin registry — holder links', () => {
  const reportNode = {
    kind: 'report node',
    resolve: (holder: { name: string }) => ({ pagePath: 'reports', params: holder.name }),
  };

  it('commits a resolver keyed by its kind, stamped with the plugin', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerHolderLink(reportNode);
      },
      NO_HOST_INPUTS,
    );
    const link = getContributions().holderLinks.get('report node');
    expect(link?.pluginId).toBe('acme');
    expect(
      link?.resolve({ kind: 'report node', name: 'f', locator: { node: 'n1' }, summary: 's' }),
    ).toEqual({ pagePath: 'reports', params: 'f' });
  });

  it('throws on a core kind, committing nothing', async () => {
    await expect(
      loadPlugin(
        'acme',
        (ctx) => {
          ctx.registerHolderLink({ ...reportNode, kind: 'preset' });
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow('holder kind “preset” is a core kind; the shell links it');
    expect(getContributions().holderLinks.size).toBe(0);
  });

  it('throws on a kind registered twice inside one plugin', async () => {
    await expect(
      loadPlugin(
        'acme',
        (ctx) => {
          ctx.registerHolderLink(reportNode);
          ctx.registerHolderLink(reportNode);
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow('a holder link is already registered for kind “report node”');
    expect(getContributions().holderLinks.size).toBe(0);
  });

  it('throws when a second plugin claims a kind another plugin already links', async () => {
    await loadPlugin(
      'acme',
      (ctx) => {
        ctx.registerHolderLink(reportNode);
      },
      NO_HOST_INPUTS,
    );
    await expect(
      loadPlugin(
        'globex',
        (ctx) => {
          ctx.registerHolderLink(reportNode);
        },
        NO_HOST_INPUTS,
      ),
    ).rejects.toThrow('a holder link is already registered for kind “report node”');
    expect(getContributions().holderLinks.get('report node')?.pluginId).toBe('acme');
  });

  it('seals registerHolderLink once register settles', async () => {
    let late: (() => void) | undefined;
    await loadPlugin(
      'acme',
      (ctx) => {
        late = () => {
          ctx.registerHolderLink(reportNode);
        };
      },
      NO_HOST_INPUTS,
    );
    expect(() => late?.()).toThrow();
    expect(getContributions().holderLinks.size).toBe(0);
  });
});
