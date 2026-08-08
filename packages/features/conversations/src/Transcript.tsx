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
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, EmptyState, Skeleton, errorMessage, useApi } from '@tai42/studio-sdk';

import { useNow, RELATIVE_TICK_MS } from './clock';
import { countOf } from './format';
import { Exchange } from './Exchange';
import { useFocusHandoff } from './focus';
import { conversationTranscriptKey } from './keys';
import { useLiveRegion, useStandingNotice } from './live-region';
import { boundedRefresh, dedupeBy, trimToNewestPage, withinRefreshWindow } from './paging';
import { ReadFailure, StaleRead, staleReadMessage } from './read-states';

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
  headingRef,
}: {
  readonly route: string;
  readonly threadId: string;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}): ReactNode {
  const api = useApi();
  const now = useNow(RELATIVE_TICK_MS);
  const queryClient = useQueryClient();
  const queryKey = conversationTranscriptKey(route, threadId, TRANSCRIPT_PAGE_SIZE);
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
        },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next_page ?? undefined,
    ...boundedRefresh(TRANSCRIPT_MAX_PAGES, TAIL_INTERVAL_MS),
  });

  // Every page is newest-first and each further page is older than the last, so
  // the accumulated pages are one strictly descending run: reversing it yields
  // the reading order, newest at the foot. One exchange can be on two retained
  // pages at once — a tick re-reads them one after another, and an exchange
  // landing between two of those reads shifts the page boundary under them — so
  // the run is de-duplicated first, keeping the newest page's copy.
  const items = dedupeBy(
    query.data?.pages.flatMap((page) => page.items) ?? [],
    (record) => record.message_id,
  ).reverse();
  const paused = !withinRefreshWindow(query.data?.pages.length, TRANSCRIPT_MAX_PAGES);
  // The thread id is the addressable identity; the address it belongs to is the
  // friendlier name, and every record in a thread carries the same one.
  const heading = items[0]?.client_address ?? threadId;

  // The two controls that do not survive being used, and where focus goes when
  // each of them is gone: the thread heading, this pane's own top.
  const loadOlderRef = useRef<HTMLButtonElement>(null);
  const jumpRef = useRef<HTMLButtonElement>(null);
  const loadOlder = useFocusHandoff(loadOlderRef, headingRef);
  const jump = useFocusHandoff(jumpRef, headingRef);
  const live = useLiveRegion('conversation-transcript-announcer');
  const { announce, region } = live;

  const count = items.length;
  const hasOlder = query.hasNextPage;
  const pageFailed = query.isFetchNextPageError;
  const loadingOlder = query.isFetchingNextPage;
  /** Set by the paging click, cleared once that page's outcome is on screen. */
  const pendingPage = useRef(false);

  // Deliberately UNKEYED: a page already in the cache settles without the pane
  // ever rendering an in-flight state, so there is no value whose change can be
  // depended on to mark the outcome. The flag the click set is what makes this act.
  useEffect(() => {
    if (!pendingPage.current || loadingOlder) return;
    pendingPage.current = false;
    // A failed page already speaks for itself in its own alert; a second account
    // of the same event beside it is one too many.
    if (!pageFailed) {
      const onScreen = `${countOf(count, 'exchange', 'exchanges')} on screen.`;
      announce(
        hasOlder
          ? `Older messages loaded above. ${onScreen}`
          : `The whole thread is loaded. ${onScreen}`,
      );
    }
    loadOlder.settle();
  });

  const wasPaused = useRef(paused);
  useEffect(() => {
    if (paused === wasPaused.current) return;
    wasPaused.current = paused;
    if (paused) {
      announce(PAUSED_NOTICE);
      return;
    }
    announce(
      `Back at the newest page. ${countOf(count, 'exchange', 'exchanges')} on screen, and new messages arrive again.`,
    );
    jump.settle();
  }, [paused, count, announce, jump]);

  // Said only in the state the pane actually shows it in: paused wins over stale.
  const staleMessage = !paused && query.isRefetchError ? staleReadMessage(query.error) : undefined;
  useStandingNotice(live, staleMessage);

  let body: ReactNode;
  if (query.isPending) {
    body = <Skeleton height={240} />;
  } else if (query.isLoadingError) {
    // Only the INITIAL-load failure blanks the transcript; query-core flags
    // `status: 'error'` on any fetch error even with pages retained.
    body = (
      <ReadFailure
        error={query.error}
        onRetry={() => void query.refetch()}
        forbiddenDescription="Reading conversation transcripts needs authority over this deployment's conversations."
        notFoundDescription="This thread is not available to you, or is no longer in the route's index — retention may have expired it."
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        title="Nothing in this thread"
        description="The thread is indexed but holds no readable exchange."
      />
    );
  } else {
    body = (
      <div className="tai-stack tai-stack-3">
        {hasOlder ? (
          <Button
            ref={loadOlderRef}
            onClick={() => {
              pendingPage.current = true;
              loadOlder.hold();
              void query.fetchNextPage();
            }}
            disabled={loadingOlder}
          >
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </Button>
        ) : null}
        {query.isFetchNextPageError ? (
          <div role="alert" className="tai-row">
            <span style={{ color: 'var(--tai-color-err-text)' }}>
              Could not load older messages: {errorMessage(query.error)}
            </span>
            <Button onClick={() => void query.fetchNextPage()}>Retry</Button>
          </div>
        ) : null}
        <ol
          className="tai-stack tai-stack-3"
          data-testid="conversation-transcript"
          style={{ listStyle: 'none', margin: 0, padding: 0 }}
        >
          {items.map((record) => (
            <Exchange key={record.message_id} record={record} now={now} />
          ))}
        </ol>
      </div>
    );
  }

  // The foot of a pane that holds a transcript says what its tail is doing, and
  // never claims more than the pane can keep: live, paused this far back (with
  // the move that resumes it), or stopped because the read itself is failing.
  // Paused wins over stopped — nothing is being read at all in that state, and
  // the one control clears both. Neither notice is a live region of its own; both
  // are spoken by the standing one.
  let tailStatus: ReactNode = null;
  if (query.data !== undefined) {
    if (paused) {
      tailStatus = (
        <div className="tai-row" data-testid="conversation-transcript-paused">
          <span className="tai-muted" style={{ fontSize: 'var(--tai-text-xs)' }}>
            {PAUSED_NOTICE}
          </span>
          <Button
            ref={jumpRef}
            onClick={() => {
              jump.hold();
              trimToNewestPage(queryClient, queryKey);
              void query.refetch();
            }}
          >
            Jump to latest
          </Button>
        </div>
      );
    } else if (query.isRefetchError) {
      tailStatus = <StaleRead error={query.error} onRetry={() => void query.refetch()} />;
    } else {
      tailStatus = (
        <p className="tai-muted" style={{ margin: 0, fontSize: 'var(--tai-text-xs)' }}>
          New messages appear here on their own.
        </p>
      );
    }
  }

  return (
    <Card>
      <div className="tai-stack tai-stack-3">
        <h2 className="tai-card-title" tabIndex={-1} ref={headingRef}>
          {heading}
        </h2>
        {body}
        {tailStatus}
        {region}
      </div>
    </Card>
  );
}
