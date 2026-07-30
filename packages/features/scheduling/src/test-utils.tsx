/**
 * Shared test harness: render a feature tree inside the exact provider stack the
 * shell supplies at runtime — a fresh QueryClient (retries off so a rejected query
 * surfaces the error state immediately), the typed API client, the theme, and a
 * stub navigation context.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';

import type { ApiClient, ScheduleItem } from '@tai42/api-client';
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

/**
 * Build a mock `ApiClient` from a partial set of methods; the feature only ever
 * touches the scheduling seams, so unstubbed methods are irrelevant to these
 * tests (a call to one that was not provided throws, surfacing the omission).
 *
 * The add dialog's picker enriches with the tool tags + tool_meta overlay to drop
 * effective-hidden tools; those two reads are best-effort, so they get a benign
 * empty default here and a test overrides them only when it exercises the exclusion.
 */
export function makeClient(overrides: Partial<ApiClient>): ApiClient {
  return {
    listToolTags: vi.fn(() => Promise.resolve([])),
    listToolMeta: vi.fn(() => Promise.resolve({ folders: [], meta: [] })),
    ...overrides,
  } as ApiClient;
}

/**
 * A redacted schedule fixture (schedules are secret-bearing — `kwargs` can embed
 * credentials — so these are hand-authored, never auto-captured).
 */
export function schedule(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    name: 'nightly-report',
    enabled: true,
    schedule: { __type: 'crontab', minute: '0', hour: '2' },
    kwargs: { backend_tool_name: 'run_report_schedule_task' },
    ...overrides,
  };
}
