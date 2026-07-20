/**
 * Test harness for the marketplace feature. `renderWithProviders` wraps the unit
 * under test in the exact provider stack the shell supplies at runtime — a
 * retry-disabled TanStack Query client, the SDK's raw `ApiProvider` (a stub
 * client), `ThemeProvider`, and a `NavigationProvider` whose `navigate` is a spy
 * so navigation can be asserted. Only test dependencies are imported here; no
 * production module is stubbed.
 */
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';
import type { ApiClient } from '@tai42/api-client';
import { render, type RenderResult } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

/** A stub client: only the methods the unit under test calls need to be present. */
export type StubApiClient = Partial<ApiClient>;

export interface RenderWithProvidersResult extends RenderResult {
  readonly navigate: Mock;
  readonly queryClient: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  { client }: { client: StubApiClient },
): RenderWithProvidersResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const navigate = vi.fn();
  // The stub only implements the methods exercised by a given test; the cast
  // asserts the shape the SDK context expects.
  const apiClient = client as ApiClient;

  const result = render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider value={apiClient}>
        <ThemeProvider>
          <NavigationProvider value={{ navigate, resolvePath: () => '/x' }}>
            {ui}
          </NavigationProvider>
        </ThemeProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );

  return { ...result, navigate, queryClient };
}
