/**
 * A thread's reply mode: whether the flow answers on its own (`agent`) or is held
 * back so a human answers (`manual`). One of the conversation monitor's thread
 * mutations, grafted onto the otherwise read-only monitor.
 *
 * The read tells the checkbox its state; flipping it PUTs the new mode and, on
 * success, invalidates the read so the control re-settles from the server's own
 * answer. A read failure and a flip failure each surface LOUDLY here rather than
 * hiding the control — a read-only session may set neither, and the refusal is
 * shown, never swallowed.
 */
import { type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Checkbox, ErrorState, Skeleton, errorMessage, useApi } from '@tai42/studio-sdk';
import type { ConversationThreadMode } from '@tai42/api-client';

import { conversationThreadModeKey } from './keys';

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

export function ThreadMode({
  route,
  threadId,
}: {
  readonly route: string;
  readonly threadId: string;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const queryKey = conversationThreadModeKey(route, threadId);

  const mode = useQuery({
    queryKey,
    queryFn: ({ signal }) => api.getConversationThreadMode(route, threadId, signal),
  });

  const mutation = useMutation({
    mutationFn: (next: ConversationThreadMode) =>
      api.setConversationThreadMode(route, threadId, next),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  let body: ReactNode;
  if (mode.isPending) {
    body = <Skeleton height={40} />;
  } else if (mode.isError) {
    body = <ErrorState message={errorMessage(mode.error)} onRetry={() => void mode.refetch()} />;
  } else {
    body = (
      <div style={headerStyle}>
        <Checkbox
          label="Agent replies automatically"
          checked={mode.data.mode === 'agent'}
          disabled={mutation.isPending}
          onCheckedChange={(next) => {
            mutation.reset();
            mutation.mutate(next ? 'agent' : 'manual');
          }}
        />
        <span className="tai-muted" style={{ fontSize: 'var(--tai-text-xs)' }}>
          {mode.data.mode === 'agent'
            ? 'The agent answers new messages in this thread.'
            : 'New messages wait for a human reply.'}
        </span>
        {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
      </div>
    );
  }

  return <Card>{body}</Card>;
}
