/**
 * The composed inbox state: the paged pending base (an infinite query) seeding the
 * tail-only SSE stream, refetched on every (re)connect. Both the page and the
 * always-mounted badge consume it.
 */
import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';

import type { Interaction } from '@tai42/api-client';
import { useApi, useInteractionsStream } from '@tai42/studio-sdk';
import type { StreamInteraction } from '@tai42/studio-sdk';

import { inboxKey } from './keys';

/** Pending interactions per page. The server caps a page at 200 whatever is asked. */
export const INBOX_PAGE_SIZE = 50;

interface Inbox {
  /** The merged live list: the paged base with the tail's deltas overlaid. */
  readonly interactions: StreamInteraction[];
  /**
   * The live pending count for the badge: the door's `total` adjusted by the stream
   * overlay (adds/answered/removed), so it moves on a live delta without a refetch.
   */
  readonly count: number;
  readonly connected: boolean;
  readonly streamError: Error | null;
  readonly disabled: boolean;
  /**
   * A background refetch of the paged base FAILED after an initial success (the door
   * 500s on a resync): the count is now stale, so the badge degrades rather than
   * freezing silently on the last value.
   */
  readonly refetchFailed: boolean;
  /** The query lifecycle: `pending` gates the loading skeleton. */
  readonly loading: boolean;
  readonly loadError: Error | null;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /**
   * The most recent `fetchNextPage` FAILED (the next-page fetch 500s): surfaced
   * loudly beside the Load more control, which stays usable to retry. Cleared once a
   * retry succeeds.
   */
  readonly loadMoreFailed: boolean;
  fetchNextPage(): void;
}

export function useInbox(): Inbox {
  const api = useApi();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: inboxKey(INBOX_PAGE_SIZE),
    queryFn: ({ pageParam, signal }) => api.listInteractions(pageParam, INBOX_PAGE_SIZE, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next_page ?? undefined,
  });
  // A stable seed reference between refetches: the stream hook re-merges on a new
  // reference but does not reopen the stream, so it must not churn every render.
  const seed = useMemo<readonly Interaction[]>(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  // Refetch the paged base and report whether it LANDED. `throwOnError` makes
  // `refetchQueries` reject when the list door fails (query-core otherwise swallows a
  // per-query refetch error), so a failed resync resolves `false` and the stream hook
  // holds its resync epoch — the prior-epoch deltas keep applying against the prior
  // total instead of being discarded against a stale one. The failure is still loud:
  // `query.isRefetchError` flips the badge to its degraded state.
  const onResync = useCallback(async (): Promise<boolean> => {
    try {
      await queryClient.refetchQueries(
        { queryKey: inboxKey(INBOX_PAGE_SIZE) },
        { throwOnError: true },
      );
      return true;
    } catch {
      return false;
    }
  }, [queryClient]);
  // Every page echoes the same total; the newest read is the freshest. The stream
  // derives the live badge count from this base total plus its overlay delta.
  const total = query.data?.pages.at(-1)?.total ?? 0;
  const stream = useInteractionsStream({ seed, total, onResync });
  return {
    interactions: stream.interactions,
    count: stream.count,
    connected: stream.connected,
    streamError: stream.error,
    disabled: stream.disabled,
    // `isRefetchError` is a resync failure with pages retained (as opposed to
    // `isLoadingError`, the initial-load failure): the badge degrades on it.
    refetchFailed: query.isRefetchError,
    // `isLoadingError` (not `isError`) is the INITIAL-load failure: query-core flags
    // `status:'error'` on any fetch error even with pages retained.
    loading: query.status === 'pending',
    loadError: query.isLoadingError ? query.error : null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMoreFailed: query.isFetchNextPageError,
    fetchNextPage: () => void query.fetchNextPage(),
  };
}

export type { Inbox };
