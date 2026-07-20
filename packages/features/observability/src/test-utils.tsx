/**
 * Test harness: render a unit in the exact provider stack the shell supplies at
 * runtime — a retry-disabled TanStack Query client (so a rejected query surfaces
 * its error state immediately), the SDK's `ApiProvider` fed a stub client, the
 * theme, and a `NavigationProvider` whose `navigate` is a spy so URL writes can be
 * asserted. Only test dependencies are imported; no production module is stubbed.
 */
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

import type { ApiClient } from '@tai42/api-client';
import { ApiProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';

/** A stub client: only the methods the unit under test calls need to be present. */
export type StubApiClient = Partial<ApiClient>;

export interface RenderWithProvidersResult extends RenderResult {
  readonly navigate: Mock;
  readonly queryClient: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  { client }: { readonly client: StubApiClient },
): RenderWithProvidersResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const navigate = vi.fn();
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
