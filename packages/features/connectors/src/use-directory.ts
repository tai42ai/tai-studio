/**
 * The Connectors directory's reads and rows. Each read runs as its own query and
 * reports its own state: `loading`, `ready`, `refused` (the session's projection does
 * not reach the route, or the route answered 403) or `failed`. A read is not sent
 * until the capabilities are ready, and a refused route is never sent.
 *
 * The rows: one per provider (with its connections and each connection's managed
 * manifest entries), one per manifest MCP entry no provider row holds, and one per
 * marketplace listing of kind `connector` or `mcp-server` that is not installed yet.
 */
import type {
  ConnectionView,
  ManifestMcpEntry,
  MarketplaceSearchPage,
  MarketplaceSearchRow,
  ProviderView,
} from '@tai42/api-client';
import { apiRoutes } from '@tai42/api-client';
import {
  coversAnyRoute,
  installedMarketplacePluginsKey,
  isForbiddenError,
  isFullProjection,
  mcpStatusKey,
  preservedManifestKey,
  useApi,
  useCapabilities,
} from '@tai42/studio-sdk';
import { type InfiniteData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { CONNECTIONS_KEY, PROVIDERS_KEY } from './keys';

export type ReadState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'refused' }
  | { readonly status: 'failed'; readonly error: unknown; readonly retry: () => void };

/** The marketplace item kinds the directory lists. */
export const DIRECTORY_KINDS = ['connector', 'mcp-server'] as const;

/** A failed record of the live MCP status. */
export interface FailedServer {
  readonly title: string;
  readonly category: string;
  readonly message: string;
}

export interface McpStatusView {
  readonly bound: Readonly<Record<string, readonly string[]>>;
  readonly failed: readonly FailedServer[];
}

/** A manifest MCP entry as the directory reads it. */
export interface ServerEntry {
  readonly title: string;
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  readonly connectionId: string | null;
}

/** How one server title stands on the worker that answered the status read. */
export type ServerLiveState =
  | { readonly kind: 'bound'; readonly tools: readonly string[] }
  | { readonly kind: 'failed'; readonly failure: FailedServer }
  | { readonly kind: 'not_loaded' }
  | { readonly kind: 'unknown' };

export interface ProviderRow {
  readonly kind: 'provider';
  readonly key: string;
  readonly provider: ProviderView;
  /** R2's rows for this provider, or `null` while R2 loads, or `'unknown'` when R2 is refused or failed. */
  readonly connections: readonly ConnectionView[] | null | 'unknown';
}

export interface ServerRow {
  readonly kind: 'server';
  readonly key: string;
  readonly title: string;
  /** `null` when the configuration read is not ready (the card comes from the status read). */
  readonly entry: ServerEntry | null;
  readonly live: ServerLiveState;
  /** Whether an installed marketplace record holds this title; `null` when that read is not ready. */
  readonly fromMarketplace: boolean | null;
}

export interface ListingRow {
  readonly kind: 'listing';
  readonly key: string;
  readonly listing: MarketplaceSearchRow;
}

export type DirectoryRow = ProviderRow | ServerRow | ListingRow;

/** The name a row shows. */
export function rowName(row: DirectoryRow): string {
  switch (row.kind) {
    case 'provider':
      return row.provider.display_name;
    case 'server':
      return row.title;
    case 'listing':
      return row.listing.display_name ?? row.listing.name;
  }
}

/** The one-line description a row shows. */
export function rowDescription(row: DirectoryRow): string {
  switch (row.kind) {
    case 'provider':
      return row.provider.description;
    case 'server':
      return '';
    case 'listing':
      return row.listing.description;
  }
}

/** The directory search: a case-insensitive match on display name, title and description. */
export function rowMatches(row: DirectoryRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  const hay = [rowName(row), rowDescription(row)];
  if (row.kind === 'provider') hay.push(row.provider.id);
  if (row.kind === 'listing') hay.push(row.listing.name);
  return hay.some((text) => text.toLowerCase().includes(needle));
}

/** The manifest entries the preserved manifest holds, in manifest order. */
export function serverEntries(mcp: readonly ManifestMcpEntry[]): ServerEntry[] {
  const entries: ServerEntry[] = [];
  for (const raw of mcp) {
    const record = raw as Record<string, unknown>;
    const title = record.title;
    if (typeof title !== 'string') continue;
    const list = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
    entries.push({
      title,
      include: list(record.include),
      exclude: list(record.exclude),
      connectionId: raw.managed?.connection_id ?? null,
    });
  }
  return entries;
}

/** How `title` stands in a status snapshot. */
export function liveStateOf(title: string, status: McpStatusView | null): ServerLiveState {
  if (status === null) return { kind: 'unknown' };
  const tools = status.bound[title];
  if (tools !== undefined) return { kind: 'bound', tools };
  const failure = status.failed.find((record) => record.title === title);
  if (failure !== undefined) return { kind: 'failed', failure };
  return { kind: 'not_loaded' };
}

function useRouteReach(path: string): 'pending' | 'reached' | 'refused' {
  const { state } = useCapabilities();
  if (state.status !== 'ready') return 'pending';
  return isFullProjection(state.projection) || coversAnyRoute(state.projection, [path])
    ? 'reached'
    : 'refused';
}

function stateOf<T>(
  reach: 'pending' | 'reached' | 'refused',
  query: {
    readonly isPending: boolean;
    readonly isError: boolean;
    readonly error: unknown;
    readonly data: T | undefined;
    readonly refetch: () => unknown;
  },
): ReadState<T> {
  if (reach === 'refused') return { status: 'refused' };
  if (reach === 'pending' || query.isPending) return { status: 'loading' };
  if (query.isError) {
    if (isForbiddenError(query.error)) return { status: 'refused' };
    return {
      status: 'failed',
      error: query.error,
      retry: () => {
        void query.refetch();
      },
    };
  }
  return { status: 'ready', data: query.data as T };
}

export interface MarketplaceReads {
  readonly state: ReadState<readonly MarketplaceSearchRow[]>;
  readonly hasNextPage: boolean;
  readonly fetchingNext: boolean;
  /** The message of a failed next page, while one stands. */
  readonly nextPageError: string | null;
  readonly fetchNext: () => void;
}

function useMarketplaceKind(kind: (typeof DIRECTORY_KINDS)[number], q: string, enabled: boolean) {
  const api = useApi();
  return useInfiniteQuery<
    MarketplaceSearchPage,
    Error,
    InfiniteData<MarketplaceSearchPage>,
    readonly unknown[],
    number
  >({
    queryKey: ['connectors', 'directory', 'marketplace', kind, q],
    queryFn: ({ pageParam, signal }) =>
      api.searchMarketplace({ q: q === '' ? undefined : q, kind, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.page_size < last.total ? last.page + 1 : undefined,
    enabled,
  });
}

type MarketplaceQuery = ReturnType<typeof useMarketplaceKind>;

/**
 * The listings of both kind queries in query order. A listing holding both kinds comes
 * back from both queries; it draws once, from whichever query returned it first.
 */
function uniqueListings(queries: readonly MarketplaceQuery[]): MarketplaceSearchRow[] {
  const seen = new Set<string>();
  const pages = queries.flatMap((query) => query.data?.pages ?? []);
  return pages
    .flatMap((page) => page.listings)
    .filter((listing) => {
      if (seen.has(listing.ref)) return false;
      seen.add(listing.ref);
      return true;
    });
}

function marketplaceState(
  reach: 'pending' | 'reached' | 'refused',
  queries: readonly MarketplaceQuery[],
): ReadState<readonly MarketplaceSearchRow[]> {
  if (reach === 'refused') return { status: 'refused' };
  if (reach === 'pending' || queries.some((query) => query.isPending)) return { status: 'loading' };
  const firstPageFailure = queries.find(
    (query) => query.isError && (query.data?.pages.length ?? 0) === 0,
  );
  if (firstPageFailure === undefined) return { status: 'ready', data: uniqueListings(queries) };
  if (isForbiddenError(firstPageFailure.error)) return { status: 'refused' };
  return {
    status: 'failed',
    error: firstPageFailure.error,
    retry: () => {
      void firstPageFailure.refetch();
    },
  };
}

function useMarketplaceReads(q: string): MarketplaceReads {
  const reach = useRouteReach(apiRoutes.get_api_marketplace_search.path);
  const connectors = useMarketplaceKind('connector', q, reach === 'reached');
  const servers = useMarketplaceKind('mcp-server', q, reach === 'reached');
  const queries = [connectors, servers];
  const nextFailure = queries.find((query) => query.isFetchNextPageError);
  return {
    state: marketplaceState(reach, queries),
    hasNextPage: queries.some((query) => query.hasNextPage),
    fetchingNext: queries.some((query) => query.isFetchingNextPage),
    nextPageError: nextFailure?.error?.message ?? null,
    fetchNext: () => {
      for (const query of queries) {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }
    },
  };
}

export interface DirectoryReads {
  readonly providers: ReadState<readonly ProviderView[]>;
  readonly connections: ReadState<readonly ConnectionView[]>;
  readonly manifest: ReadState<readonly ServerEntry[]>;
  readonly status: ReadState<McpStatusView>;
  readonly installed: ReadState<ReadonlySet<string>>;
  readonly marketplace: MarketplaceReads;
}

/** Runs the six directory reads, each gated on the route it calls. */
export function useDirectoryReads(q: string): DirectoryReads {
  const api = useApi();
  const providersReach = useRouteReach(apiRoutes.get_api_connectors_providers.path);
  const connectionsReach = useRouteReach(apiRoutes.get_api_connectors_connections.path);
  const manifestReach = useRouteReach(apiRoutes.get_api_manifest_preserved.path);
  const statusReach = useRouteReach(apiRoutes.get_api_mcp_status.path);
  const installedReach = useRouteReach(apiRoutes.get_api_marketplace_installed.path);

  const providers = useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: ({ signal }) => api.listProviders(signal),
    enabled: providersReach === 'reached',
  });
  const connections = useQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: ({ signal }) => api.listConnections(signal),
    enabled: connectionsReach === 'reached',
  });
  const manifest = useQuery({
    queryKey: preservedManifestKey,
    queryFn: ({ signal }) => api.getManifestPreserved(signal),
    enabled: manifestReach === 'reached',
  });
  const status = useQuery({
    queryKey: mcpStatusKey,
    queryFn: ({ signal }) => api.getMcpStatus(signal),
    enabled: statusReach === 'reached',
  });
  const installed = useQuery({
    queryKey: installedMarketplacePluginsKey,
    queryFn: ({ signal }) => api.listInstalledMarketplacePlugins(signal),
    enabled: installedReach === 'reached',
  });
  const marketplace = useMarketplaceReads(q);

  const mapped = <S, T>(state: ReadState<S>, map: (data: S) => T): ReadState<T> =>
    state.status === 'ready' ? { status: 'ready', data: map(state.data) } : state;

  return {
    providers: mapped(stateOf(providersReach, providers), (data) => data.providers),
    connections: mapped(stateOf(connectionsReach, connections), (data) => data.items),
    manifest: mapped(stateOf(manifestReach, manifest), (data) => serverEntries(data.mcp)),
    status: mapped(stateOf(statusReach, status), (data) => ({
      bound: data.bound,
      failed: data.failed,
    })),
    installed: mapped(
      stateOf(installedReach, installed),
      (data) => new Set(data.installed.flatMap((record) => record.items.map((item) => item.name))),
    ),
    marketplace,
  };
}

const ready = <T>(state: ReadState<T>): T | null => (state.status === 'ready' ? state.data : null);

function providerRows(reads: DirectoryReads, providers: readonly ProviderView[]): ProviderRow[] {
  return providers.map((provider) => {
    let connections: ProviderRow['connections'];
    if (reads.connections.status === 'ready') {
      connections = reads.connections.data.filter((c) => c.provider_id === provider.id);
    } else if (reads.connections.status === 'loading') connections = null;
    else connections = 'unknown';
    return { kind: 'provider', key: `provider:${provider.id}`, provider, connections };
  });
}

function serverRow(
  title: string,
  entry: ServerEntry | null,
  status: McpStatusView | null,
  installedNames: ReadonlySet<string> | null,
): ServerRow {
  return {
    kind: 'server',
    key: `server:${title}`,
    title,
    entry,
    live: liveStateOf(title, status),
    fromMarketplace: installedNames === null ? null : installedNames.has(title),
  };
}

/**
 * The server rows: one per manifest entry no drawn provider card holds, or, when the
 * configuration read is refused, one per title the live status names.
 */
function serverRows(reads: DirectoryReads, providers: readonly ProviderView[] | null): ServerRow[] {
  const entries = ready(reads.manifest);
  const status = ready(reads.status);
  const installedNames = ready(reads.installed);
  if (entries === null) {
    if (reads.manifest.status !== 'refused' || status === null) return [];
    const titles = [...Object.keys(status.bound), ...status.failed.map((record) => record.title)];
    return [...new Set(titles)].map((title) => serverRow(title, null, status, installedNames));
  }
  const providerIds = new Set((providers ?? []).map((provider) => provider.id));
  const connectionProvider = new Map(
    (ready(reads.connections) ?? []).map((c) => [c.connection_id, c.provider_id]),
  );
  // A managed entry belongs to its provider's card when that card is drawn.
  const ownedByCard = (entry: ServerEntry): boolean => {
    if (entry.connectionId === null || providers === null) return false;
    const owner = connectionProvider.get(entry.connectionId);
    return owner === undefined || providerIds.has(owner);
  };
  return entries
    .filter((entry) => !ownedByCard(entry))
    .map((entry) => serverRow(entry.title, entry, status, installedNames));
}

/**
 * The marketplace rows sorted by display name. A listing's Connect step waits on the
 * provider or the status read, and folding a listing needs the installed read, so
 * listings draw only when both hold; a listing whose item names are all installed is
 * folded into its installed card.
 */
function listingRows(reads: DirectoryReads): ListingRow[] {
  const listings = ready(reads.marketplace.state);
  const installedNames = ready(reads.installed);
  const statusOrProviders =
    reads.providers.status !== 'refused' || reads.status.status !== 'refused';
  if (listings === null || installedNames === null || !statusOrProviders) return [];
  return listings
    .filter((listing) => {
      const names = listing.kinds
        .filter((k) => (DIRECTORY_KINDS as readonly string[]).includes(k.kind))
        .flatMap((k) => k.names);
      return names.length === 0 || !names.every((name) => installedNames.has(name));
    })
    .map((listing): ListingRow => ({ kind: 'listing', key: `listing:${listing.ref}`, listing }))
    .sort((a, b) => rowName(a).localeCompare(rowName(b)));
}

/**
 * The directory rows from every read that is ready: installed rows first (providers,
 * then servers in manifest order), then the marketplace rows sorted by display name.
 */
export function directoryRows(reads: DirectoryReads): DirectoryRow[] {
  const providers = ready(reads.providers);
  return [
    ...providerRows(reads, providers ?? []),
    ...serverRows(reads, providers),
    ...listingRows(reads),
  ];
}

/** The manifest entries a connection holds, in manifest order. */
export function connectionEntries(
  entries: readonly ServerEntry[] | null,
  connectionId: string,
): ServerEntry[] {
  return (entries ?? []).filter((entry) => entry.connectionId === connectionId);
}
