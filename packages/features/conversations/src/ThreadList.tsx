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
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  Badge,
  Button,
  EmptyState,
  ScrollRegion,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  errorMessage,
  openTargetProps,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';
import type { ConversationDeliveryStatus, ConversationThread } from '@tai42/api-client';

import { useNow, RELATIVE_TICK_MS } from './clock';
import { useFocusHandoff } from './focus';
import { countOf, formatAbsoluteEpoch, formatRelativeEpoch } from './format';
import { conversationThreadsKey } from './keys';
import { useLiveRegion, useStandingNotice } from './live-region';
import { boundedRefresh, dedupeBy, trimToNewestPage, withinRefreshWindow } from './paging';
import { ReadFailure, StaleRead, staleReadMessage, TruncatedNotice } from './read-states';
import { DELIVERY_LABEL, DELIVERY_VARIANT } from './status';

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

/** The accessible name of a thread row's link; the return-focus target after Back. */
export function threadRowLabel(threadId: string): string {
  return `Open thread ${threadId}`;
}

function ThreadRow({
  route,
  thread,
  selected,
  now,
}: {
  readonly route: string;
  readonly thread: ConversationThread;
  readonly selected: boolean;
  /** The list's ticking clock, so "3 minutes ago" does not stay 3 minutes ago. */
  readonly now: number;
}): ReactNode {
  const navigate = useAppNavigate();
  // The whole row opens the thread — the same destination as the address-cell
  // link below — via the shared house pattern. The link stays as the accessible
  // activation path; the helper yields to it so a click on the link navigates
  // once, never twice.
  return (
    <TR
      {...openTargetProps({
        onOpen: () => {
          navigate('conversations', { route, thread: thread.thread_id });
        },
      })}
    >
      <TD>
        <AppLink
          to="conversations"
          search={{ route, thread: thread.thread_id }}
          className="tai-table-id"
          aria-label={threadRowLabel(thread.thread_id)}
          aria-current={selected ? 'true' : undefined}
        >
          {thread.client_address}
        </AppLink>
      </TD>
      <TD>
        <span title={formatAbsoluteEpoch(thread.last_activity_at)}>
          {formatRelativeEpoch(thread.last_activity_at, now)}
        </span>
      </TD>
      <TD numeric>{thread.message_count.toLocaleString()}</TD>
      <TD>
        <Badge variant={DELIVERY_VARIANT[thread.last_delivery_status]}>
          {DELIVERY_LABEL[thread.last_delivery_status]}
        </Badge>
      </TD>
    </TR>
  );
}

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

  // One thread can be on two retained pages at once — a refresh re-reads them one
  // after another, and a restamped thread moves between two of those reads.
  const items = dedupeBy(
    query.data?.pages.flatMap((page) => page.items) ?? [],
    (thread) => thread.thread_id,
  );
  const paused = !withinRefreshWindow(query.data?.pages.length, THREADS_MAX_PAGES);
  // Any capped page means the listing is partial — surfaced loudly, never a silent cut.
  const truncated = query.data?.pages.some((page) => page.truncated) ?? false;
  const filtered = status !== undefined || address !== undefined;

  // The two controls that do not survive being used, and where focus goes when
  // each of them is gone: the route heading, this pane's own top.
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const loadMore = useFocusHandoff(loadMoreRef, headingRef);
  const resume = useFocusHandoff(resumeRef, headingRef);
  const live = useLiveRegion('conversation-thread-list-announcer');
  const { announce, region } = live;

  const count = items.length;
  const hasMore = query.hasNextPage;
  const pageFailed = query.isFetchNextPageError;
  const loadingMore = query.isFetchingNextPage;
  /** Set by the paging click, cleared once that page's outcome is on screen. */
  const pendingPage = useRef(false);

  // Deliberately UNKEYED: a page already in the cache settles without the pane
  // ever rendering an in-flight state, so there is no value whose change can be
  // depended on to mark the outcome. The flag the click set is what makes this act.
  useEffect(() => {
    if (!pendingPage.current || loadingMore) return;
    pendingPage.current = false;
    // A failed page already speaks for itself in its own alert; a second account
    // of the same event beside it is one too many.
    if (!pageFailed) {
      const onScreen = `${countOf(count, 'thread', 'threads')} on screen.`;
      announce(hasMore ? `More threads loaded. ${onScreen}` : `All threads loaded. ${onScreen}`);
    }
    loadMore.settle();
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
      `Back to the newest threads. ${countOf(count, 'thread', 'threads')} on screen, and the list is refreshing again.`,
    );
    resume.settle();
  }, [paused, count, announce, resume]);

  // Said only in the state the pane actually shows it in: paused wins over stale.
  const staleMessage = !paused && query.isRefetchError ? staleReadMessage(query.error) : undefined;
  useStandingNotice(live, staleMessage);

  let body: ReactNode;
  if (query.isPending) {
    body = <Skeleton height={200} />;
  } else if (query.isLoadingError) {
    // Only the INITIAL-load failure blanks the list; query-core flags `status:
    // 'error'` on any fetch error even with pages retained, so this keys off
    // `isLoadingError`, not `isError`.
    body = (
      <ReadFailure
        error={query.error}
        onRetry={() => void query.refetch()}
        forbiddenDescription="A thread listing spans every caller on the route, so it is available to administrators only."
        notFoundDescription="This route no longer exists."
      />
    );
  } else if (items.length === 0) {
    body = filtered ? (
      <EmptyState
        title="No matching threads"
        description="No thread on this route matches the current status or address filter."
      />
    ) : (
      <EmptyState
        title="No threads yet"
        description="Threads appear here once this route has answered its first message."
      />
    );
  } else {
    body = (
      <div className="tai-stack tai-stack-3">
        <ScrollRegion label={`Threads on ${route}`}>
          <Table data-testid="conversation-threads-table">
            <THead>
              <TR>
                <TH>Address</TH>
                <TH>Last activity</TH>
                <TH numeric>Messages</TH>
                <TH>Delivery</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((thread) => (
                <ThreadRow
                  key={thread.thread_id}
                  route={route}
                  thread={thread}
                  selected={thread.thread_id === selected}
                  now={now}
                />
              ))}
            </TBody>
          </Table>
        </ScrollRegion>
        {hasMore ? (
          <Button
            ref={loadMoreRef}
            onClick={() => {
              pendingPage.current = true;
              loadMore.hold();
              void query.fetchNextPage();
            }}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading…' : 'Load more threads'}
          </Button>
        ) : null}
        {query.isFetchNextPageError ? (
          <div role="alert" className="tai-row">
            <span style={{ color: 'var(--tai-color-err-text)' }}>
              Could not load more threads: {errorMessage(query.error)}
            </span>
            <Button onClick={() => void query.fetchNextPage()}>Retry</Button>
          </div>
        ) : null}
      </div>
    );
  }

  // What the list is doing, whenever that is not "quietly keeping itself current":
  // paused this far down, or refreshing and failing. Paused wins — nothing is
  // being read at all in that state, and the one control clears both. Neither
  // notice is a live region of its own; both are spoken by the standing one.
  let refreshNotice: ReactNode = null;
  if (paused) {
    refreshNotice = (
      <div className="tai-row" data-testid="conversation-threads-paused">
        <span className="tai-muted" style={{ fontSize: 'var(--tai-text-xs)' }}>
          {PAUSED_NOTICE}
        </span>
        <Button
          ref={resumeRef}
          onClick={() => {
            resume.hold();
            trimToNewestPage(queryClient, queryKey);
            void query.refetch();
          }}
        >
          Back to the newest
        </Button>
      </div>
    );
  } else if (query.isRefetchError) {
    refreshNotice = <StaleRead error={query.error} onRetry={() => void query.refetch()} />;
  }

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
      {truncated ? <TruncatedNotice noun="threads" /> : null}
      {body}
      {refreshNotice}
      {region}
    </div>
  );
}
