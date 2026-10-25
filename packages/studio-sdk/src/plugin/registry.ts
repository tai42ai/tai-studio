/**
 * The in-memory registry the shell reads, plus {@link loadPlugin} — the one entry
 * through which a plugin bundle's `register(context)` contributes to it. This module
 * is bundled only into the served `@tai42/studio-sdk/host` singleton (external across
 * the plugin boundary, like react and react-dom), so the module-level registry is
 * the SAME instance every host caller — the shell and the feature panels — sees. The
 * plugin surface (`@tai42/studio-sdk`) does not include it, so a plugin cannot reach it.
 */
import { CORE_HOLDER_KINDS } from '../components/holder-kinds';
import type {
  HolderLinkContribution,
  NavEntryContribution,
  PageContribution,
  PluginContext,
  PluginContributions,
  PluginEntry,
  RegisteredHolderLink,
  RegisteredNavEntry,
  RegisteredPage,
  RegisteredRoutePanel,
  RegisteredSettingsTab,
  RoutePanelContribution,
  SettingsTabContribution,
  ToolPanelContribution,
} from './types';

const toolPanels = new Map<string, ToolPanelContribution>();
const pages: RegisteredPage[] = [];
const settingsTabs: RegisteredSettingsTab[] = [];
const navEntries: RegisteredNavEntry[] = [];
const routePanels = new Map<string, RegisteredRoutePanel>();
const holderLinks = new Map<string, RegisteredHolderLink>();

/**
 * What the host knows about a plugin from its registry listing entry: `mounts`, the
 * plugin's own route items and their resolved absolute bases (`{item: "/api/<base>"}`),
 * and `declaredRoutePanels`, the channels its manifest lists under
 * `contributions.route_panels`.
 */
export interface PluginLoadInputs {
  readonly mounts: Readonly<Record<string, string>>;
  readonly declaredRoutePanels: readonly string[];
}

/** The contributions one plugin stages before they commit as a batch. */
interface StagedContributions {
  readonly pages: RegisteredPage[];
  readonly toolPanels: Map<string, ToolPanelContribution>;
  readonly settingsTabs: RegisteredSettingsTab[];
  readonly tabIds: Set<string>;
  readonly navEntries: RegisteredNavEntry[];
  readonly routePanels: Map<string, RegisteredRoutePanel>;
  readonly holderLinks: Map<string, RegisteredHolderLink>;
}

/**
 * A mutable seal flag passed BY REFERENCE into the staging context, so the seal set
 * in {@link loadPlugin}'s `finally` is seen by every `register*` method's closure.
 */
interface Seal {
  closed: boolean;
}

function emptyStaged(): StagedContributions {
  return {
    pages: [],
    toolPanels: new Map(),
    settingsTabs: [],
    tabIds: new Set(),
    navEntries: [],
    routePanels: new Map(),
    holderLinks: new Map(),
  };
}

/**
 * Build the {@link PluginContext} a plugin's `register` entry contributes through.
 * Every method stages into `staged` (never ambient state) and refuses once `seal` is
 * closed — a registration after `entry` settles (a deferred timer, a post-settle
 * callback) throws loudly rather than pushing into an orphaned array that never
 * commits. Duplicate guards run against BOTH the staged set and what is already
 * committed, and fail loudly.
 */
function makeStagingContext(
  pluginId: string,
  staged: StagedContributions,
  seal: Seal,
  host: PluginLoadInputs,
): PluginContext {
  const assertOpen = (): void => {
    if (seal.closed) {
      throw new Error(
        'registration is closed: a plugin must register during register(), not after it resolves',
      );
    }
  };
  return {
    registerPage(contribution: PageContribution): void {
      assertOpen();
      const duplicate =
        staged.pages.some((p) => p.path === contribution.path) ||
        pages.some((p) => p.pluginId === pluginId && p.path === contribution.path);
      if (duplicate) {
        // A duplicate path within one plugin is an author mistake that would
        // leave one page unreachable — fail loudly, as registerToolPanel does.
        throw new Error(`plugin “${pluginId}” already registered a page at “${contribution.path}”`);
      }
      staged.pages.push({ ...contribution, pluginId });
    },
    registerToolPanel(contribution: ToolPanelContribution): void {
      assertOpen();
      if (staged.toolPanels.has(contribution.toolName) || toolPanels.has(contribution.toolName)) {
        throw new Error(`a tool panel is already registered for ${contribution.toolName}`);
      }
      staged.toolPanels.set(contribution.toolName, contribution);
    },
    registerSettingsTab(contribution: SettingsTabContribution): void {
      assertOpen();
      const committed = settingsTabs.some(
        (t) => t.pluginId === pluginId && t.id === contribution.id,
      );
      if (staged.tabIds.has(contribution.id) || committed) {
        // A duplicate tab id within one plugin would leave one tab unreachable —
        // fail loudly, mirroring the page-path guard.
        throw new Error(
          `plugin “${pluginId}” already registered a settings tab “${contribution.id}”`,
        );
      }
      staged.tabIds.add(contribution.id);
      staged.settingsTabs.push({ ...contribution, pluginId });
    },
    registerNavEntry(contribution: NavEntryContribution): void {
      assertOpen();
      const duplicate =
        staged.navEntries.some((e) => e.path === contribution.path) ||
        navEntries.some((e) => e.pluginId === pluginId && e.path === contribution.path);
      if (duplicate) {
        // A duplicate nav path within one plugin is an author mistake — two
        // entries pointing at the same page — so fail loudly like the page guard.
        throw new Error(
          `plugin “${pluginId}” already registered a nav entry at “${contribution.path}”`,
        );
      }
      staged.navEntries.push({ ...contribution, pluginId });
    },
    registerRoutePanel(contribution: RoutePanelContribution): void {
      assertOpen();
      if (staged.routePanels.has(contribution.channel) || routePanels.has(contribution.channel)) {
        throw new Error(`a route panel is already registered for channel ${contribution.channel}`);
      }
      staged.routePanels.set(contribution.channel, { ...contribution, pluginId });
    },
    registerHolderLink(contribution: HolderLinkContribution): void {
      assertOpen();
      if (CORE_HOLDER_KINDS.has(contribution.kind)) {
        throw new Error(`holder kind “${contribution.kind}” is a core kind; the shell links it`);
      }
      if (staged.holderLinks.has(contribution.kind) || holderLinks.has(contribution.kind)) {
        throw new Error(`a holder link is already registered for kind “${contribution.kind}”`);
      }
      staged.holderLinks.set(contribution.kind, { ...contribution, pluginId });
    },
    routeBase(itemName: string): string | null {
      return Object.hasOwn(host.mounts, itemName) ? (host.mounts[itemName] ?? null) : null;
    },
  };
}

/**
 * Every nav entry must link to a page THIS plugin registers — staged in this call or
 * already committed. A nav entry with no matching page is a guaranteed dead link (the
 * plugin page surface renders "Page not found"), so reject it loudly. Throwing here —
 * BEFORE any commit — keeps atomicity: nothing (pages, panels, tabs, nav) commits.
 */
function assertNavEntriesHavePages(pluginId: string, staged: StagedContributions): void {
  for (const navEntry of staged.navEntries) {
    const hasPage =
      staged.pages.some((p) => p.path === navEntry.path) ||
      pages.some((p) => p.pluginId === pluginId && p.path === navEntry.path);
    if (!hasPage) {
      throw new Error(
        `plugin “${pluginId}” registered a nav entry at “${navEntry.path}” but no page at that path`,
      );
    }
  }
}

/**
 * The channels a plugin registered route panels for must be exactly the channels its
 * manifest declares: a bundle and its manifest are built together, so a mismatch is a
 * build fault. Throwing BEFORE any commit keeps atomicity.
 */
function assertRoutePanelsDeclared(
  pluginId: string,
  staged: StagedContributions,
  declared: readonly string[],
): void {
  const registered = [...staged.routePanels.keys()].sort();
  const manifest = [...new Set(declared)].sort();
  const same =
    registered.length === manifest.length && registered.every((c, i) => c === manifest[i]);
  if (!same) {
    throw new Error(
      `plugin “${pluginId}” registered route panels [${registered.join(', ')}] but its manifest declares [${manifest.join(', ')}]`,
    );
  }
}

/**
 * Commit the staged contributions as one batch, so the registry only ever holds a
 * plugin's complete set — never a partial set left behind by a mid-registration failure.
 */
function commitStaged(staged: StagedContributions): void {
  for (const page of staged.pages) pages.push(page);
  for (const [toolName, contribution] of staged.toolPanels) toolPanels.set(toolName, contribution);
  for (const tab of staged.settingsTabs) settingsTabs.push(tab);
  for (const navEntry of staged.navEntries) navEntries.push(navEntry);
  for (const [channel, panel] of staged.routePanels) routePanels.set(channel, panel);
  for (const [kind, link] of staged.holderLinks) holderLinks.set(kind, link);
}

/**
 * Load one plugin: call its `register` entry with a context bound to `pluginId`,
 * then commit everything it staged into the global registry.
 *
 * `entry` is AWAITED before commit, so a synchronous or an `async` entry is fully
 * done first: a post-`await` throw skips the commit (atomicity holds for async too)
 * and a post-`await` registration cannot slip past the batch. The seal is set after
 * `entry` has SETTLED, so a later registration throws loudly; registrations made
 * during `entry`'s synchronous body — including a microtask it enqueues then — are
 * still captured and committed. A `register` that throws commits nothing.
 */
export async function loadPlugin(
  pluginId: string,
  entry: PluginEntry,
  host: PluginLoadInputs,
): Promise<void> {
  const staged = emptyStaged();
  const seal: Seal = { closed: false };
  const context = makeStagingContext(pluginId, staged, seal, host);

  try {
    await entry(context);
  } finally {
    // Whether `entry` resolved or threw, no further registration is valid — seal
    // so a deferred call fails loudly rather than pushing into an orphaned array.
    seal.closed = true;
  }

  assertNavEntriesHavePages(pluginId, staged);
  assertRoutePanelsDeclared(pluginId, staged, host.declaredRoutePanels);
  commitStaged(staged);
}

/** The shell reads this after loading every installed plugin bundle. */
export function getContributions(): PluginContributions {
  return { toolPanels, pages, settingsTabs, navEntries, routePanels, holderLinks };
}

/** Tests reset the module-level registry between cases. */
export function __resetContributions(): void {
  toolPanels.clear();
  pages.length = 0;
  settingsTabs.length = 0;
  navEntries.length = 0;
  routePanels.clear();
  holderLinks.clear();
}
