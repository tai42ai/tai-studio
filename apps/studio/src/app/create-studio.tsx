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
 * JqPrimitivesProvider ▸ RouterProvider.
 */
import { useEffect, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  SystemKindsProvider,
  ThemeProvider,
  ToolDisplayNamesProvider,
  UnauthorizedProvider,
  useAuth,
  type AuthState,
  type NavigationContextValue,
} from '@tai42/studio-sdk';
import { ApiUnauthorizedError, type ApiClient } from '@tai42/api-client';

import { PATH } from './routes';
import { buildRouter, type AppRouter } from './router';
import { AppErrorBoundary } from './error-boundary';
import { JqPrimitivesProvider } from './jq-primitives';
import { createNavigation } from './navigation';
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

const nativeImport: ImportModule = (url) => import(/* @vite-ignore */ url);

/**
 * Inject a plugin stylesheet as a same-origin SRI'd `<link rel="stylesheet">` in
 * the document head and resolve once it loads, with a remover that detaches it. A
 * same-origin response is SRI-eligible with no `crossorigin`, so a byte mismatch
 * fails the integrity check and fires `error`, which rejects loudly. The link is
 * appended synchronously so its styles are in the cascade before the plugin's JS
 * imports and any contributed component renders.
 */
const nativeLoadStylesheet: LoadStylesheet = (url, integrity) =>
  new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.integrity = integrity;
    const remove = (): void => {
      link.remove();
    };
    link.addEventListener(
      'load',
      () => {
        resolve(remove);
      },
      { once: true },
    );
    link.addEventListener(
      'error',
      () => {
        link.remove();
        reject(new Error(`stylesheet failed to load (fetch or integrity): ${url}`));
      },
      { once: true },
    );
    document.head.appendChild(link);
  });

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

  function Inner(): ReactNode {
    const auth = useAuth();
    // Mirror the live auth into the holders the router + api-client read lazily. A
    // plain ref write (no subscription) is safe during render and keeps the guard
    // and getToken current before any effect or navigation runs.
    tokenHolder.current = auth.token;
    authHolder.current = auth;

    // Re-run guards when auth flips: logout bounces the current authed route to
    // /login; login re-validates the guarded destination. On any transition to
    // logged-out (explicit sign-out or a 401) the query cache is cleared, so a
    // later sign-in on a shared machine never flashes the prior session's data.
    useEffect(() => {
      if (!auth.isAuthenticated) queryClient.clear();
      void router.invalidate();
    }, [auth.isAuthenticated]);

    return (
      <NavigationProvider value={navigation}>
        {/* Injects the Studio design system into @tai42/jq-studio once for the whole
            routed tree, so every JqField — a host feature's or a plugin page's —
            paints in the SDK look off the single shared jq-studio instance (React is
            the import-map singleton, so one provider reaches both). */}
        <JqPrimitivesProvider>
          <RouterProvider router={router} />
        </JqPrimitivesProvider>
      </NavigationProvider>
    );
  }

  function App(): ReactNode {
    // The boundary sits inside ThemeProvider so its fallback is themed, and wraps
    // the whole shell so a render throw outside the routed tree still surfaces
    // loudly. Errors thrown inside a route are handled by the router's own
    // defaultErrorComponent and never reach here.
    return (
      <ThemeProvider>
        <AppErrorBoundary>
          <AuthProvider>
            <QueryClientProvider client={queryClient}>
              <ApiProvider value={apiClient}>
                <UnauthorizedProvider value={handleUnauthorized}>
                  {/* CapabilityProvider consumes the authed ApiProvider (so a 401 on
                      its `/me` fetch routes through the same unauthorized handling)
                      and provides the caller's projection to the shell. It runs a
                      plain fetch state machine, so the query-cache wipe on auth flips
                      never drops it. */}
                  {/* SystemKindsProvider reads the DB-backed feature states (`GET
                      /api/system/kinds`) proactively, so a write affordance for an
                      OFF feature hides before the user acts. Like CapabilityProvider
                      it runs a plain fetch state machine that the query-cache wipe on
                      auth flips never drops, and it fails open (not-off) rather than
                      blocking the shell. */}
                  {/* ToolDisplayNamesProvider reads the tool-meta overlay (`GET
                      /api/tool-meta`) once per auth flip, so every tool picker labels
                      raw names with their human display names from one shared read. It
                      too runs a plain fetch state machine and fails open (empty map ⇒
                      bare raw names) rather than blocking the shell. */}
                  <CapabilityProvider>
                    <SystemKindsProvider>
                      <ToolDisplayNamesProvider>
                        <Inner />
                      </ToolDisplayNamesProvider>
                    </SystemKindsProvider>
                  </CapabilityProvider>
                </UnauthorizedProvider>
              </ApiProvider>
            </QueryClientProvider>
          </AuthProvider>
        </AppErrorBoundary>
      </ThemeProvider>
    );
  }

  return { App, router, queryClient, pluginLoader, apiClient, navigation };
}
