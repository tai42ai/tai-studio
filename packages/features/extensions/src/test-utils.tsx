/**
 * Shared test harness: render a feature tree inside the exact provider stack the
 * shell supplies at runtime — a fresh QueryClient (retries off so a rejected
 * query surfaces the error state immediately), the typed API client, the theme,
 * and a stub navigation context.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';

import type { ApiClient } from '@tai42/api-client';
import { ApiProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  readonly client: ApiClient;
}

export function renderWithProviders(ui: ReactNode, options: ProviderOptions): RenderResult {
  const { client, ...renderOptions } = options;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={queryClient}>
        <ApiProvider value={client}>
          <ThemeProvider>
            <NavigationProvider
              value={{
                navigate: vi.fn(),
                resolvePath: () => '/x',
                navigatePlugin: vi.fn(),
                resolvePluginPath: () => '/x',
              }}
            >
              {children}
            </NavigationProvider>
          </ThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    );
  }

  return render(ui as ReactElement, { wrapper: Wrapper, ...renderOptions });
}
