/**
 * Test harness: render a unit in the exact provider stack the shell supplies at
 * runtime — a retry-disabled TanStack Query client (so a rejected query surfaces
 * its error state immediately), the SDK's `ApiProvider` fed a stub client, the
 * theme, and a `NavigationProvider` whose `navigate` is a spy so URL writes can be
 * asserted. Only test dependencies are imported; no production module is stubbed.
 */
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

import type { ApiClient } from '@tai42/api-client';
import { ApiProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';
import type { NavigationContextValue, RouteSearch, RouteToken } from '@tai42/studio-sdk';

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

  // The stack is a `wrapper`, not part of the rendered element: RTL's `rerender`
  // replaces only the element, so a wrapper keeps the providers (and the query
  // cache) alive across a re-render with new props.
  const wrapper = ({ children }: { readonly children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider value={apiClient}>
        <ThemeProvider>
          <NavigationProvider value={{ navigate, resolvePath: () => '/x' }}>
            {children}
          </NavigationProvider>
        </ThemeProvider>
      </ApiProvider>
    </QueryClientProvider>
  );

  const result = render(ui, { wrapper });

  return { ...result, navigate, queryClient };
}

/**
 * The same stack under a LIVE url: `navigate` writes the committed search back into
 * the `search` the page renders from, exactly as the shell's router does. The spy
 * harness above never feeds a commit back, so a control that REMOUNTS on the value
 * its own commit writes looks stable under the spy while tearing itself out from
 * under the keyboard in the running app.
 */
export function renderWithLiveUrl<T extends RouteToken>(
  page: (search: RouteSearch<T>) => ReactElement,
  {
    client,
    initialSearch,
  }: { readonly client: StubApiClient; readonly initialSearch: RouteSearch<T> },
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const apiClient = client as ApiClient;

  function Harness(): ReactElement {
    const [search, setSearch] = useState<RouteSearch<T>>(initialSearch);
    const value = useMemo<NavigationContextValue>(
      () =>
        ({
          navigate: (_token: RouteToken, next?: RouteSearch<T>) => {
            setSearch(next ?? {});
          },
          resolvePath: () => '/x',
        }) as NavigationContextValue,
      [],
    );
    return (
      <QueryClientProvider client={queryClient}>
        <ApiProvider value={apiClient}>
          <ThemeProvider>
            <NavigationProvider value={value}>{page(search)}</NavigationProvider>
          </ThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    );
  }

  return render(<Harness />);
}
