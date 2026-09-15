/**
 * The interactions inbox page: the live list of human-in-the-loop questions, answer
 * submission, and per-question withdrawal.
 *
 * STATE comes from `useInbox` — the paged base from `GET /api/interactions` overlaid
 * by the tail-only SSE stream. This page renders that state (loading → skeleton,
 * settled-empty → EmptyState, otherwise the grouped list) and drives the two writes:
 *
 *   - ANSWER: `answerInteraction(id, answer)` in a `useMutation`; a 409
 *     (`ApiConflictError`) surfaces the specific "already answered elsewhere" copy.
 *   - WITHDRAW: each pending card's quiet "Cancel question" ghost opens the house
 *     `ConfirmDialog`; on confirm `cancelInteraction(id)` withdraws the ask without
 *     answering it and refetches the paged base. A failed cancel keeps the dialog
 *     open with its specific, non-retryable copy — never a half-open state.
 */
import type { PageProps, StreamInteraction } from '@tai42/studio-sdk';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FeatureDisabled,
  featureDisabledMessage,
  isFullProjection,
  PageHeader,
  Stack,
  useApi,
  useCapabilities,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { ChannelsCard } from './ChannelsCard';
import { resolveCancelError, resolveErrorMessage } from './inbox-messages';
import { InboxList, InboxLoading } from './InboxList';
import { inboxKey } from './keys';
import { INBOX_PAGE_SIZE, useInbox } from './use-inbox';

/**
 * The interactions inbox page. The `interactions` route carries no search params,
 * so the typed props are unused; the signature keeps the page interchangeable with
 * every other shell-mounted feature page.
 */
export function InteractionsPage(_props: PageProps<'interactions'>): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const { state } = useCapabilities();
  const inbox = useInbox();
  const mutation = useMutation({
    mutationFn: (vars: { id: string; answer: unknown }) =>
      api.answerInteraction(vars.id, vars.answer),
  });

  // Withdrawing a pending ask: the question awaiting the confirm is `pendingCancel`;
  // a successful cancel closes the dialog and refetches the paged base so the
  // withdrawn card leaves the list (the server also emits an `interaction.removed` on
  // the tail — whichever lands first drops it). A failed cancel keeps the dialog open
  // with its error, never a half-open confusion.
  const [pendingCancel, setPendingCancel] = useState<StreamInteraction | null>(null);
  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelInteraction(id),
    onSuccess: () => {
      setPendingCancel(null);
      void queryClient.invalidateQueries({ queryKey: inboxKey(INBOX_PAGE_SIZE) });
    },
  });
  const requestCancel = (interaction: StreamInteraction): void => {
    // Clear any prior failure so this confirm opens clean, never carrying a stale
    // error from a different question's attempt.
    cancelMutation.reset();
    setPendingCancel(interaction);
  };
  const submit = (interaction: StreamInteraction, answer: unknown): void => {
    mutation.mutate({ id: interaction.interaction_id, answer });
  };

  const submittingId = mutation.isPending ? mutation.variables.id : undefined;
  const errorMessage = resolveErrorMessage(inbox.streamError, inbox.loadError, mutation.error);
  // The server list/stream are `audience`-filtered, so a scoped caller sees only the
  // questions addressed to it; the empty-state copy reflects that per-identity feed.
  const scoped = state.status === 'ready' && !isFullProjection(state.projection);
  // A read failure (stream OR list) that left nothing to show must not sit beside a
  // misleading "all caught up" empty state — the error alone speaks then.
  const readFailed = inbox.streamError !== null || inbox.loadError !== null;

  let body: ReactNode;
  if (inbox.loading) {
    body = <InboxLoading />;
  } else if (inbox.interactions.length === 0) {
    body = readFailed ? null : (
      <EmptyState
        title="No pending questions"
        description={
          scoped
            ? 'Questions addressed to you appear here.'
            : 'Questions that need your input will appear here.'
        }
      />
    );
  } else {
    body = (
      <InboxList
        interactions={inbox.interactions}
        submittingId={submittingId}
        onSubmit={submit}
        onCancel={requestCancel}
        hasNextPage={inbox.hasNextPage}
        loadMoreFailed={inbox.loadMoreFailed}
        isFetchingNextPage={inbox.isFetchingNextPage}
        onLoadMore={() => {
          inbox.fetchNextPage();
        }}
      />
    );
  }

  return (
    <Stack gap={4}>
      <PageHeader eyebrow="Activity" title="Interactions" />
      <ChannelsCard />
      {inbox.disabled ? (
        // The interactions store is unconfigured (terminal 501): render the muted
        // OFF note carrying the server's remediation message, never the loud red
        // stream error.
        <FeatureDisabled
          feature="Interactions"
          message={featureDisabledMessage(inbox.streamError)}
        />
      ) : (
        <>
          {errorMessage !== null ? <ErrorState message={errorMessage} /> : null}
          {body}
        </>
      )}
      {pendingCancel !== null ? (
        <ConfirmDialog
          title="Cancel question"
          confirmLabel="Withdraw question"
          pendingLabel="Cancelling"
          isPending={cancelMutation.isPending}
          error={resolveCancelError(cancelMutation.error)}
          onConfirm={() => {
            cancelMutation.mutate(pendingCancel.interaction_id);
          }}
          onClose={() => {
            setPendingCancel(null);
          }}
        >
          <p style={{ margin: 0 }}>
            Withdraw this question without answering it? The ask is cancelled and the flow that
            asked it will not resume. This cannot be undone.
          </p>
        </ConfirmDialog>
      ) : null}
    </Stack>
  );
}
