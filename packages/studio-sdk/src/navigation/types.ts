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

/**
 * Every top-level route the shell owns, mapped to its typed search parameters.
 * A route with no parameters maps to the empty object. Detail views are driven
 * by a search parameter (e.g. the selected tool / connection), keeping the route
 * map flat — one entry per feature surface, matching the shell route map.
 */
export interface RouteSearchByToken {
  login: Record<string, never>;
  tools: { tool?: string; tags?: string[] };
  agents: Record<string, never>;
  presets: { preset?: string };
  extensions: Record<string, never>;
  interactions: Record<string, never>;
  notifications: Record<string, never>;
  connectors: { connection?: string };
  hooks: Record<string, never>;
  templates: { template?: string };
  storage: { filter?: string };
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
 * The runtime navigation surface the shell provides through
 * {@link NavigationProvider}. `navigate` performs a client-side transition;
 * `resolvePath` produces the href a link should point at (so an AppLink is a real
 * anchor — middle-click / open-in-new-tab work — while still driving a
 * client-side transition on plain click).
 *
 * `navigatePlugin`/`resolvePluginPath` are the plugin-page twins: they target a
 * runtime plugin path (`/plugins/{pluginId}/{pagePath}` plus an optional validated
 * sub-path `params` and `search`), NOT a route token — `routes.ts` never learns
 * plugin paths. Plugins reach these two via the {@link usePluginNavigation} hook.
 */
export interface NavigationContextValue {
  navigate: <T extends RouteToken>(token: T, search?: RouteSearch<T>) => void;
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
