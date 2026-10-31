/**
 * The tools one MCP entry's include/exclude lists are checked against: every tool the
 * live server advertises (`POST /api/mcp-status/{title}/advertised-tools`), read before
 * the entry's own selection, so the add row offers each tool the server can bind and a
 * listed name the server does not advertise is flagged. The read runs only for a title
 * the MCP status knows as a bound or a failed server; a title the status does not carry
 * is a server not mounted yet, whose tools cannot be read until it is saved, and a title
 * whose server start is still in progress has no tools to read until that start binds. A
 * read the platform refuses because the server is still starting
 * (`ApiClient.isMcpStartingError`) reads the same as a start the status carries.
 *
 * Each read opens a session to the server, so one title is read once and every view
 * shares it: the form's per-entry editors and the raw JSON view's check read the same
 * cached result however often they remount or the text changes. A save invalidates the
 * `mcp-status` key prefix, which this read shares, so a saved edit re-reads it.
 */
import type { ApiClient } from '@tai42/api-client';
import { isMcpStarting } from '@tai42/api-client';
import { mcpAdvertisedToolsKey, type ToolListQuery, useApi } from '@tai42/studio-sdk';
import { useQueries, useQuery } from '@tanstack/react-query';

/**
 * The MCP status read as the editor uses it: the bound and the failed servers, with the
 * read's own state. A TanStack `UseQueryResult` of the status satisfies it.
 */
export interface McpStatusRead {
  readonly data:
    | {
        readonly bound: Readonly<Record<string, readonly string[]>>;
        readonly failed: readonly { readonly title: string; readonly category?: string }[];
      }
    | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
  readonly refetch: () => unknown;
}

/** One entry's server tools, as the include/exclude editors draw them. */
export interface ServerTools {
  /** The advertised names as a picker read, carrying the status or the probe's state. */
  readonly query: ToolListQuery;
  /** Each advertised tool's description, keyed by name, for the picker's search. */
  readonly descriptions: Readonly<Record<string, string>>;
  /** The advertised names once read; `undefined` while unread or failed. */
  readonly advertised: ReadonlySet<string> | undefined;
  /** `false` when the status is loaded and does not carry the entry's title as a bound or
   *  a failed server. */
  readonly mounted: boolean;
  /** `true` when the status carries the entry's title as a server start still in progress,
   *  or the read of its tools was refused because that server is still starting. */
  readonly starting: boolean;
}

/** The one advertised-tools read of the server titled `title`, cached until a save. */
function advertisedToolsQuery(api: ApiClient, title: string) {
  return {
    queryKey: mcpAdvertisedToolsKey(title),
    queryFn: ({ signal }: { readonly signal: AbortSignal }) =>
      api.listMcpAdvertisedTools(title, signal),
    staleTime: Infinity,
  };
}

/** How the loaded status carries `title`: as a bound or a failed server, as a server start
 *  still in progress, or not at all (also while the status is not loaded). */
function standingOf(
  status: McpStatusRead,
  title: string | undefined,
): 'mounted' | 'starting' | 'absent' {
  if (title === undefined || title === '' || status.data === undefined) return 'absent';
  if (title in status.data.bound) return 'mounted';
  const record = status.data.failed.find((row) => row.title === title);
  if (record === undefined) return 'absent';
  return isMcpStarting(record) ? 'starting' : 'mounted';
}

/** The status read's own state as a picker read, for while it is pending or failed. */
function statusQuery(status: McpStatusRead): ToolListQuery {
  return {
    data: undefined,
    isPending: status.isPending,
    isError: status.isError,
    isSuccess: false,
    error: status.error,
    refetch: () => {
      void status.refetch();
    },
  };
}

/** The tools the server titled `title` advertises, checked against the MCP status. */
export function useServerTools(status: McpStatusRead, title: string | undefined): ServerTools {
  const api = useApi();
  const standing = standingOf(status, title);
  const mounted = standing === 'mounted';
  const read = useQuery({ ...advertisedToolsQuery(api, title ?? ''), enabled: mounted });
  const readStarting = read.isError && api.isMcpStartingError(read.error);

  if (!mounted || readStarting) {
    return {
      query: statusQuery(status),
      descriptions: {},
      advertised: undefined,
      mounted: mounted || status.data === undefined,
      starting: readStarting || standing === 'starting',
    };
  }
  const tools = read.data?.tools;
  const descriptions: Record<string, string> = {};
  for (const tool of tools ?? []) {
    if (tool.description !== null && tool.description !== '') {
      descriptions[tool.name] = tool.description;
    }
  }
  return {
    query: {
      data: tools?.map((tool) => tool.name),
      isPending: read.isPending,
      isError: read.isError,
      isSuccess: read.isSuccess,
      error: read.error,
      refetch: () => {
        void read.refetch();
      },
    },
    descriptions,
    advertised: read.data === undefined ? undefined : advertisedNames(read.data),
    mounted: true,
    starting: false,
  };
}

/**
 * The words for a server whose start is still in progress, so its tools cannot be read.
 * Inside one entry's own editor the server is "This server"; naming `server` is for a view
 * that shows every entry at once.
 */
export function serverStartingNote(server?: string): string {
  const subject = server === undefined ? 'This server' : `The server “${server}”`;
  return `${subject} is still starting, so its tools cannot be listed yet.`;
}

/** One server's advertised names as a check reads them. */
export type AdvertisedRead =
  | { readonly state: 'pending' }
  | { readonly state: 'starting' }
  | { readonly state: 'failed'; readonly error: unknown; readonly retry: () => void }
  | { readonly state: 'read'; readonly advertised: ReadonlySet<string> };

/**
 * The advertised names of each of `titles` the MCP status knows as a bound or a failed
 * server, keyed by title, and `starting` for each title whose server start is still in
 * progress: one the status carries as starting, or one whose read the platform refuses
 * because its server is still starting. Any other title is absent: it is not read.
 */
export function useAdvertisedByTitle(
  status: McpStatusRead,
  titles: readonly string[],
): ReadonlyMap<string, AdvertisedRead> {
  const api = useApi();
  const unique = [...new Set(titles)];
  const known = unique.filter((title) => standingOf(status, title) === 'mounted');
  const reads = useQueries({ queries: known.map((title) => advertisedToolsQuery(api, title)) });
  const byTitle = new Map<string, AdvertisedRead>();
  for (const title of unique) {
    if (standingOf(status, title) === 'starting') byTitle.set(title, { state: 'starting' });
  }
  known.forEach((title, index) => {
    const read = reads[index];
    if (read === undefined) return;
    if (read.isError && api.isMcpStartingError(read.error)) {
      byTitle.set(title, { state: 'starting' });
    } else if (read.isError) {
      byTitle.set(title, {
        state: 'failed',
        error: read.error,
        retry: () => {
          void read.refetch();
        },
      });
    } else if (read.data === undefined) byTitle.set(title, { state: 'pending' });
    else byTitle.set(title, { state: 'read', advertised: advertisedNames(read.data) });
  });
  return byTitle;
}

type AdvertisedTools = Awaited<ReturnType<ApiClient['listMcpAdvertisedTools']>>;

const advertisedNameSets = new WeakMap<AdvertisedTools, ReadonlySet<string>>();

/** The names one cached read advertises, built once per read rather than per keystroke. */
function advertisedNames(read: AdvertisedTools): ReadonlySet<string> {
  let names = advertisedNameSets.get(read);
  if (names === undefined) {
    names = new Set(read.tools.map((tool) => tool.name));
    advertisedNameSets.set(read, names);
  }
  return names;
}
