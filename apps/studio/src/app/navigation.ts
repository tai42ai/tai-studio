/**
 * The shell's {@link NavigationContextValue} implementation: the runtime
 * resolution of opaque route TOKENS the SDK's `NavigationProvider` hands to every
 * feature. `navigate` drives a client-side transition; `resolvePath` produces the
 * href an `AppLink` anchor points at. Both go through {@link PATH} — the single
 * token→path binding — and the router.
 *
 * `navigatePlugin`/`resolvePluginPath` are the plugin-page twins: they address a
 * RUNTIME plugin path (`/plugins/{pluginId}/{pagePath}` plus an optional validated
 * sub-path remainder and search), never a route token — `routes.ts` never learns
 * plugin paths. They resolve through the shell's plugin catch-all route
 * (`/plugins/$pluginId/$`), filling its `_splat` with `pagePath` and the remainder.
 *
 * `navigatePluginWithOptions`/`updatePluginEntryState` are the per-history-entry state
 * channel (an ADDITIVE, optional pair on the SDK contract): the first navigates like
 * `navigatePlugin` while also writing an opaque per-entry state slot onto the
 * destination entry, the second rewrites the CURRENT entry's slot in place. Both store
 * the slot under the `studioPluginEntryState` namespace on `history.state`, keyed by
 * pluginId, so the browser persists it across back/forward and a hard reload and the
 * catch-all page hands each plugin its own slot back as `PluginPageProps.entryState`.
 */
import type {
  NavigateOptions,
  NavigationContextValue,
  PluginNavigateOptions,
  PluginSearch,
  RouteSearch,
  RouteToken,
} from '@tai42/studio-sdk';

import { PATH } from './routes';
import type { AppRouter } from './router';

type NavigateArg = Parameters<AppRouter['navigate']>[0];
type BuildArg = Parameters<AppRouter['buildLocation']>[0];

/** The catch-all route the plugin twins resolve through. */
const PLUGIN_ROUTE = '/plugins/$pluginId/$';

/**
 * The `history.state` namespace under which per-history-entry plugin state is stored,
 * keyed by pluginId. Shared, by literal contract, with the SDK's navigation context
 * (which mirrors the slot into its committed-entry ref) and the plugin catch-all page
 * (which reads a plugin's own slot back out as `PluginPageProps.entryState`).
 */
const ENTRY_STATE_KEY = 'studioPluginEntryState';

/** `pagePath` plus the optional sub-path remainder, the value of the route's `_splat`. */
function pluginSplat(pagePath: string, params: string | undefined): string {
  return params !== undefined && params !== '' ? `${pagePath}/${params}` : pagePath;
}

/**
 * The per-plugin slot map already on a history entry's `state`. Reading it back lets a
 * REPLACE / an in-place update preserve every OTHER plugin's slot while rewriting one.
 * Anything that is not the expected shape reads as an empty map (no slots to preserve).
 */
function entryStateBag(state: unknown): Record<string, unknown> {
  if (state !== null && typeof state === 'object') {
    const slot = (state as Record<string, unknown>)[ENTRY_STATE_KEY];
    if (slot !== null && typeof slot === 'object') return slot as Record<string, unknown>;
  }
  return {};
}

export function createNavigation(router: AppRouter): NavigationContextValue {
  return {
    navigate: <T extends RouteToken>(
      token: T,
      search?: RouteSearch<T>,
      options?: NavigateOptions,
    ): void => {
      // Tokens resolve to paths at runtime via PATH, so the literal-path typing of
      // `router.navigate` cannot express the destination; the option object is
      // asserted to the router's own parameter type (no `any`).
      void router.navigate({
        to: PATH[token],
        search: search ?? {},
        replace: options?.replace ?? false,
      } as NavigateArg);
    },
    resolvePath: <T extends RouteToken>(token: T, search?: RouteSearch<T>): string => {
      return router.buildLocation({ to: PATH[token], search: search ?? {} } as BuildArg).href;
    },
    navigatePlugin: (
      pluginId: string,
      pagePath: string,
      params?: string,
      search?: PluginSearch,
    ): void => {
      // The runtime plugin path is an opaque string to the router's literal-path
      // typing, and `PluginSearch` is an open bag the compile-time search reducer
      // does not overlap; the option object is asserted through `unknown` to the
      // router's own parameter type (no `any`).
      void router.navigate({
        to: PLUGIN_ROUTE,
        params: { pluginId, _splat: pluginSplat(pagePath, params) },
        search: search ?? {},
      } as unknown as NavigateArg);
    },
    resolvePluginPath: (
      pluginId: string,
      pagePath: string,
      params?: string,
      search?: PluginSearch,
    ): string => {
      return router.buildLocation({
        to: PLUGIN_ROUTE,
        params: { pluginId, _splat: pluginSplat(pagePath, params) },
        search: search ?? {},
      } as unknown as BuildArg).href;
    },
    navigatePluginWithOptions: (
      pluginId: string,
      pagePath: string,
      params?: string,
      search?: PluginSearch,
      options?: PluginNavigateOptions,
    ): void => {
      const replace = options?.replace ?? false;
      // On a REPLACE the destination IS the current entry, so preserve every other
      // plugin's slot already on it; a PUSH starts a fresh entry that carries only this
      // plugin's slot. The state bag rides `history.state` (the router merges it with its
      // own keys), where the browser persists it across back/forward and a hard reload.
      const priorBag = replace ? entryStateBag(router.state.location.state) : {};
      void router.navigate({
        to: PLUGIN_ROUTE,
        params: { pluginId, _splat: pluginSplat(pagePath, params) },
        search: search ?? {},
        replace,
        state: { [ENTRY_STATE_KEY]: { ...priorBag, [pluginId]: options?.state } },
      } as unknown as NavigateArg);
    },
    updatePluginEntryState: (pluginId: string, state: unknown): void => {
      // Rewrite the CURRENT entry's slot in place: a REPLACE navigation to the very same
      // location (path + search unchanged) with scroll preserved, so the reader stays put
      // and only `history.state` changes. Other plugins' slots are merge-preserved.
      const current = router.state.location;
      const priorBag = entryStateBag(current.state);
      void router.navigate({
        to: current.pathname,
        search: current.search,
        replace: true,
        resetScroll: false,
        state: { [ENTRY_STATE_KEY]: { ...priorBag, [pluginId]: state } },
      } as unknown as NavigateArg);
    },
  };
}
