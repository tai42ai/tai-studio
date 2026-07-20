/**
 * Test harness for the connectors feature. `renderWithProviders` wraps the UI in
 * the exact provider stack the shell supplies: a retry-disabled
 * QueryClient, the raw `ApiProvider`, the ThemeProvider, and a NavigationProvider
 * with spy-able `navigate` / `resolvePath`.
 */
import { ApiProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';
import type { NavigationContextValue } from '@tai42/studio-sdk';
import type { ApiClient, ConnectionView, ProviderView } from '@tai42/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

export interface RenderOptions {
  readonly client: ApiClient;
}

export type RenderWithProvidersResult = RenderResult & {
  readonly nav: NavigationContextValue;
  readonly queryClient: QueryClient;
};

export function renderWithProviders(
  ui: ReactElement,
  { client }: RenderOptions,
): RenderWithProvidersResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const nav: NavigationContextValue = {
    navigate: vi.fn(),
    resolvePath: () => '/x',
  };
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider value={client}>
        <ThemeProvider>
          <NavigationProvider value={nav}>{ui}</NavigationProvider>
        </ThemeProvider>
      </ApiProvider>
    </QueryClientProvider>,
  );
  return { ...utils, nav, queryClient };
}

/** Build a mock `ApiClient` from a partial set of methods; unused ones throw if hit. */
export function makeClient(overrides: Partial<ApiClient>): ApiClient {
  return overrides as ApiClient;
}

/** A fake popup window matching the surface `useOAuthPopup` touches. */
export interface FakePopup {
  closed: boolean;
  close: ReturnType<typeof vi.fn>;
}

export function makeFakePopup(): FakePopup {
  return { closed: false, close: vi.fn() };
}

/** Dispatch a `message` event as the browser would, with a chosen origin + source. */
export function postMessageFrom(
  source: unknown,
  data: unknown,
  origin: string = window.location.origin,
): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
}

export function provider(overrides: Partial<ProviderView> = {}): ProviderView {
  return {
    id: 'github',
    display_name: 'GitHub',
    description: 'Connect your GitHub account.',
    icon_url: '',
    kind: 'oauth',
    origin: 'system',
    category: 'dev',
    sub_services: [
      { id: 'repo', display_name: 'Repositories', description: '', scopes: ['repo'] },
      { id: 'gist', display_name: 'Gists', description: '', scopes: ['gist'] },
    ],
    config_fields: [],
    ...overrides,
  };
}

export function connection(overrides: Partial<ConnectionView> = {}): ConnectionView {
  return {
    connection_id: 'conn-1',
    provider_id: 'github',
    alias: 'work',
    kind: 'oauth',
    account_identity: 'octocat',
    enabled_sub_services: ['repo'],
    granted_scopes: ['repo'],
    auth_health_state: 'healthy',
    created_at: '2026-07-04T00:00:00Z',
    ...overrides,
  };
}
