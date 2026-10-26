/**
 * Test harness for the connectors feature. `renderWithProviders` wraps the UI in
 * the exact provider stack the shell supplies: a retry-disabled
 * QueryClient, the raw `ApiProvider`, the auth + capability contexts, the
 * ThemeProvider, and a NavigationProvider with spy-able `navigate` / `resolvePath`.
 *
 * The directory's reads and write controls gate on the capability projection. A
 * test that passes no projection seeds no session key, so `CapabilityProvider` stays
 * unauthenticated and every gate falls closed; `fullProjection` and
 * `scopedProjection` build the projection a test passes to open them.
 */
import type {
  ApiClient,
  ConnectionView,
  ConnectorCategoryView,
  DiscoveredServer,
  ManifestMcpEntry,
  MarketplaceInstallResult,
  MarketplacePluginDetail,
  MarketplaceSearchPage,
  MarketplaceSearchRow,
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
 * The Connectors directory also reads the preserved manifest, the live MCP status
 * and the marketplace on mount. Those reads default to QUIET empty answers here (no
 * mounted servers, an empty manifest, nothing installed); a caller overrides any of
 * them to drive the directory's server and listing rows.
 */
export function makeClient(overrides: Partial<ApiClient>): ApiClient {
  const mcpQuietDefaults: Partial<ApiClient> = {
    getMcpStatus: vi.fn().mockResolvedValue({ bound: {}, failed: [] }),
    getManifestPreserved: vi.fn().mockResolvedValue({
      mcp: [],
      user_tools: [],
      extension_settings: {
        extensions_modules: [],
        backend_module: null,
        tools: [],
        mcp: [],
        api_tools: {},
      },
    }),
    getMcpConfigSchema: vi.fn().mockResolvedValue({ type: 'object', properties: {} }),
    listExtensions: vi.fn().mockResolvedValue([]),
    getEnvConfig: vi.fn().mockResolvedValue({ env: {}, secret_keys: [], deployment_keys: [] }),
    listInstalledMarketplacePlugins: vi.fn().mockResolvedValue({ installed: [] }),
    searchMarketplace: vi.fn().mockResolvedValue(searchPage([])),
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

const baseProjection: MeProjection = {
  access_control_enabled: true,
  user_id: 'u-test',
  owner_user_id: null,
  principal: null,
  admin: false,
  public_resource_id: 'public',
  scopes: [],
  routes: [],
  route_patterns: [],
  sub_mcp: [],
  tools: [],
  agents: [],
  mintable: false,
};

/** An administrator's projection: every route is reached. */
export function fullProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...baseProjection, admin: true, ...overrides };
}

/** A scoped (non-admin) projection restricted to the given routes and patterns. */
export function scopedProjection(overrides: Partial<MeProjection> = {}): MeProjection {
  return { ...baseProjection, ...overrides };
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
} satisfies MarketplaceInstallResult['reload']['fanout'];

/** A preserved-manifest MCP entry; `connectionId` makes it a connection's managed entry. */
export function mcpEntry(
  title: string,
  {
    connectionId = null,
    providerId = 'github',
    include = [],
    exclude = [],
  }: {
    connectionId?: string | null;
    providerId?: string;
    include?: string[];
    exclude?: string[];
  } = {},
): ManifestMcpEntry {
  return {
    title,
    config: { transport: 'streamable-http', url: 'https://mcp.example.com/mcp' },
    include,
    exclude,
    managed:
      connectionId === null
        ? null
        : { connection_id: connectionId, provider_id: providerId, sub_service: 'default' },
  };
}

/** A preserved-manifest answer holding `mcp`. */
export function preservedManifest(mcp: ManifestMcpEntry[]) {
  return {
    mcp,
    user_tools: [],
    extension_settings: {
      extensions_modules: [],
      backend_module: null,
      tools: [],
      mcp: [],
      api_tools: {},
    },
  };
}

/** A marketplace search row of one item kind. */
export function listing(overrides: Partial<MarketplaceSearchRow> = {}): MarketplaceSearchRow {
  return {
    ref: 'acme/mail',
    namespace: 'acme',
    name: 'mail',
    display_name: 'Acme Mail',
    icon_url: null,
    package: 'acme-mail',
    description: 'Send and read mail.',
    categories: [],
    tags: [],
    trust_tier: 'community',
    pricing: 'free',
    premium: false,
    latest_version: '1.0.0',
    downloads: 0,
    updated_at: '2026-07-01T00:00:00Z',
    kinds: [{ kind: 'connector', count: 1, names: ['acme_mail'] }],
    groups: [],
    ...overrides,
  };
}

/** One search page; `total` defaults to the rows given, so there is no next page. */
export function searchPage(
  listings: MarketplaceSearchRow[],
  { page = 1, total = listings.length, pageSize = 20 } = {},
): MarketplaceSearchPage {
  return { listings, total, page, page_size: pageSize };
}

/** A listing's detail whose latest version holds `items`. */
export function listingDetail(
  items: { kind: string; name: string }[],
  overrides: Partial<MarketplacePluginDetail> = {},
): MarketplacePluginDetail {
  return {
    namespace: 'acme',
    name: 'mail',
    display_name: 'Acme Mail',
    icon_url: null,
    package: 'acme-mail',
    source: 'pypi',
    description: 'Send and read mail.',
    readme_md: null,
    license: null,
    homepage_url: null,
    repository_url: null,
    categories: [],
    tags: [],
    trust_tier: 'community',
    pricing: 'free',
    premium: false,
    downloads: 0,
    latest: {
      version: '1.0.0',
      contract_range: '>=1.0',
      status: 'published',
      published_at: '2026-07-01T00:00:00Z',
      items: items.map((item) => ({ ...item, description: '', tags: [], group: null })),
    },
    versions: [],
    ...overrides,
  };
}

/** An install receipt whose reload carries `fanout` (a local-only reload by default). */
export function installReceipt(
  fanout: MarketplaceInstallResult['reload']['fanout'] = {
    mode: 'local-only',
    note: 'only this worker reloaded',
  },
): MarketplaceInstallResult {
  return {
    ref: 'acme/mail',
    version: '1.0.0',
    notes: [],
    advisories: [],
    routes: [],
    package: null,
    pip_output: null,
    reload: {
      span_release_error: null,
      status: 'reloaded',
      env_keys: 0,
      recycle: null,
      awaiting_respawn: [],
      fanout,
    },
  };
}
