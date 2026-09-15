/**
 * Test harness for the marketplace feature. `renderWithProviders` wraps the unit
 * under test in the exact provider stack the shell supplies at runtime — a
 * retry-disabled TanStack Query client, the SDK's raw `ApiProvider` (a stub
 * client), `ThemeProvider`, and a `NavigationProvider` whose `navigate` is a spy
 * so navigation can be asserted. Only test dependencies are imported here; no
 * production module is stubbed.
 */
import type {
  ApiClient,
  MarketplaceAdvisory,
  MarketplaceInstalled,
  MarketplaceInstalledPlugin,
  MarketplaceInstallPreview,
  MarketplaceInstallResult,
  MarketplacePluginDetail,
  MarketplaceSearchPage,
  MarketplaceSearchRow,
} from '@tai42/api-client';
import type { NavigationContextValue, RouteSearch, RouteToken } from '@tai42/studio-sdk';
import { ApiProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';
import { flushResizeObservers, setElementOverflow } from '@tai42/studio-sdk/testing';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, type RenderResult, screen } from '@testing-library/react';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { type Mock, vi } from 'vitest';

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

  // The stack is a `wrapper`, not part of the rendered element: RTL's `rerender`
  // replaces only the element, so a wrapper keeps the providers (and the query
  // cache) alive across a re-render with new props.
  const wrapper = ({ children }: { readonly children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>
      <ApiProvider value={apiClient}>
        <ThemeProvider>
          <NavigationProvider
            value={{
              navigate,
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
          navigatePlugin: vi.fn(),
          resolvePluginPath: () => '/x',
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

// -- plugin-detail fixtures --------------------------------------------------

export function detailFixture(
  overrides: Partial<MarketplacePluginDetail> = {},
): MarketplacePluginDetail {
  return {
    namespace: 'tai42',
    name: 'toolbox',
    display_name: 'Toolbox',
    icon_url: null,
    package: 'tai42-toolbox',
    description: 'A box of tools.',
    readme_md: null,
    license: 'Apache-2.0',
    homepage_url: null,
    repository_url: 'https://github.com/tai42ai/toolbox',
    categories: ['productivity'],
    tags: ['cli'],
    trust_tier: 'official',
    pricing: 'free',
    downloads: 1234,
    latest: {
      version: '1.2.0',
      contract_range: '>=1.0',
      status: 'published',
      published_at: '2026-07-01T00:00:00Z',
      items: [
        {
          kind: 'tool',
          name: 'uuid',
          description: 'Generate a UUID.',
          tags: ['uuid'],
          group: 'utilities',
        },
      ],
    },
    versions: [
      {
        version: '1.2.0',
        contract_range: '>=1.0',
        status: 'published',
        published_at: '2026-07-01T00:00:00Z',
      },
      { version: '1.1.0', contract_range: '>=1.0', status: 'killed', published_at: null },
    ],
    ...overrides,
  };
}

export function installedRow(
  overrides: Partial<MarketplaceInstalledPlugin> = {},
): MarketplaceInstalledPlugin {
  return {
    ref: 'tai42/toolbox',
    version: '1.2.0',
    source: 'github',
    delivery: 'package',
    installed_at: '2026-07-01T00:00:00Z',
    latest: null,
    update_available: false,
    incompatible_newer: null,
    missing_upstream: false,
    compat: { status: 'compatible', reason: null },
    items: [],
    route_mounts: {},
    ...overrides,
  };
}

/** The installed-listing envelope: rows plus the boot-quarantine list. */
export function installedList(plugins: MarketplaceInstalledPlugin[]): MarketplaceInstalled {
  return { installed: plugins, quarantined: [] };
}

export function advisory(overrides: Partial<MarketplaceAdvisory> = {}): MarketplaceAdvisory {
  return {
    id: 7,
    listing: 'tai42/toolbox',
    affected_versions: '<1.2.0',
    severity: 'critical',
    summary: 'RCE in the shell tool.',
    created_at: '2026-07-01T00:00:00Z',
    withdrawn_at: null,
    ...overrides,
  };
}

export const emptyAdvisories: { advisories: MarketplaceAdvisory[]; fetched_at: string } = {
  advisories: [],
  fetched_at: '2026-07-10T00:00:00Z',
};

export const noop = (): void => undefined;

/** A promise that never settles, for exercising the pending branch. */
export function pending<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

/** A clean install preview: no routes, no required env — the shape a route-less,
 *  env-less plugin's dry-run returns, driving the plain one-click confirm. */
export function blankPreview(): MarketplaceInstallPreview {
  return {
    ref: 'tai42/toolbox',
    version: '1.2.0',
    items: [],
    collisions: [],
    public_routes: [],
    new_public_routes: [],
    requires_public_acceptance: false,
    required_env: [],
    missing_env: [],
    delivery: 'package',
  };
}

/**
 * A stub covering the detail view's read queries. A non-route install always dry-runs
 * the install PREVIEW first (that dry-run is the ONLY authority on whether env is
 * needed — the registry detail omits per-item required_env), so a clean preview is
 * stubbed by default; a test that needs env overrides `previewMarketplaceInstall`.
 */
export function reads(
  detail: MarketplacePluginDetail,
  installed: MarketplaceInstalledPlugin[],
  advisories = emptyAdvisories,
): StubApiClient {
  return {
    getMarketplacePlugin: vi.fn().mockResolvedValue(detail),
    listInstalledMarketplacePlugins: vi.fn().mockResolvedValue(installedList(installed)),
    getMarketplaceAdvisories: vi.fn().mockResolvedValue(advisories),
    previewMarketplaceInstall: vi.fn().mockResolvedValue(blankPreview()),
  };
}

/** A packaged mcp-server whose item declares a NON-secret marker var (DATABASE_URL):
 *  only an OAuth client secret is secret, so its toggle starts off. */
export function mcpServerDetail(): MarketplacePluginDetail {
  return detailFixture({
    package: 'tai42-postgres-mcp',
    latest: {
      version: '1.0.0',
      contract_range: '>=1.0',
      status: 'published',
      published_at: '2026-07-01T00:00:00Z',
      items: [
        {
          kind: 'mcp-server',
          name: 'postgres',
          description: 'PG.',
          tags: [],
          group: null,
          required_env: [{ name: 'DATABASE_URL', secret: false }],
        },
      ],
    },
  });
}

/** A descriptor connector whose item declares an OAuth client id (not secret) and
 *  client secret (secret, so its toggle is locked on). */
export function connectorDetail(): MarketplacePluginDetail {
  return detailFixture({
    namespace: 'iota',
    name: 'relay',
    package: null,
    latest: {
      version: '1.0.0',
      contract_range: '>=1.0',
      status: 'published',
      published_at: '2026-07-01T00:00:00Z',
      items: [
        {
          kind: 'connector',
          name: 'relay',
          description: 'A hosted connector.',
          tags: [],
          group: null,
          required_env: [
            { name: 'IOTA_CLIENT_ID', secret: false },
            { name: 'IOTA_CLIENT_SECRET', secret: true },
          ],
        },
      ],
    },
  });
}

/** An install preview carrying only the env picture the env dialog reads. */
export function envPreview(missing: string[]): MarketplaceInstallPreview {
  return {
    ref: 'iota/relay',
    version: '1.0.0',
    items: [],
    collisions: [],
    public_routes: [],
    new_public_routes: [],
    requires_public_acceptance: false,
    required_env: [],
    missing_env: missing,
    delivery: 'descriptor',
  };
}

export const installReceipt = (ref: string): MarketplaceInstallResult => ({
  ref,
  version: '1.0.0',
  notes: [],
  advisories: [],
  routes: [],
});

/** The `<table>` whose header row carries `columnHeader`, failing loudly if absent. */
export function tableUnder(columnHeader: string): HTMLElement {
  const table = screen.getByRole('columnheader', { name: columnHeader }).closest('table');
  if (table === null) throw new Error(`no table above the ${columnHeader} column`);
  return table;
}

/** The pane wrapping `element`, failing loudly when it has none. */
export function paneOf(element: HTMLElement): HTMLElement {
  const pane = element.parentElement;
  if (pane === null) throw new Error('element has no containing pane');
  return pane;
}

/** Reports every element in `elements` as overflowing and lets the observers see it. */
export function setOverflowing(...elements: readonly HTMLElement[]): void {
  for (const element of elements) setElementOverflow(element, true);
  act(() => {
    flushResizeObservers();
  });
}

// -- browse fixtures ---------------------------------------------------------

export function searchRow(overrides: Partial<MarketplaceSearchRow> = {}): MarketplaceSearchRow {
  return {
    ref: 'tai42/toolbox',
    namespace: 'tai42',
    name: 'toolbox',
    display_name: 'Toolbox',
    icon_url: null,
    package: 'tai42-toolbox',
    description: 'A box of tools.',
    categories: ['productivity'],
    tags: ['cli'],
    trust_tier: 'official',
    pricing: 'free',
    latest_version: '1.2.0',
    downloads: 1234,
    updated_at: '2026-07-01T00:00:00Z',
    kinds: [{ kind: 'tool', count: 1, names: ['generate_uuid'] }],
    groups: [],
    ...overrides,
  };
}

export function searchPage(
  listings: MarketplaceSearchRow[],
  meta: Partial<Pick<MarketplaceSearchPage, 'total' | 'page' | 'page_size'>> = {},
): MarketplaceSearchPage {
  return {
    listings,
    total: meta.total ?? listings.length,
    page: meta.page ?? 1,
    page_size: meta.page_size ?? 20,
  };
}

/** A minimal published listing detail for the drill-in that replaces browse chrome. */
export function browseDetailFixture(): MarketplacePluginDetail {
  return {
    namespace: 'tai42',
    name: 'toolbox',
    display_name: 'Toolbox',
    icon_url: null,
    package: 'tai42-toolbox',
    description: 'A box of tools.',
    readme_md: null,
    license: null,
    homepage_url: null,
    repository_url: null,
    categories: [],
    tags: [],
    trust_tier: 'official',
    pricing: 'free',
    downloads: 1,
    latest: null,
    versions: [],
  };
}

/** Browse-only reads: the search page + the category and kind facets' own lists. */
export function browseReads(
  page: MarketplaceSearchPage,
  categories: string[] = ['productivity'],
  kinds: string[] = ['tool', 'agent'],
): StubApiClient {
  return {
    searchMarketplace: vi.fn().mockResolvedValue(page),
    listMarketplaceCategories: vi.fn().mockResolvedValue(categories),
    listMarketplaceKinds: vi.fn().mockResolvedValue(kinds),
  };
}
