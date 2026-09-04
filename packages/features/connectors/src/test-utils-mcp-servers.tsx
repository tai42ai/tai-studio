/**
 * Render harness for the MCP-servers section tests (moved here with the section from
 * the manifest feature). It composes the exact provider stack the shell supplies — a
 * retry-free TanStack Query client, the raw `ApiProvider` carrying a stub client, the
 * theme, and a stub navigation surface — so the section renders against real providers
 * with a fake transport. Kept separate from `test-utils` because the MCP tests drive
 * a PARTIAL client (and sometimes their own QueryClient), a different shape from the
 * provider/OAuth tests' full-client harness.
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
  navigatePlugin: vi.fn(),
  resolvePluginPath: () => '/x',
};

export function renderWithProviders(
  ui: ReactNode,
  { client, queryClient }: { client: Partial<ApiClient>; queryClient?: QueryClient },
): RenderResult {
  // A caller can supply its own client (to drive a background cache update via
  // `setQueryData` in-test); otherwise a fresh, retry-free one is used.
  const resolvedQueryClient =
    queryClient ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={resolvedQueryClient}>
      {/* The stub only implements the methods each test exercises; the section reads
          nothing else, so widening the partial stub to the full client is safe. */}
      <ApiProvider value={client as ApiClient}>
        <ThemeProvider>
          <NavigationProvider value={navigation}>{ui}</NavigationProvider>
        </ThemeProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
}
