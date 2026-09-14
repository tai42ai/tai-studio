/**
 * Level 3: one thread's transcript — the ordered list of exchanges, oldest first
 * with the newest at the foot, LIVE-TAILING on a fixed poll.
 *
 * The door is read NEWEST FIRST (`order=desc`), which is what makes the poll a
 * genuine tail: page 1 is always the latest page, whatever the thread's length,
 * so a new exchange lands on the next refresh with no interaction at all. Paging
 * therefore walks BACKWARDS through history — "Load older" prepends the page
 * before the one on screen — and the view reverses the accumulated pages so the
 * reader still gets the conversation in reading order.
 *
 * {@link TRANSCRIPT_MAX_PAGES} bounds what one tick may cost — a tick re-reads
 * every retained page — by PAUSING the tail past that depth, never by dropping
 * page 1. Dropping page 1 would end the tail for good: the poll would re-read
 * only history, and no page param leads back to the newest page. A reader that
 * far back is reading history, not tailing, so the pane says the tail is paused
 * and offers the one move that resumes it — back to the latest page.
 *
 * Polling stops while the tab is in the background (TanStack's default), so a
 * parked Studio tab never holds the reader open.
 */
import { useRef, type ReactNode, type RefObject } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Card, useApi } from '@tai42/studio-sdk';

import { useNow, RELATIVE_TICK_MS } from './clock';
import { countOf } from './format';
import { useFocusHandoff } from './focus';
import { conversationTranscriptKey } from './keys';
import { useLiveRegion } from './live-region';
import { boundedRefresh, trimToNewestPage } from './paging';
import { TruncatedNotice } from './read-states';
import { useTailingPager } from './useTailingPager';
import { TranscriptBody } from './TranscriptBody';
import { TranscriptTailStatus } from './TranscriptTailStatus';

/**
 * Exchanges per request. Large on purpose: an ordinary thread arrives in one page,
 * so the reader never pages at all. The server caps a page at 200 whatever is
 * asked for.
 */
export const TRANSCRIPT_PAGE_SIZE = 100;

/** Tail cadence. Fast enough to read as live, slow enough not to hammer the reader. */
export const TAIL_INTERVAL_MS = 5000;

/** The deepest window a tail tick re-reads — and so the most requests one can fire. */
export const TRANSCRIPT_MAX_PAGES = 5;

/** What a transcript too far back to keep tailing says, on screen and out loud. */
const PAUSED_NOTICE = `New messages stop arriving past ${String(TRANSCRIPT_MAX_PAGES)} pages of history.`;

export function Transcript({
  route,
  threadId,
  q,
  headingRef,
}: {
  readonly route: string;
  readonly threadId: string;
  /** The record-text filter from the URL, or `undefined` for the whole transcript. */
  readonly q: string | undefined;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}): ReactNode {
  const api = useApi();
  const now = useNow(RELATIVE_TICK_MS);
  const queryClient = useQueryClient();
  const queryKey = conversationTranscriptKey(route, threadId, TRANSCRIPT_PAGE_SIZE, q);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      api.readConversationTranscript(
        {
          routeName: route,
          threadId,
          page: pageParam,
          pageSize: TRANSCRIPT_PAGE_SIZE,
          order: 'desc',
          q,
        },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next_page ?? undefined,
    ...boundedRefresh(TRANSCRIPT_MAX_PAGES, TAIL_INTERVAL_MS),
  });

  // The two controls that do not survive being used, and where focus goes when
  // each of them is gone: the thread heading, this pane's own top.
  const loadOlderRef = useRef<HTMLButtonElement>(null);
  const jumpRef = useRef<HTMLButtonElement>(null);
  const loadOlder = useFocusHandoff(loadOlderRef, headingRef);
  const jump = useFocusHandoff(jumpRef, headingRef);
  const live = useLiveRegion('conversation-transcript-announcer');

  // Every page is newest-first and each further page is older than the last, so the
  // accumulated pages are one strictly descending run: reversing it yields reading
  // order, newest at the foot.
  const pager = useTailingPager({
    query,
    maxPages: TRANSCRIPT_MAX_PAGES,
    idOf: (record) => record.message_id,
    reverse: true,
    live,
    loadFocus: loadOlder,
    resumeFocus: jump,
    messages: {
      loaded: (hasOlder, count) =>
        `${hasOlder ? 'Older messages loaded above.' : 'The whole thread is loaded.'} ${countOf(count, 'exchange', 'exchanges')} on screen.`,
      paused: PAUSED_NOTICE,
      resumed: (count) =>
        `Back at the newest page. ${countOf(count, 'exchange', 'exchanges')} on screen, and new messages arrive again.`,
    },
  });
  const { items } = pager;
  // The thread id is the addressable identity; the address it belongs to is the
  // friendlier name, and every record in a thread carries the same one.
  const heading = items[0]?.client_address ?? threadId;

  return (
    <Card>
      <div className="tai-stack tai-stack-3">
        <h2 className="tai-card-title" tabIndex={-1} ref={headingRef}>
          {heading}
        </h2>
        {pager.truncated ? <TruncatedNotice noun="messages" /> : null}
        <TranscriptBody
          isPending={query.isPending}
          isLoadingError={query.isLoadingError}
          error={query.error}
          onRetry={() => void query.refetch()}
          items={items}
          q={q}
          now={now}
          hasOlder={pager.hasMore}
          loadingOlder={pager.loadingMore}
          pageFailed={pager.pageFailed}
          loadOlderRef={loadOlderRef}
          onLoadOlder={pager.onLoadMore}
          onRetryOlder={() => void query.fetchNextPage()}
        />
        <TranscriptTailStatus
          hasData={query.data !== undefined}
          paused={pager.paused}
          pausedNotice={PAUSED_NOTICE}
          isRefetchError={query.isRefetchError}
          error={query.error}
          onRetry={() => void query.refetch()}
          jumpRef={jumpRef}
          onJump={() => {
            jump.hold();
            trimToNewestPage(queryClient, queryKey);
            void query.refetch();
          }}
        />
        {live.region}
      </div>
    </Card>
  );
}
