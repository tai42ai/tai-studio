/**
 * Test harness for the presets feature. `renderWithProviders` wraps the unit
 * under test in the exact provider stack the shell supplies at runtime — a
 * retry-disabled TanStack Query client, the SDK's raw `ApiProvider` (a stub
 * client, passed via `value=`), `ThemeProvider`, and a `NavigationProvider` whose
 * `navigate` is a spy. Only test dependencies are imported here; no production
 * module is stubbed.
 */
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ApiProvider,
  AuthProvider,
  NavigationProvider,
  SystemKindsProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import type { ApiClient, KindStatus } from '@tai42/api-client';
import { render, type RenderResult } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

/** A stub client: only the methods the unit under test calls need to be present. */
export type StubApiClient = Partial<ApiClient>;

export interface RenderWithProvidersResult extends RenderResult {
  readonly navigate: Mock;
  readonly queryClient: QueryClient;
}

/** The session key `AuthProvider` seeds from, set so `SystemKindsProvider` fetches. */
const SESSION_KEY = 'tai-studio.apiKey';

export function renderWithProviders(
  ui: ReactElement,
  {
    client,
    navigate: navigateOverride,
    systemKinds,
  }: { client: StubApiClient; navigate?: Mock; systemKinds?: readonly KindStatus[] },
): RenderWithProvidersResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // A stateful harness can pass its own navigate spy (one that updates the search it
  // feeds back in) so a client-side selection change actually fires the focus effect.
  const navigate = navigateOverride ?? vi.fn();
  // A `systemKinds` table drives the kind-status context to `ready`: seed a session
  // key so `AuthProvider` is authenticated and `SystemKindsProvider` fetches. With no
  // table the context stays `loading` and every feature reads not-off — the shape
  // every pre-gating test expects.
  if (systemKinds !== undefined) {
    globalThis.sessionStorage.setItem(SESSION_KEY, 'sk-test');
  } else {
    globalThis.sessionStorage.removeItem(SESSION_KEY);
  }
  // The stub only implements the methods exercised by a given test; the cast asserts
  // the shape the SDK context expects.
  const apiClient = (
    systemKinds !== undefined
      ? { ...client, getSystemKinds: () => Promise.resolve([...systemKinds]) }
      : client
  ) as ApiClient;

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider value={apiClient}>
          <SystemKindsProvider>
            <ThemeProvider>
              <NavigationProvider
                value={{
                  navigate,
                  resolvePath: () => '/x',
                  navigatePlugin: vi.fn(),
                  resolvePluginPath: () => '/x',
                }}
              >
                {ui}
              </NavigationProvider>
            </ThemeProvider>
          </SystemKindsProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return { ...result, navigate, queryClient };
}
