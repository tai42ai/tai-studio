/**
 * The thread-list body: the loading skeleton, the initial-load failure (admin-only
 * door), the empty states (filtered vs none yet), or the table of thread rows with
 * its "Load more threads" control and per-page error. Each row's whole surface opens
 * the thread; the address-cell link stays the accessible activation path.
 */
import type { ConversationThread } from '@tai42/api-client';
import {
  AppLink,
  Badge,
  Button,
  Checkbox,
  EmptyState,
  errorMessage,
  openTargetProps,
  ScrollRegion,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useAppNavigate,
} from '@tai42/studio-sdk';
import type { ReactNode, RefObject } from 'react';

import { formatAbsoluteEpoch, formatRelativeEpoch } from './format';
import { ReadFailure } from './read-states';
import { DELIVERY_LABEL, DELIVERY_VARIANT } from './status';

/** The accessible name of a thread row's link; the return-focus target after Back. */
export function threadRowLabel(threadId: string): string {
  return `Open thread ${threadId}`;
}

/**
 * The thread-list selection surface, present only when the reader may delete on
 * this route. When it is absent the list carries no checkbox column at all and
 * stays the read-only listing it was.
 */
export interface ThreadListSelection {
  readonly isSelected: (threadId: string) => boolean;
  readonly onToggle: (threadId: string) => void;
  readonly allSelected: boolean;
  readonly someSelected: boolean;
  readonly onToggleAll: () => void;
}

function ThreadRow({
  route,
  thread,
  selected,
  now,
  selection,
}: {
  readonly route: string;
  readonly thread: ConversationThread;
  readonly selected: boolean;
  /** The list's ticking clock, so "3 minutes ago" does not stay 3 minutes ago. */
  readonly now: number;
  readonly selection: ThreadListSelection | undefined;
}): ReactNode {
  const navigate = useAppNavigate();
  // The whole row opens the thread — the same destination as the address-cell link —
  // via the shared house pattern. The link stays as the accessible activation path;
  // the helper yields to it so a click on the link navigates once, never twice. The
  // selection checkbox is a `button`, which the helper yields to the same way, so
  // ticking a row never also opens it.
  return (
    <TR
      {...openTargetProps({
        onOpen: () => {
          navigate('conversations', { route, thread: thread.thread_id });
        },
      })}
    >
      {selection ? (
        <TD>
          <Checkbox
            aria-label={`Select thread ${thread.thread_id}`}
            checked={selection.isSelected(thread.thread_id)}
            onCheckedChange={() => {
              selection.onToggle(thread.thread_id);
            }}
          />
        </TD>
      ) : null}
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

export function ThreadListBody({
  route,
  selected,
  now,
  isPending,
  isLoadingError,
  error,
  onRetry,
  items,
  filtered,
  hasMore,
  loadingMore,
  pageFailed,
  loadMoreRef,
  onLoadMore,
  onRetryMore,
  selection,
}: {
  readonly route: string;
  readonly selected: string | undefined;
  readonly now: number;
  readonly isPending: boolean;
  readonly isLoadingError: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly items: ConversationThread[];
  readonly filtered: boolean;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly pageFailed: boolean;
  readonly loadMoreRef: RefObject<HTMLButtonElement | null>;
  readonly onLoadMore: () => void;
  readonly onRetryMore: () => void;
  /** The multi-select surface, or `undefined` to render a read-only listing. */
  readonly selection: ThreadListSelection | undefined;
}): ReactNode {
  if (isPending) return <Skeleton height={200} />;
  // Only the INITIAL-load failure blanks the list; query-core flags `status: 'error'`
  // on any fetch error even with pages retained, so this keys off isLoadingError.
  if (isLoadingError) {
    return (
      <ReadFailure
        error={error}
        onRetry={onRetry}
        forbiddenDescription="A thread listing spans every caller on the route, so it is available to administrators only."
        notFoundDescription="This route no longer exists."
      />
    );
  }
  if (items.length === 0) {
    return filtered ? (
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
  }
  return (
    <div className="tai-stack tai-stack-3">
      <ScrollRegion label={`Threads on ${route}`}>
        <Table data-testid="conversation-threads-table">
          <THead>
            <TR>
              {selection ? (
                <TH>
                  <Checkbox
                    aria-label="Select all threads"
                    checked={
                      selection.allSelected
                        ? true
                        : selection.someSelected
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={() => {
                      selection.onToggleAll();
                    }}
                  />
                </TH>
              ) : null}
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
                selection={selection}
              />
            ))}
          </TBody>
        </Table>
      </ScrollRegion>
      {hasMore ? (
        <Button ref={loadMoreRef} onClick={onLoadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'Load more threads'}
        </Button>
      ) : null}
      {pageFailed ? (
        <div role="alert" className="tai-row">
          <span style={{ color: 'var(--tai-color-err-text)' }}>
            Could not load more threads: {errorMessage(error)}
          </span>
          <Button onClick={onRetryMore}>Retry</Button>
        </div>
      ) : null}
    </div>
  );
}
