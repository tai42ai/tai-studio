/**
 * The shell ⇄ feature navigation contract.
 *
 * Routing is SHELL-owned: feature packages never see path strings and never
 * define routes. They navigate through named ROUTE TOKENS — the keys of
 * {@link RouteSearchByToken} — which the shell resolves to real paths. A token
 * is an opaque, compile-time handle: renaming or removing one here is a type
 * error at every call site, exactly the property free-form path strings lack.
 *
 * This contract lives in the SDK because it is the ONLY internal module a feature
 * may import (a feature importing the shell is a boundary violation). The shell
 * supplies the runtime resolution via {@link NavigationContextValue}; features
 * consume it type-safely.
 */
import type { ConversationDeliveryStatus } from '@tai42/api-client';

/**
 * Every top-level route the shell owns, mapped to its typed search parameters.
 * A route with no parameters maps to the empty object. Detail views are driven
 * by a search parameter (e.g. the selected tool / connection), keeping the route
 * map flat — one entry per feature surface, matching the shell route map.
 */
export interface RouteSearchByToken {
  login: Record<string, never>;
  tools: { tool?: string; tags?: string[]; q?: string };
  agents: Record<string, never>;
  presets: { preset?: string };
  extensions: Record<string, never>;
  interactions: Record<string, never>;
  notifications: Record<string, never>;
  // The conversation monitor's drill state + thread-list filters: `route` picks a
  // conversation route, `thread` opens one of its transcripts. `status`/`address`
  // narrow the thread list; `q` searches record text (the open thread's transcript,
  // else the route's messages). A `thread` or a filter with no `route` names nothing
  // readable, and the page repairs it away.
  conversations: {
    route?: string;
    thread?: string;
    status?: ConversationDeliveryStatus;
    address?: string;
    q?: string;
  };
  connectors: { connection?: string };
  hooks: Record<string, never>;
  templates: { template?: string; q?: string };
  storage: { q?: string };
  manifest: Record<string, never>;
  settings: Record<string, never>;
  system: Record<string, never>;
  scheduling: Record<string, never>;
  observability: {
    tab?: 'dashboard' | 'tracing';
    from?: string;
    to?: string;
    tags?: string[];
    status?: 'error' | 'success';
    minCost?: number;
    maxCost?: number;
    minTokens?: number;
    maxTokens?: number;
    minLatencyMs?: number;
    maxLatencyMs?: number;
    sort?: 'createdAt' | 'cost' | 'latencyMs' | 'totalTokens';
    dir?: 'asc' | 'desc';
    trace?: string;
  };
  marketplace: {
    tab?: 'browse' | 'installed';
    q?: string;
    kind?: string;
    category?: string;
    tags?: string[];
    sort?: 'downloads' | 'updated' | 'name' | 'relevance';
    plugin?: string;
  };
}

/** An opaque, typed handle to a shell route. */
export type RouteToken = keyof RouteSearchByToken;

/** The search parameters a given route token accepts. */
export type RouteSearch<T extends RouteToken> = RouteSearchByToken[T];

/**
 * Props the shell passes to a feature's page component: the route's typed search
 * parameters. Features type their exported page as `PageProps<'tools'>` and read
 * `search` — they receive route state as data, never by importing the router.
 */
export interface PageProps<T extends RouteToken> {
  search: RouteSearch<T>;
}

/**
 * A plugin page's deep-link search object. Plugin paths are RUNTIME contributions
 * outside the compile-time {@link RouteToken} map, so their search is an open bag of
 * serializable values (the page's own {@link PluginPageParamsSchema} validates it);
 * this is deliberately NOT a `RouteSearch`.
 */
export type PluginSearch = Record<string, unknown>;

/**
 * How a token navigation enters session history.
 *
 * The default is a PUSH: a move the reader made, which Back must be able to undo.
 * `replace` overwrites the current entry instead, and is for a transition the
 * reader did NOT make — a page rewriting an unrenderable URL of its own accord.
 * Pushing such a rewrite leaves the URL it rewrote sitting behind Back, where
 * pressing Back rewrites it again and pushes again: a page no Back can leave.
 */
export interface NavigateOptions {
  /** Overwrite the current history entry instead of pushing a new one. */
  readonly replace?: boolean;
}

/**
 * Per-navigation options for {@link NavigationContextValue.navigatePluginWithOptions}.
 *
 * `replace` mirrors {@link NavigateOptions.replace}: overwrite the current history
 * entry instead of pushing a new one (a page rewriting its own unrenderable URL).
 *
 * `state` is an opaque, per-history-ENTRY bag the host stores ON the destination
 * history entry, namespaced to the navigating plugin, and hands the page back as
 * {@link PluginPageProps.entryState}. It survives back/forward traversal AND a hard
 * reload — the browser persists `history.state` across a document load, verified in
 * a real browser against the router's pinned major before this channel was built.
 * Two hard rules bind the value:
 *  - JSON-ROUND-TRIP: it is serialized into `history.state`, so it must survive
 *    structured-clone / JSON semantics — plain data only, no functions, DOM nodes,
 *    or class instances. The page reads back a structural COPY, never the same
 *    reference it wrote.
 *  - SIZE: `history.state` is browser-bounded (Firefox caps a serialized entry at
 *    16 MiB; others higher). Keep a slot SMALL — a soft cap of ~32 KB — and store
 *    only view state (a selection, a scroll anchor, a draft id), never bulk data.
 *    Oversized state risks a browser-thrown navigation; the host does not police
 *    the cap, so the discipline is the plugin's.
 */
export interface PluginNavigateOptions {
  /** Overwrite the current history entry instead of pushing a new one. */
  readonly replace?: boolean;
  /** Opaque, JSON-round-trippable per-entry state (soft cap ~32 KB); see the type doc. */
  readonly state?: unknown;
}

/**
 * The runtime navigation surface the shell provides through
 * {@link NavigationProvider}. `navigate` performs a client-side transition, by
 * default pushing a history entry — see {@link NavigateOptions} for the third
 * argument that replaces one instead. `resolvePath` produces the href a link
 * should point at (so an AppLink is a real anchor — middle-click /
 * open-in-new-tab work — while still driving a client-side transition on plain
 * click).
 *
 * `navigatePlugin`/`resolvePluginPath` are the plugin-page twins: they target a
 * runtime plugin path (`/plugins/{pluginId}/{pagePath}` plus an optional validated
 * sub-path `params` and `search`), NOT a route token — `routes.ts` never learns
 * plugin paths. Plugins reach these two via the {@link usePluginNavigation} hook.
 */
export interface NavigationContextValue {
  navigate: <T extends RouteToken>(
    token: T,
    search?: RouteSearch<T>,
    options?: NavigateOptions,
  ) => void;
  resolvePath: <T extends RouteToken>(token: T, search?: RouteSearch<T>) => string;
  navigatePlugin: (
    pluginId: string,
    pagePath: string,
    params?: string,
    search?: PluginSearch,
  ) => void;
  resolvePluginPath: (
    pluginId: string,
    pagePath: string,
    params?: string,
    search?: PluginSearch,
  ) => string;
  /**
   * ADDITIVE plugin-page navigation that also carries per-history-entry
   * {@link PluginNavigateOptions}. OPTIONAL because a Studio host built before this
   * feature does not provide it; plugins reach it — and require a host that does —
   * through {@link usePluginEntryNavigation}, which throws loudly on an older host.
   * It behaves exactly like {@link navigatePlugin} for path / params / search, and in
   * addition writes `options.state` onto the DESTINATION entry under the plugin's own
   * namespace slot (see {@link PluginPageProps.entryState}).
   *
   * NEXT-MAJOR (9.0) CONSOLIDATION NOTE: fold `options` into {@link navigatePlugin}'s
   * own signature and RETIRE this sibling. It exists as a separate optional member
   * ONLY to stay additive under the plugin-API equality gate — a new optional member
   * does not move {@link STUDIO_PLUGIN_API_VERSION}, so every existing plugin keeps
   * loading. Cutting a MAJOR now purely to rename one method onto another is the
   * disproportion anti-pattern: a breaking change for a cosmetic merge. The merge
   * therefore waits for the next major that carries real breaks; until then both
   * coexist and {@link navigatePlugin} stays byte-for-byte stable.
   */
  navigatePluginWithOptions?: (
    pluginId: string,
    pagePath: string,
    params?: string,
    search?: PluginSearch,
    options?: PluginNavigateOptions,
  ) => void;
  /**
   * ADDITIVE: replace the CURRENT history entry's per-entry state slot for `pluginId`
   * IN PLACE (merge-preserving other plugins' slots), WITHOUT navigating — the URL,
   * params, search, and scroll are untouched. A page uses it to checkpoint its live
   * view state onto the entry the reader is already on, so a later back/forward or a
   * hard reload restores it. OPTIONAL for the same additive reason as
   * {@link navigatePluginWithOptions}; reached through {@link usePluginEntryNavigation}.
   */
  updatePluginEntryState?: (pluginId: string, state: unknown) => void;
}

/**
 * A navigation guard's decision function, run while armed before any SDK-controlled
 * navigation commits ({@link NavigationContextValue.navigate},
 * {@link NavigationContextValue.navigatePlugin}, or a browser back/forward). Returns
 * `true` to proceed, `false` to veto; a promise lets it await a confirm dialog.
 *
 * Guards compose — navigation proceeds only if every armed guard allows, and the first
 * veto blocks (at most one dialog). A full-page unload can't await, so it is covered by
 * a `beforeunload` prompt independent of this handler.
 */
export type NavigationGuardHandler = () => boolean | Promise<boolean>;
