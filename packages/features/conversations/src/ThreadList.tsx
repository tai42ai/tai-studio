/**
 * Level 2: one route's threads, newest activity first. Each row is a client
 * address, when it last spoke (relative label, exact instant as its title), how
 * many exchanges it holds, and where its newest answer's delivery stands —
 * `failed` in the danger tint with the word beside it, so it reads as a problem
 * without relying on colour.
 *
 * The door is ADMIN-ONLY server-side: the listing spans every caller on the route.
 * A scoped session's 403 is therefore a capability boundary, not a failure, and
 * renders as an empty state.
 *
 * The list REFRESHES on its own ({@link THREADS_REFRESH_MS}): a reader sitting in
 * a transcript is looking at the same route's master list, and a thread that has
 * just moved, gained messages or gone `failed` must not keep the standing it had
 * when the pane was opened. Its relative labels tick on the shared clock for the
 * same reason — an unchanged listing is deeply equal and re-renders nothing.
 *
 * {@link THREADS_MAX_PAGES} bounds what one refresh may cost — a refresh re-reads
 * every retained page — by PAUSING past that depth, never by dropping the page it
 * refreshes for. A paused list says so and offers the way back.
 */
import type { ConversationDeliveryStatus } from '@tai42/api-client';
import { useApi } from '@tai42/studio-sdk';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, type RefObject, useRef } from 'react';

import { RELATIVE_TICK_MS, useNow } from './clock';
import { useFocusHandoff } from './focus';
import { countOf } from './format';
import { conversationThreadsKey } from './keys';
import { useLiveRegion } from './live-region';
import { boundedRefresh, trimToNewestPage } from './paging';
import { TruncatedNotice } from './read-states';
import { ThreadListBody } from './ThreadListBody';
import { ThreadRefreshNotice } from './ThreadRefreshNotice';
import { useTailingPager } from './useTailingPager';

export { threadRowLabel } from './ThreadListBody';

/** Threads per request. The server caps a page at 200 whatever is asked for. */
export const THREADS_PAGE_SIZE = 25;

/**
 * How often the listing re-reads the door. Slower than the transcript's tail: a
 * thread's standing in this list moves when a turn completes, not keystroke by
 * keystroke.
 */
export const THREADS_REFRESH_MS = 15_000;

/** The deepest window a refresh re-reads — and so the most requests one can fire. */
export const THREADS_MAX_PAGES = 8;

/** What a list too deep to keep refreshing says, on screen and out loud. */
const PAUSED_NOTICE = `This list stops refreshing past ${String(THREADS_MAX_PAGES)} pages of threads.`;

export function ThreadList({
  route,
  selected,
  status,
  address,
  listRef,
  headingRef,
}: {
  readonly route: string;
  readonly selected: string | undefined;
  /** The delivery-status filter from the URL, or `undefined` for every status. */
  readonly status: ConversationDeliveryStatus | undefined;
  /** The address substring filter from the URL, or `undefined` for every address. */
  readonly address: string | undefined;
  readonly listRef: RefObject<HTMLDivElement | null>;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}): ReactNode {
  const api = useApi();
  const now = useNow(RELATIVE_TICK_MS);
  const queryClient = useQueryClient();
  const queryKey = conversationThreadsKey(route, THREADS_PAGE_SIZE, status, address);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      api.listConversationThreads(route, pageParam, THREADS_PAGE_SIZE, { status, address }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next_page ?? undefined,
    ...boundedRefresh(THREADS_MAX_PAGES, THREADS_REFRESH_MS),
  });

  // The two controls that do not survive being used, and where focus goes when
  // each of them is gone: the route heading, this pane's own top.
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const loadMore = useFocusHandoff(loadMoreRef, headingRef);
  const resume = useFocusHandoff(resumeRef, headingRef);
  const live = useLiveRegion('conversation-thread-list-announcer');

  // The door returns newest-first; the list keeps that order (unlike the transcript).
  const pager = useTailingPager({
    query,
    maxPages: THREADS_MAX_PAGES,
    idOf: (thread) => thread.thread_id,
    reverse: false,
    live,
    loadFocus: loadMore,
    resumeFocus: resume,
    messages: {
      loaded: (hasMore, count) =>
        `${hasMore ? 'More threads loaded.' : 'All threads loaded.'} ${countOf(count, 'thread', 'threads')} on screen.`,
      paused: PAUSED_NOTICE,
      resumed: (count) =>
        `Back to the newest threads. ${countOf(count, 'thread', 'threads')} on screen, and the list is refreshing again.`,
    },
  });
  const filtered = status !== undefined || address !== undefined;

  return (
    // Focusable, unreachable by Tab: it is where focus lands on the way back from
    // a thread whose row is no longer listed.
    <div
      ref={listRef}
      tabIndex={-1}
      data-testid="conversation-thread-list"
      className="tai-stack tai-stack-3"
    >
      <h2 className="tai-section-title" tabIndex={-1} ref={headingRef}>
        {route}
      </h2>
      {pager.truncated ? <TruncatedNotice noun="threads" /> : null}
      <ThreadListBody
        route={route}
        selected={selected}
        now={now}
        isPending={query.isPending}
        isLoadingError={query.isLoadingError}
        error={query.error}
        onRetry={() => void query.refetch()}
        items={pager.items}
        filtered={filtered}
        hasMore={pager.hasMore}
        loadingMore={pager.loadingMore}
        pageFailed={pager.pageFailed}
        loadMoreRef={loadMoreRef}
        onLoadMore={pager.onLoadMore}
        onRetryMore={() => void query.fetchNextPage()}
      />
      <ThreadRefreshNotice
        paused={pager.paused}
        pausedNotice={PAUSED_NOTICE}
        isRefetchError={query.isRefetchError}
        error={query.error}
        onRetry={() => void query.refetch()}
        resumeRef={resumeRef}
        onResume={() => {
          resume.hold();
          trimToNewestPage(queryClient, queryKey);
          void query.refetch();
        }}
      />
      {live.region}
    </div>
  );
}
