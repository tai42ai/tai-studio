/**
 * The SHELL-owned route tree, built code-first. Feature packages export page
 * components + typed search contracts; they never define routes. Every data route
 * lives under a single pathless auth-layout route whose `beforeLoad` redirects to
 * `/login` (capturing the requested location as `redirect`) when unauthenticated —
 * the returnTo pin. `/login` and nothing else is public within the SPA.
 *
 * Studio-plugin pages mount under the shell-owned catch-all `/plugins/$pluginId/$`,
 * resolved from the runtime registry — never part of the compile-time typed tree.
 */
import type { AuthState } from '@tai42/studio-sdk';
import { createRouter, type RouterHistory } from '@tanstack/react-router';

import { RouteErrorComponent } from './error-boundary';
import { buildFeatureRoutes } from './feature-routes';
import { NotFoundComponent } from './not-found';
import type { PluginLoader } from './plugin-loader';
import { buildShellRoutes } from './shell-routes';

export interface BuildRouterOptions {
  readonly plugins: PluginLoader;
  /**
   * The LIVE auth state, read at guard time. A getter (not a value/router context)
   * so `beforeLoad` sees the credential the instant it changes — the composition
   * root mirrors React auth into it synchronously during render, so a post-login
   * navigation is already authenticated when its guard re-evaluates (no redirect
   * loop between /login and the destination).
   */
  readonly getAuth: () => AuthState;
  /** A memory history for tests; defaults to the browser history in production. */
  readonly history?: RouterHistory;
}

export function buildRouter(options: BuildRouterOptions) {
  const { plugins, getAuth } = options;
  const { rootRoute, loginRoute, authedLayout, indexRoute } = buildShellRoutes({
    plugins,
    getAuth,
  });

  const routeTree = rootRoute.addChildren([
    loginRoute,
    authedLayout.addChildren([indexRoute, ...buildFeatureRoutes(authedLayout, plugins)]),
  ]);

  return createRouter({
    routeTree,
    history: options.history,
    defaultPreload: false,
    defaultErrorComponent: RouteErrorComponent,
    // An unknown path renders a shell-styled 404 with a link home, not TanStack's
    // bare built-in text under an empty outlet.
    defaultNotFoundComponent: NotFoundComponent,
  });
}

export type AppRouter = ReturnType<typeof buildRouter>;

/**
 * Register the built route tree with TanStack Router so the code-first routes are
 * type-known globally: `useSearch({ from })` / `useParams({ from })` resolve each
 * route's `validateSearch` shape at its `from` path, and `router.navigate` checks
 * its `to`/`search`. This is what lets a route component read its validated search
 * as the exact typed contract instead of an untyped `any`.
 */
declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
