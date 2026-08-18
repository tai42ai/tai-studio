/**
 * A route-wide message search: every record on the route whose text matches `?q=`,
 * across threads, newest first. It stands in the detail pane when a needle is set
 * but no thread is picked — the same `q` that filters an OPEN thread's transcript
 * searches the whole route when none is.
 *
 * Each hit renders as its exchange with a link into the thread it belongs to. A
 * capped result set surfaces a LOUD partial-set notice — never a silent cut.
 */
import type { ReactNode } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  AppLink,
  Button,
  Card,
  EmptyState,
  Skeleton,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { useNow, RELATIVE_TICK_MS } from './clock';
import { Exchange } from './Exchange';
import { conversationMessageSearchKey } from './keys';
import { dedupeBy } from './paging';
import { ReadFailure, TruncatedNotice } from './read-states';

/** Matches per request. The server caps a page at 200 whatever is asked for. */
export const MESSAGE_SEARCH_PAGE_SIZE = 25;

export function MessageSearch({
  route,
  q,
}: {
  readonly route: string;
  readonly q: string;
}): ReactNode {
  const api = useApi();
  const now = useNow(RELATIVE_TICK_MS);
  const queryKey = conversationMessageSearchKey(route, MESSAGE_SEARCH_PAGE_SIZE, q);
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      api.searchConversationMessages(
        { routeName: route, q, page: pageParam, pageSize: MESSAGE_SEARCH_PAGE_SIZE },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next_page ?? undefined,
  });

  const items = dedupeBy(
    query.data?.pages.flatMap((page) => page.items) ?? [],
    (record) => record.message_id,
  );
  const truncated = query.data?.pages.some((page) => page.truncated) ?? false;

  let body: ReactNode;
  if (query.isPending) {
    body = <Skeleton height={200} />;
  } else if (query.isLoadingError) {
    body = (
      <ReadFailure
        error={query.error}
        onRetry={() => void query.refetch()}
        forbiddenDescription="Searching a route's messages spans every caller on it, so it is available to administrators only."
        notFoundDescription="This route no longer exists."
      />
    );
  } else if (items.length === 0) {
    body = (
      <EmptyState
        title="No matching messages"
        description="No record on this route matches the search text."
      />
    );
  } else {
    // Each hit is a labelled card: the thread link, then the exchange itself. The
    // `Exchange` is an `<li>`, so it sits in a minimal single-item list wrapper —
    // never bare, never nested inside another list item.
    body = (
      <div className="tai-stack tai-stack-3" data-testid="conversation-message-search">
        {items.map((record) => (
          <div key={record.message_id} className="tai-stack tai-stack-2">
            <AppLink
              to="conversations"
              search={{ route, thread: record.thread_id, q }}
              className="tai-table-id"
              aria-label={`Open thread ${record.thread_id}`}
            >
              {record.client_address}
            </AppLink>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <Exchange record={record} now={now} />
            </ol>
          </div>
        ))}
        {query.hasNextPage ? (
          <Button onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            {query.isFetchingNextPage ? 'Loading…' : 'Load more matches'}
          </Button>
        ) : null}
        {query.isFetchNextPageError ? (
          <div role="alert" className="tai-row">
            <span style={{ color: 'var(--tai-color-err-text)' }}>
              Could not load more matches: {errorMessage(query.error)}
            </span>
            <Button onClick={() => void query.fetchNextPage()}>Retry</Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Card>
      <div className="tai-stack tai-stack-3">
        <h2 className="tai-card-title">Search results for “{q}”</h2>
        {truncated ? <TruncatedNotice noun="messages" /> : null}
        {body}
      </div>
    </Card>
  );
}
