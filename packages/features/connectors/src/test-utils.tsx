/**
 * Test harness for the connectors feature. `renderWithProviders` wraps the UI in
 * the exact provider stack the shell supplies: a retry-disabled
 * QueryClient, the raw `ApiProvider`, the auth + capability contexts, the
 * ThemeProvider, and a NavigationProvider with spy-able `navigate` / `resolvePath`.
 *
 * The page embeds the MCP-servers section, whose write affordances gate on the
 * capability projection. These tests seed no session key, so `CapabilityProvider`
 * stays unauthenticated → the write gates fail closed (the section's read surfaces
 * still render); the connectors surfaces under test carry their own coverage. A test
 * that needs a gated affordance present drives it through the dedicated MCP harness.
 */
import type {
  ApiClient,
  ConnectionView,
  ConnectorCategoryView,
  DiscoveredServer,
  MeProjection,
  ProviderCatalogResponse,
  ProviderView,
} from '@tai42/api-client';
import type { NavigationContextValue } from '@tai42/studio-sdk';
import {
  ApiProvider,
  AuthProvider,
  CapabilityProvider,
  NavigationProvider,
  ThemeProvider,
} from '@tai42/studio-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RenderResult } from '@testing-library/react';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

export interface RenderOptions {
  readonly client: ApiClient;
  /**
   * The caller's capability projection. Given, a session key is seeded and `getMe`
   * answers it, so the write gates resolve against it; omitted, no key is seeded and
   * every write gate stays closed.
   */
  readonly projection?: MeProjection;
}

export type RenderWithProvidersResult = RenderResult & {
  readonly nav: NavigationContextValue;
  readonly queryClient: QueryClient;
};

export function renderWithProviders(
  ui: ReactElement,
  { client, projection }: RenderOptions,
): RenderWithProvidersResult {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const nav: NavigationContextValue = {
    navigate: vi.fn(),
    resolvePath: () => '/x',
    navigatePlugin: vi.fn(),
    resolvePluginPath: () => '/x',
  };
  // Without a projection no session key is seeded, so `CapabilityProvider` stays
  // unauthenticated and never fetches `getMe`: every write gate falls closed. With one,
  // the key is seeded and `getMe` answers the projection.
  let resolvedClient = client;
  if (projection === undefined) {
    globalThis.sessionStorage.removeItem('tai-studio.apiKey');
  } else {
    globalThis.sessionStorage.setItem('tai-studio.apiKey', 'sk-test');
    resolvedClient = { ...client, getMe: () => Promise.resolve(projection) };
  }
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider value={resolvedClient}>
          <CapabilityProvider>
            <ThemeProvider>
              <NavigationProvider value={nav}>{ui}</NavigationProvider>
            </ThemeProvider>
          </CapabilityProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...utils, nav, queryClient };
}

/**
 * Build a mock `ApiClient` from a partial set of methods; unused ones throw if hit.
 *
 * The unified Connectors page also renders the MCP-servers section, which reads a
 * handful of server doors on mount. A connectors test that cares only about the
 * providers/connections sections should not have to stub those, so they default to
 * QUIET empty answers here (no mounted servers, empty config) — a caller can still
 * override any of them to drive the MCP section explicitly.
 */
export function makeClient(overrides: Partial<ApiClient>): ApiClient {
  const mcpQuietDefaults: Partial<ApiClient> = {
    getMcpStatus: vi.fn().mockResolvedValue({ bound: {}, failed: [] }),
    getManifestPreserved: vi.fn().mockResolvedValue({ mcp: [], user_tools: [] }),
    getMcpConfigSchema: vi.fn().mockResolvedValue({ type: 'object', properties: {} }),
    listExtensions: vi.fn().mockResolvedValue([]),
    getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: [] }),
    listInstalledMarketplacePlugins: vi.fn().mockResolvedValue({ installed: [] }),
    getMcpEnvRefs: vi.fn().mockResolvedValue([]),
    listFailedMcps: vi.fn().mockResolvedValue({
      op: 'list_failed_mcps',
      reachable: true,
      local_only: true,
      results: [],
      error: null,
    }),
  };
  return { ...mcpQuietDefaults, ...overrides } as ApiClient;
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
    icon_url: 'https://cdn.example/gh.png',
    kind: 'oauth',
    origin: 'system',
    category: 'dev',
    sub_services: [
      { id: 'repo', display_name: 'Repositories', description: '', scopes: ['repo'] },
      { id: 'gist', display_name: 'Gists', description: '', scopes: ['gist'] },
    ],
    config_fields: [],
    removable: false,
    client_source: null,
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
    unreachable_sub_services: [],
    scopes_wanted: [],
    auth_health_state: 'healthy',
    created_at: '2026-07-04T00:00:00Z',
    ...overrides,
  };
}

export function category(overrides: Partial<ConnectorCategoryView> = {}): ConnectorCategoryView {
  return { id: 'dev', display_name: 'Developer tools', sort_order: 0, ...overrides };
}

/**
 * The reshaped `listProviders` response: providers plus their category groupings. A
 * bare `providers` array is wrapped with a single matching category by default.
 */
export function providerCatalog(
  providers: ProviderView[] = [provider()],
  categories: ConnectorCategoryView[] = [category()],
): ProviderCatalogResponse {
  return { providers, categories };
}

/** A provider added by address: no icon, removable, its client from the client store. */
export function discoveredProvider(overrides: Partial<ProviderView> = {}): ProviderView {
  return provider({
    id: 'remote_files',
    display_name: 'Remote files',
    description: '',
    icon_url: null,
    origin: 'community',
    category: 'dev',
    sub_services: [{ id: 'default', display_name: 'Remote files', description: '', scopes: [] }],
    removable: true,
    client_source: 'dynamic',
    ...overrides,
  });
}

/** A look-up answer: the server signs in at one service and registers apps by itself. */
export function discovered(overrides: Partial<DiscoveredServer> = {}): DiscoveredServer {
  return {
    url: 'https://mcp.example.com/mcp',
    resource: 'https://mcp.example.com/mcp',
    resource_name: 'Remote files',
    issuer: 'https://login.example.com',
    authorization_servers: ['https://login.example.com'],
    client_issuer: null,
    registration_supported: true,
    automatic_client: true,
    scopes_supported: ['files.read', 'files.write'],
    suggested_id: 'remote_files',
    suggested_display_name: 'Remote files',
    redirect_uri: 'https://studio.example.com/api/connectors/oauth/callback',
    ...overrides,
  };
}

/** A `fleet` fan-out with one applied and one stranded (`departed`) worker. */
export const NON_CONVERGED_FANOUT = {
  mode: 'fleet',
  op: 'reload_config',
  reachable: true,
  local_only: false,
  results: [
    { name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
    { name: 'serve-b', outcome: 'departed', payload: null, error: null, detail: 'left' },
  ],
  error: null,
};
