/**
 * The tools one MCP entry's include/exclude lists are checked against: every tool the
 * server advertised at its bind on the worker that answered
 * (`GET /api/mcp-status/{title}/advertised-tools`), read before the entry's own selection,
 * so the add row offers each tool the server can bind and a listed name the server does
 * not advertise is flagged. The read runs only for a title the MCP status carries (bound,
 * or in its failed list); a title the status does not carry is a server not mounted yet,
 * whose tools cannot be read until it is saved. The read alone says why it holds no tools:
 * a server still starting or one the worker that answered has not loaded (read by
 * `mcpListingRefusalOf`), or a failed start or bind, whose failure carries the recorded
 * cause.
 *
 * One title is read once and every view shares it: the form's per-entry editors and the
 * raw JSON view's check read the same cached result however often they remount or the
 * text changes. A save invalidates the `mcp-status` key prefix, which this read shares,
 * so a saved edit re-reads it.
 */
import type { ApiClient } from '@tai42/api-client';
import {
  mcpAdvertisedToolsKey,
  mcpListingRefusalOf,
  type McpListingRefusalReason,
  type ToolListQuery,
  useApi,
} from '@tai42/studio-sdk';
import { useQueries, useQuery } from '@tanstack/react-query';

/**
 * The MCP status read as the editor uses it: the bound and the failed servers, with the
 * read's own state. A TanStack `UseQueryResult` of the status satisfies it.
 */
export interface McpStatusRead {
  readonly data:
    | {
        readonly bound: Readonly<Record<string, readonly string[]>>;
        readonly failed: readonly { readonly title: string }[];
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
  /** `false` when the status is loaded and does not carry the entry's title. */
  readonly mounted: boolean;
  /** Why the read holds no tools, when it was refused because the worker that answered holds
   *  no listing: the server is still starting, or that worker has not loaded it. */
  readonly unlisted: McpListingRefusalReason | null;
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

/** Whether the loaded status carries `title`, bound or in its failed list. */
function isMounted(status: McpStatusRead, title: string | undefined): boolean {
  if (title === undefined || title === '' || status.data === undefined) return false;
  return title in status.data.bound || status.data.failed.some((row) => row.title === title);
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
  const mounted = isMounted(status, title);
  const read = useQuery({ ...advertisedToolsQuery(api, title ?? ''), enabled: mounted });
  const unlisted = read.isError ? mcpListingRefusalOf(api, read.error) : null;

  if (!mounted || unlisted !== null) {
    return {
      query: statusQuery(status),
      descriptions: {},
      advertised: undefined,
      mounted: mounted || status.data === undefined,
      unlisted,
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
    unlisted: null,
  };
}

/**
 * The words for a server whose tools cannot be listed yet, by why: its start is still in
 * progress, or the worker that answered has not loaded it. Inside one entry's own editor
 * the server is "This server"; naming `server` is for a view that shows every entry at once.
 */
export function unlistedNote(reason: McpListingRefusalReason, server?: string): string {
  const subject = server === undefined ? 'This server' : `The server “${server}”`;
  return reason === 'starting'
    ? `${subject} is still starting, so its tools cannot be listed yet.`
    : `${subject} is not loaded on the worker that answered, so its tools cannot be listed until a reload loads it.`;
}

/** One server's advertised names as a check reads them. */
export type AdvertisedRead =
  | { readonly state: 'pending' }
  | { readonly state: 'unlisted'; readonly reason: McpListingRefusalReason }
  | { readonly state: 'failed'; readonly error: unknown; readonly retry: () => void }
  | { readonly state: 'read'; readonly advertised: ReadonlySet<string> };

/**
 * The advertised names of each of `titles` the MCP status carries, keyed by title: a read
 * refused because the worker that answered holds no listing is `unlisted` with its reason,
 * and any other refused read `failed`. A title the status does not carry is absent: it is
 * not read.
 */
export function useAdvertisedByTitle(
  status: McpStatusRead,
  titles: readonly string[],
): ReadonlyMap<string, AdvertisedRead> {
  const api = useApi();
  const known = [...new Set(titles)].filter((title) => isMounted(status, title));
  const reads = useQueries({ queries: known.map((title) => advertisedToolsQuery(api, title)) });
  const byTitle = new Map<string, AdvertisedRead>();
  known.forEach((title, index) => {
    const read = reads[index];
    if (read === undefined) return;
    const unlisted = read.isError ? mcpListingRefusalOf(api, read.error) : null;
    if (unlisted !== null) {
      byTitle.set(title, { state: 'unlisted', reason: unlisted });
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
