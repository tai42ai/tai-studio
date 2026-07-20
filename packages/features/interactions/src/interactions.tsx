/**
 * The interactions inbox: the live list of human-in-the-loop questions
 * plus a floating count badge, both fed by the SSE stream.
 *
 * STATE: the live inbox is owned by `useInteractionsStream` — it opens the
 * authed SSE stream and applies `interaction.add` / `interaction.answered` /
 * `interaction.removed` frames, de-duplicating adds by `interaction_id` across the
 * backlog-replay overlap, and reconnecting on a dropped stream. This page only
 * renders that state and submits answers:
 *
 *   - loading (backlog not yet replayed, nothing to show) → Skeleton;
 *   - empty (backlog replayed, no interactions)           → EmptyState;
 *   - a stream OR answer error                            → a LOUD, always-visible
 *                                                           ErrorState (401 is not
 *                                                           special-cased here —
 *                                                           the shell owns that).
 *
 * ANSWER SUBMISSION: `answerInteraction(id, answer)` wrapped in a `useMutation`. A
 * 409 (`ApiConflictError`) is surfaced as the specific "already answered elsewhere"
 * message rather than a generic error — the question was resolved on another
 * client, not a failure the operator should retry.
 */
import { useMutation } from '@tanstack/react-query';
import type { CSSProperties, ReactNode } from 'react';

import { ApiConflictError } from '@tai42/api-client';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  isFullProjection,
  useApi,
  useCapabilities,
  useInteractionsStream,
} from '@tai42/studio-sdk';
import type { PageProps } from '@tai42/studio-sdk';

import { ChannelsCard } from './ChannelsCard';
import { InteractionCard } from './renderers';

/** Shown when a 409 says the question was resolved elsewhere (not a generic error). */
const ALREADY_ANSWERED_MESSAGE = 'This question was already answered elsewhere.';

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const headingStyle: CSSProperties = {
  margin: 0,
  font: 'var(--tai-text-xl, var(--tai-text-lg)) var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
};

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const badgeFloatStyle: CSSProperties = {
  position: 'fixed',
  right: 'var(--tai-space-4)',
  bottom: 'var(--tai-space-4)',
  zIndex: 40,
};

/**
 * Resolve the single message the ErrorState shows. An answer error takes priority
 * over a stream error (it is the operator's most recent action), and a 409 maps to
 * the specific "already answered elsewhere" message.
 */
function resolveErrorMessage(streamError: Error | null, answerError: Error | null): string | null {
  if (answerError !== null) {
    if (answerError instanceof ApiConflictError) return ALREADY_ANSWERED_MESSAGE;
    return answerError.message;
  }
  if (streamError !== null) return streamError.message;
  return null;
}

/** The loading placeholder: a few skeleton cards standing in for pending questions. */
function InboxLoading(): ReactNode {
  return (
    <div style={listStyle} data-testid="interactions-loading">
      {[0, 1, 2].map((row) => (
        <Card key={row}>
          <Skeleton width="40%" height={18} />
          <div style={{ marginTop: 'var(--tai-space-3)' }}>
            <Skeleton width="80%" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/**
 * The floating badge: the count of UNANSWERED interactions in the live stream.
 * Mounted globally by the shell (independent of the inbox route) so the count is
 * always visible; it opens its own view of the same stream. Renders nothing when
 * there is nothing pending.
 */
export function InteractionsBadge(): ReactNode {
  const { interactions } = useInteractionsStream();
  const pending = interactions.filter((interaction) => !interaction.answered).length;
  if (pending === 0) return null;
  const label = pending === 1 ? '1 pending question' : `${String(pending)} pending questions`;
  return (
    <div data-testid="interactions-badge" role="status" aria-label={label} style={badgeFloatStyle}>
      <Badge variant="primary">{pending}</Badge>
    </div>
  );
}

/**
 * The interactions inbox page. The `interactions` route carries no search params,
 * so the typed props are unused; the signature keeps the page interchangeable with
 * every other shell-mounted feature page.
 */
export function InteractionsPage(_props: PageProps<'interactions'>): ReactNode {
  const api = useApi();
  const { state } = useCapabilities();
  const stream = useInteractionsStream();
  const mutation = useMutation({
    mutationFn: (vars: { id: string; answer: unknown }) =>
      api.answerInteraction(vars.id, vars.answer),
  });

  const submittingId = mutation.isPending ? mutation.variables.id : undefined;
  const errorMessage = resolveErrorMessage(stream.error, mutation.error);
  // The server stream is `audience`-filtered, so a scoped caller sees only the
  // questions addressed to it; the empty-state copy reflects that per-identity feed.
  const scoped = state.status === 'ready' && !isFullProjection(state.projection);

  let body: ReactNode;
  if (!stream.backlogLoaded && stream.interactions.length === 0 && stream.error === null) {
    body = <InboxLoading />;
  } else if (stream.interactions.length === 0) {
    // A stream that errored before any question arrived shows only the error
    // above — never a misleading "all caught up" empty state next to it. An
    // answer-submission failure (mutation.error) does not blank the list, so this
    // keys on the stream's own error, not the combined message.
    body =
      stream.error === null ? (
        <EmptyState
          title="No pending questions"
          description={
            scoped
              ? 'Questions addressed to you appear here.'
              : 'Questions that need your input will appear here.'
          }
        />
      ) : null;
  } else {
    body = (
      <div style={listStyle}>
        {stream.interactions.map((interaction) => (
          <InteractionCard
            key={interaction.interaction_id}
            interaction={interaction}
            disabled={submittingId === interaction.interaction_id}
            onSubmit={(answer) => {
              mutation.mutate({ id: interaction.interaction_id, answer });
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <section style={pageStyle} aria-labelledby="interactions-heading">
      <h1 id="interactions-heading" style={headingStyle}>
        Interactions
      </h1>
      <ChannelsCard />
      {errorMessage !== null ? <ErrorState message={errorMessage} /> : null}
      {body}
    </section>
  );
}
