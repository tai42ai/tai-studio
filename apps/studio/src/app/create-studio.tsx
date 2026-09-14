/**
 * Composition root. Wires the provider stack, the TanStack Query client
 * (with the global 401→`/login` handler), the router, and the Studio-plugin
 * loader into one `App`. Kept injectable so the shell tests drive the real tree:
 * `createClient` receives the live token getter, `importModule` resolves plugin
 * bundles, and `history` supplies a memory history.
 *
 * Provider order (outermost→inner): ThemeProvider ▸ AuthProvider ▸
 * QueryClientProvider ▸ ApiProvider ▸ UnauthorizedProvider ▸ CapabilityProvider ▸
 * SystemKindsProvider ▸ ToolDisplayNamesProvider ▸ NavigationProvider ▸
 * JqPrimitivesProvider ▸ ExpressionFieldContext ▸ RouterProvider.
 */
import { type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { type RouterHistory } from '@tanstack/react-router';
import { type AuthState, type NavigationContextValue } from '@tai42/studio-sdk';
import { ApiUnauthorizedError, type ApiClient } from '@tai42/api-client';

import { PATH } from './routes';
import { buildRouter, type AppRouter } from './router';
import { createNavigation } from './navigation';
import { nativeImport, nativeLoadStylesheet } from './plugin-loader-native';
import { createStudioApp } from './studio-app';
import {
  createPluginLoader,
  type ImportModule,
  type LoadStylesheet,
  type PluginLoader,
} from './plugin-loader';

export interface StudioDeps {
  /** Build the typed client around the shell's live token getter. */
  readonly createClient: (getToken: () => string | null) => ApiClient;
  /** Resolve a Studio-plugin bundle URL to a module (defaults to native import). */
  readonly importModule?: ImportModule;
  /** Inject a plugin stylesheet link (defaults to the real DOM implementation). */
  readonly loadStylesheet?: LoadStylesheet;
  /** A memory history for tests; production uses the browser history. */
  readonly history?: RouterHistory;
}

export interface Studio {
  readonly App: () => ReactNode;
  readonly router: AppRouter;
  readonly queryClient: QueryClient;
  readonly pluginLoader: PluginLoader;
  readonly apiClient: ApiClient;
  /** The runtime navigation surface, exposed so a caller (and tests) can drive
   * token and plugin-page navigation directly. */
  readonly navigation: NavigationContextValue;
}

export function createStudio(deps: StudioDeps): Studio {
  const LOGGED_OUT: AuthState = {
    token: null,
    isAuthenticated: false,
    login: () => undefined,
    logout: () => undefined,
  };

  // Holders the router/api-client read lazily; `Inner` mirrors the live React auth
  // into them every render, so `getToken` carries the latest key and the auth guard
  // sees the credential the instant it changes (no post-login redirect loop).
  const tokenHolder: { current: string | null } = { current: null };
  const authHolder: { current: AuthState } = { current: LOGGED_OUT };
  const apiClient = deps.createClient(() => tokenHolder.current);

  let routerRef: AppRouter | null = null;

  /** A 401 anywhere routes back to `/login`, capturing the current location as the
   * returnTo. During the post-login plugin load this is a login redirect,
   * never a plugin error card.
   *
   * A 401 means the stored credential is invalid/expired, so it is CLEARED first
   * (synchronously, before the navigation) — otherwise the login screen, still
   * seeing an "authenticated" state, would bounce straight back to the guarded
   * route and 401 again in a loop. The operator re-enters a key and returns. */
  const handleUnauthorized = (): void => {
    const router = routerRef;
    if (router === null) return;
    flushSync(() => {
      authHolder.current.logout();
    });
    const location = router.state.location;
    if (location.pathname === PATH.login) return;
    void router.navigate({ to: '/login', search: { redirect: location.href } });
  };

  const pluginLoader = createPluginLoader({
    api: apiClient,
    importModule: deps.importModule ?? nativeImport,
    loadStylesheet: deps.loadStylesheet ?? nativeLoadStylesheet,
    onUnauthorized: handleUnauthorized,
  });

  const router = buildRouter({
    plugins: pluginLoader,
    getAuth: () => authHolder.current,
    history: deps.history,
  });
  routerRef = router;

  const onError = (error: unknown): void => {
    if (error instanceof ApiUnauthorizedError) handleUnauthorized();
  };

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
  });

  const navigation = createNavigation(router);

  const App = createStudioApp({
    apiClient,
    queryClient,
    handleUnauthorized,
    router,
    navigation,
    tokenHolder,
    authHolder,
  });

  return { App, router, queryClient, pluginLoader, apiClient, navigation };
}
