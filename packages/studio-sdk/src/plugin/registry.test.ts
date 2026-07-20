import { afterEach, describe, expect, it } from 'vitest';

import { __resetContributions, getContributions, loadPlugin } from './registry';

afterEach(() => {
  __resetContributions();
});

const page = (path: string) => ({ path, title: path, component: () => null });
const tab = (id: string) => ({ id, title: id, component: () => null });
const nav = (path: string) => ({ path, title: path });

describe('plugin registry — loadPlugin', () => {
  it('stamps each page with the plugin the host loaded', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerPage(page('dashboard'));
    });
    await loadPlugin('globex', (ctx) => {
      ctx.registerPage(page('dashboard'));
    });

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
      loadPlugin('acme', (ctx) => {
        ctx.registerPage(page('dashboard'));
        ctx.registerPage(page('dashboard'));
      }),
    ).rejects.toThrow(/already registered a page/i);
  });

  it('throws when the same plugin id is loaded twice and re-registers a path', async () => {
    // The first load commits the page; the second load hits the committed-side
    // dedupe guard for the same `(pluginId, path)`.
    await loadPlugin('acme', (ctx) => {
      ctx.registerPage(page('dashboard'));
    });
    await expect(
      loadPlugin('acme', (ctx) => {
        ctx.registerPage(page('dashboard'));
      }),
    ).rejects.toThrow(/already registered a page/i);
  });

  it('throws when one plugin registers the same tool panel twice', async () => {
    // The staged-side dedupe fires before anything commits.
    await expect(
      loadPlugin('acme', (ctx) => {
        ctx.registerToolPanel({ toolName: 'echo', component: () => null });
        ctx.registerToolPanel({ toolName: 'echo', component: () => null });
      }),
    ).rejects.toThrow(/already registered for echo/i);
  });

  it('throws when two plugins register the same tool panel', async () => {
    const panel = { component: () => null };
    await loadPlugin('acme', (ctx) => {
      ctx.registerToolPanel({ toolName: 'echo', ...panel });
    });
    // The second plugin cannot claim a tool another plugin already owns.
    await expect(
      loadPlugin('globex', (ctx) => {
        ctx.registerToolPanel({ toolName: 'echo', ...panel });
      }),
    ).rejects.toThrow(/already registered for echo/i);
  });

  it('commits NOTHING when a plugin entry throws after staging contributions', async () => {
    // A first plugin loads cleanly so the registry is non-empty going in.
    await loadPlugin('acme', (ctx) => {
      ctx.registerPage(page('home'));
    });
    const before = getContributions();
    const pagesBefore = [...before.pages];
    const toolPanelsBefore = new Map(before.toolPanels);

    // A second plugin stages a page AND a panel, then throws mid-register. Because
    // contributions commit only after the entry returns, none of them land — no
    // partial-registration leak.
    await expect(
      loadPlugin('globex', (ctx) => {
        ctx.registerPage(page('dashboard'));
        ctx.registerToolPanel({ toolName: 'echo', component: () => null });
        throw new Error('boom mid-register');
      }),
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
    await loadPlugin('acme', async (ctx) => {
      ctx.registerPage(page('dashboard'));
      await Promise.resolve();
      ctx.registerToolPanel({ toolName: 'echo', component: () => null });
    });

    expect(getContributions().pages).toHaveLength(1);
    expect(getContributions().pages.map((p) => p.pluginId)).toEqual(['acme']);
    expect(getContributions().toolPanels.has('echo')).toBe(true);
  });

  it('commits NOTHING when an async register throws after an await', async () => {
    // A first plugin loads cleanly so the registry is non-empty going in.
    await loadPlugin('acme', (ctx) => {
      ctx.registerPage(page('home'));
    });
    const before = getContributions();
    const pagesBefore = [...before.pages];
    const toolPanelsBefore = new Map(before.toolPanels);

    // The async entry stages a page, awaits, stages a panel, awaits, then throws.
    // Because the host awaits the entry BEFORE committing, the post-await rejection
    // skips the commit — nothing lands.
    await expect(
      loadPlugin('globex', async (ctx) => {
        ctx.registerPage(page('dashboard'));
        await Promise.resolve();
        ctx.registerToolPanel({ toolName: 'echo', component: () => null });
        await Promise.resolve();
        throw new Error('async boom');
      }),
    ).rejects.toThrow(/async boom/);

    const after = getContributions();
    expect(after.pages).toEqual(pagesBefore);
    expect([...after.toolPanels]).toEqual([...toolPanelsBefore]);
    expect(after.pages.some((p) => p.pluginId === 'globex')).toBe(false);
    expect(after.toolPanels.has('echo')).toBe(false);
  });

  it('throws "registration is closed" when a register defers a call past its resolution', async () => {
    let deferred: () => void = () => undefined;
    await loadPlugin('acme', (ctx) => {
      // Capture the context and call it AFTER register resolves — the model of a
      // stray microtask/`setTimeout` registration.
      deferred = () => {
        ctx.registerPage(page('late'));
      };
    });

    // The context is sealed once register settles: the deferred call fails loudly
    // instead of pushing into an orphaned staged array that never commits.
    expect(deferred).toThrow(/registration is closed/i);
    expect(getContributions().pages).toHaveLength(0);
  });

  it('stamps settings tabs and lets two plugins share a tab id', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerSettingsTab(tab('general'));
    });
    await loadPlugin('globex', (ctx) => {
      ctx.registerSettingsTab(tab('general'));
    });

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
      loadPlugin('acme', (ctx) => {
        ctx.registerSettingsTab(tab('general'));
        ctx.registerSettingsTab(tab('general'));
      }),
    ).rejects.toThrow(/already registered a settings tab/i);
  });

  it('stamps a nav entry with the loading plugin and a page staged in the same call satisfies it', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerPage(page('dashboard'));
      ctx.registerNavEntry(nav('dashboard'));
    });

    const entries = getContributions().navEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ pluginId: 'acme', path: 'dashboard' });
  });

  it('carries an optional requiredCapabilities through page, nav, and settings-tab registration', async () => {
    // The capability gate rides the contribution as an optional field; the
    // registry stamps `pluginId` via a spread and must not drop it.
    const required = { routes: ['/api/tools'] };
    await loadPlugin('acme', (ctx) => {
      ctx.registerPage({ ...page('dashboard'), requiredCapabilities: required });
      ctx.registerNavEntry({ ...nav('dashboard'), requiredCapabilities: required });
      ctx.registerSettingsTab({ ...tab('general'), requiredCapabilities: required });
    });

    const contributions = getContributions();
    expect(contributions.pages[0]?.requiredCapabilities).toEqual(required);
    expect(contributions.navEntries[0]?.requiredCapabilities).toEqual(required);
    expect(contributions.settingsTabs[0]?.requiredCapabilities).toEqual(required);
  });

  it('leaves requiredCapabilities absent for a contribution that omits it (full-only default)', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerPage(page('dashboard'));
    });
    expect(getContributions().pages[0]?.requiredCapabilities).toBeUndefined();
  });

  it('lets two plugins register the same nav path without colliding', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerPage(page('dashboard'));
      ctx.registerNavEntry(nav('dashboard'));
    });
    await loadPlugin('globex', (ctx) => {
      ctx.registerPage(page('dashboard'));
      ctx.registerNavEntry(nav('dashboard'));
    });

    const entries = getContributions().navEntries;
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.pluginId).sort()).toEqual(['acme', 'globex']);
    expect(entries.every((e) => e.path === 'dashboard')).toBe(true);
  });

  it('throws when one plugin registers the same nav path twice (staged)', async () => {
    await expect(
      loadPlugin('acme', (ctx) => {
        ctx.registerPage(page('dashboard'));
        ctx.registerNavEntry(nav('dashboard'));
        ctx.registerNavEntry(nav('dashboard'));
      }),
    ).rejects.toThrow(/already registered a nav entry/i);
  });

  it('throws when a reloaded plugin re-registers a committed nav path (staged-vs-committed)', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerPage(page('dashboard'));
      ctx.registerNavEntry(nav('dashboard'));
    });
    // The page still resolves the committed-side page guard on reload, so the nav
    // entry reaches its OWN committed-side dedupe rather than the missing-page one.
    await expect(
      loadPlugin('acme', (ctx) => {
        ctx.registerNavEntry(nav('dashboard'));
      }),
    ).rejects.toThrow(/already registered a nav entry/i);
  });

  it('throws "registration is closed" when a nav entry is registered after resolution', async () => {
    let deferred: () => void = () => undefined;
    await loadPlugin('acme', (ctx) => {
      ctx.registerPage(page('demo'));
      deferred = () => {
        ctx.registerNavEntry(nav('demo'));
      };
    });

    expect(deferred).toThrow(/registration is closed/i);
    expect(getContributions().navEntries).toHaveLength(0);
  });

  it('rejects a nav entry that has no matching page, committing NOTHING', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerPage(page('home'));
    });
    const before = getContributions();
    const pagesBefore = [...before.pages];

    // The nav entry points at a path with no page — a guaranteed dead link — so
    // the commit-time check throws and NOTHING (the staged page included) lands.
    await expect(
      loadPlugin('globex', (ctx) => {
        ctx.registerPage(page('other'));
        ctx.registerNavEntry(nav('missing'));
      }),
    ).rejects.toThrow(/nav entry at .*missing.* but no page at that path/i);

    const after = getContributions();
    expect(after.pages).toEqual(pagesBefore);
    expect(after.navEntries).toHaveLength(0);
    expect(after.pages.some((p) => p.pluginId === 'globex')).toBe(false);
  });

  it('commits NOTHING (nav included) when a register throws after staging a nav entry', async () => {
    const before = getContributions();
    await expect(
      loadPlugin('acme', (ctx) => {
        ctx.registerPage(page('dashboard'));
        ctx.registerNavEntry(nav('dashboard'));
        throw new Error('boom after nav');
      }),
    ).rejects.toThrow(/boom after nav/);

    const after = getContributions();
    expect(after.navEntries).toEqual(before.navEntries);
    expect(after.navEntries).toHaveLength(0);
    expect(after.pages).toHaveLength(0);
  });

  it('commits a nav entry from an async register that resolves after an await', async () => {
    await loadPlugin('acme', async (ctx) => {
      ctx.registerPage(page('dashboard'));
      await Promise.resolve();
      ctx.registerNavEntry(nav('dashboard'));
    });

    const entries = getContributions().navEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ pluginId: 'acme', path: 'dashboard' });
  });
});
