/**
 * Shared render harness for the manifest feature tests. It composes the exact
 * provider stack the shell supplies — a retry-free TanStack Query client, the raw
 * `ApiProvider` carrying a stub client, the theme, and a stub navigation surface —
 * so a page renders against real providers with a fake transport.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';
import type { ApiClient } from '@tai42/studio-sdk';
import type { NavigationContextValue } from '@tai42/studio-sdk';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

const navigation: NavigationContextValue = {
  navigate: vi.fn(),
  resolvePath: () => '/x',
};

export function renderWithProviders(
  ui: ReactNode,
  { client }: { client: Partial<ApiClient> },
): RenderResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      {/* The stub only implements the methods each test exercises; the page reads
          nothing else, so widening the partial stub to the full client is safe. */}
      <ApiProvider value={client as ApiClient}>
        <ThemeProvider>
          <NavigationProvider value={navigation}>{ui}</NavigationProvider>
        </ThemeProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
}
