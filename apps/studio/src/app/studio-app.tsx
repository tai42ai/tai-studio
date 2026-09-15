/**
 * The composition root's React tree: the provider stack (`App`) and the inner node
 * (`Inner`) that mirrors live auth into the router/api-client holders and mounts the
 * router. Built by {@link createStudioApp} from the already-wired runtime pieces so
 * the shell tests drive the real tree.
 */
import type { ApiClient } from '@tai42/api-client';
// The expression-authoring door, imported STRAIGHT from the standalone editor
// package — the SDK re-exports nothing of jq. The import map resolves this bare
// specifier to the one served copy, so the door injected here, the primitives
// injected above it, and the worker installed at boot all bind the same instance.
import { JqField } from '@tai42/jq-studio';
import {
  ApiProvider,
  AuthProvider,
  type AuthState,
  CapabilityProvider,
  ExpressionFieldContext,
  type NavigationContextValue,
  NavigationProvider,
  SystemKindsProvider,
  ThemeProvider,
  ToolDisplayNamesProvider,
  UnauthorizedProvider,
  useAuth,
} from '@tai42/studio-sdk';
import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { type ReactNode, useEffect } from 'react';

import { AppErrorBoundary } from './error-boundary';
import { JqPrimitivesProvider } from './jq-primitives';
import type { AppRouter } from './router';

/** The already-wired runtime pieces the App tree renders around. */
export interface StudioAppConfig {
  readonly apiClient: ApiClient;
  readonly queryClient: QueryClient;
  readonly handleUnauthorized: () => void;
  readonly router: AppRouter;
  readonly navigation: NavigationContextValue;
  /** Holders the router/api-client read lazily; `Inner` mirrors live React auth into them. */
  readonly tokenHolder: { current: string | null };
  readonly authHolder: { current: AuthState };
}

export function createStudioApp(config: StudioAppConfig): () => ReactNode {
  const {
    apiClient,
    queryClient,
    handleUnauthorized,
    router,
    navigation,
    tokenHolder,
    authHolder,
  } = config;

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
            paints in the SDK look off the single shared jq-studio instance the import
            map serves (React is an import-map singleton too, so one provider reaches
            both). */}
        <JqPrimitivesProvider>
          {/* The jq authoring door, injected ONCE for every SchemaForm in the
              shell — feature forms, the SchemaEditor preview, an elicitation
              answer, a plugin page's own form. The SDK holds no edge to jq at
              all (a bundled consumer would otherwise EMIT the editor, its worker,
              and its wasm whether or not it authors expressions), so a
              schema's `x-tai42-expression` field renders the visual editor here
              because THIS host hands it the component. */}
          <ExpressionFieldContext.Provider value={JqField}>
            <RouterProvider router={router} />
          </ExpressionFieldContext.Provider>
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

  return App;
}
