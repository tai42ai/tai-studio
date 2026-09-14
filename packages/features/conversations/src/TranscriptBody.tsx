/**
 * The transcript body: the loading skeleton, the initial-load failure, the empty
 * states (filtered vs whole thread), or the ordered list of exchanges with its
 * "Load older messages" control and per-page error.
 */
import type { ReactNode, RefObject } from 'react';

import { Button, EmptyState, Skeleton, errorMessage } from '@tai42/studio-sdk';
import type { ConversationMessage } from '@tai42/api-client';

import { Exchange } from './Exchange';
import { ReadFailure } from './read-states';

export function TranscriptBody({
  isPending,
  isLoadingError,
  error,
  onRetry,
  items,
  q,
  now,
  hasOlder,
  loadingOlder,
  pageFailed,
  loadOlderRef,
  onLoadOlder,
  onRetryOlder,
}: {
  readonly isPending: boolean;
  readonly isLoadingError: boolean;
  readonly error: unknown;
  readonly onRetry: () => void;
  readonly items: ConversationMessage[];
  readonly q: string | undefined;
  readonly now: number;
  readonly hasOlder: boolean;
  readonly loadingOlder: boolean;
  readonly pageFailed: boolean;
  readonly loadOlderRef: RefObject<HTMLButtonElement | null>;
  readonly onLoadOlder: () => void;
  readonly onRetryOlder: () => void;
}): ReactNode {
  if (isPending) return <Skeleton height={240} />;
  // Only the INITIAL-load failure blanks the transcript; query-core flags
  // `status: 'error'` on any fetch error even with pages retained.
  if (isLoadingError) {
    return (
      <ReadFailure
        error={error}
        onRetry={onRetry}
        forbiddenDescription="Reading conversation transcripts needs authority over this deployment's conversations."
        notFoundDescription="This thread is not available to you, or is no longer in the route's index — retention may have expired it."
      />
    );
  }
  if (items.length === 0) {
    return q !== undefined ? (
      <EmptyState
        title="No matching messages"
        description="No exchange in this thread matches the current text filter."
      />
    ) : (
      <EmptyState
        title="Nothing in this thread"
        description="The thread is indexed but holds no readable exchange."
      />
    );
  }
  return (
    <div className="tai-stack tai-stack-3">
      {hasOlder ? (
        <Button ref={loadOlderRef} onClick={onLoadOlder} disabled={loadingOlder}>
          {loadingOlder ? 'Loading…' : 'Load older messages'}
        </Button>
      ) : null}
      {pageFailed ? (
        <div role="alert" className="tai-row">
          <span style={{ color: 'var(--tai-color-err-text)' }}>
            Could not load older messages: {errorMessage(error)}
          </span>
          <Button onClick={onRetryOlder}>Retry</Button>
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
