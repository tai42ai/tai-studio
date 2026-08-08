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
 */
import type {
  NavigateOptions,
  NavigationContextValue,
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

/** `pagePath` plus the optional sub-path remainder, the value of the route's `_splat`. */
function pluginSplat(pagePath: string, params: string | undefined): string {
  return params !== undefined && params !== '' ? `${pagePath}/${params}` : pagePath;
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
  };
}
