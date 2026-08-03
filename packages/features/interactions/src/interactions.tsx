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
import { useId, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { CSSProperties, ReactNode } from 'react';

import { ApiConflictError } from '@tai42/api-client';
import {
  AlertTriangleIcon,
  AppLink,
  Badge,
  Card,
  ChevronDownIcon,
  ChevronRightIcon,
  EmptyState,
  ErrorState,
  FeatureDisabled,
  PageHeader,
  Skeleton,
  Stack,
  isFullProjection,
  useApi,
  useCapabilities,
  useInteractionsStream,
} from '@tai42/studio-sdk';
import type { PageProps, StreamInteraction } from '@tai42/studio-sdk';

import { ChannelsCard } from './ChannelsCard';
import { InteractionCard } from './renderers';

/** Shown when a 409 says the question was resolved elsewhere (not a generic error). */
const ALREADY_ANSWERED_MESSAGE = 'This question was already answered elsewhere.';

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const groupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

const groupHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  justifyContent: 'flex-start',
};

// Floats against the page, not modal layers, so it must not paint through an open
// modal: `sticky` is the design system's page-level stacking rung.
const badgeFloatStyle: CSSProperties = {
  position: 'fixed',
  right: 'var(--tai-space-4)',
  bottom: 'var(--tai-space-4)',
  zIndex: 'var(--tai-z-sticky)',
};

const badgeContentStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-1)',
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
 * The floating badge: the count of UNANSWERED interactions in the live stream,
 * mounted globally by the shell so it is always visible. A real anchor to
 * `/interactions` (focusable, keyboard-operable, middle-clickable).
 *
 * DEGRADED: on a true outage (errored AND disconnected) the count is stale, so the
 * badge flips to a warning naming the disconnect and stays visible even at a stale
 * zero — an outage is never silent. A healthy stream with nothing pending renders
 * nothing.
 */
export function InteractionsBadge(): ReactNode {
  const { interactions, disabled, connected, error } = useInteractionsStream();
  // The interactions store is unconfigured: the stream is terminally 501 and will
  // never carry a question, so the always-mounted badge stays absent rather than
  // hanging at zero on a stream that keeps trying.
  if (disabled) return null;
  const pending = interactions.filter((interaction) => !interaction.answered).length;
  // A true outage — errored AND not connected — means the count is stale. A frame
  // error on a still-connected stream is transient and does not degrade the badge.
  const degraded = error !== null && !connected;
  // Healthy and nothing pending → nothing to show. A degraded stream stays visible
  // even at zero so the outage is announced, not swallowed.
  if (pending === 0 && !degraded) return null;
  const countLabel = pending === 1 ? '1 pending question' : `${String(pending)} pending questions`;
  const label = degraded
    ? `Interactions stream disconnected — reconnecting (last known: ${countLabel})`
    : countLabel;
  // role="status" is a polite live region: a newly-arriving count or a flip into the
  // degraded state is announced to a screen reader via the link's label.
  return (
    <div
      role="status"
      data-testid="interactions-badge"
      data-degraded={degraded ? 'true' : undefined}
      style={badgeFloatStyle}
    >
      <AppLink to="interactions" search={{}} aria-label={label}>
        {/* The warning triangle carries the degraded state non-visually too, so the
            outage is perceivable without relying on the warning tint (WCAG 1.4.1). */}
        <Badge variant={degraded ? 'warning' : 'primary'}>
          {degraded ? (
            <span style={badgeContentStyle}>
              <AlertTriangleIcon />
              {pending}
            </span>
          ) : (
            pending
          )}
        </Badge>
      </AppLink>
    </div>
  );
}

/**
 * The inbox grouped by `group_id`: one entry per group, newest group first (by its
 * newest question), each group's questions newest-first. A group of a SINGLE
 * question renders as a bare card (grouping chrome would be noise); a multi-question
 * group renders a collapsible section carrying its own pending count.
 */
interface InteractionGroup {
  readonly groupId: string;
  readonly items: readonly StreamInteraction[];
  readonly pending: number;
  /** The newest question's `created_at` in ms — the group's sort key. */
  readonly newest: number;
}

/** Milliseconds of an interaction's `created_at`; an unparseable stamp sorts oldest. */
function createdMs(interaction: StreamInteraction): number {
  const ms = new Date(interaction.created_at).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Fold the flat stream into groups keyed by `group_id`. Group order and the order
 * within each group are both newest-first (by `created_at`); the per-group pending
 * count is the unanswered questions in that group.
 */
function groupInteractions(interactions: readonly StreamInteraction[]): InteractionGroup[] {
  const order: string[] = [];
  const byGroup = new Map<string, StreamInteraction[]>();
  // Only a non-empty group_id shared by 2+ questions is a real group; an empty or
  // absent group_id is ungrouped, so key it on the interaction_id to keep each such
  // question standalone rather than folding unrelated ones under one blank id.
  for (const interaction of interactions) {
    const key = interaction.group_id.length > 0 ? interaction.group_id : interaction.interaction_id;
    const existing = byGroup.get(key);
    if (existing === undefined) {
      byGroup.set(key, [interaction]);
      order.push(key);
    } else {
      existing.push(interaction);
    }
  }
  const groups = order.map((groupId): InteractionGroup => {
    const items = [...(byGroup.get(groupId) ?? [])].sort((a, b) => createdMs(b) - createdMs(a));
    return {
      groupId,
      items,
      pending: items.filter((item) => !item.answered).length,
      newest: items.reduce((max, item) => Math.max(max, createdMs(item)), 0),
    };
  });
  // Newest group first, keyed on each group's newest question.
  return groups.sort((a, b) => b.newest - a.newest);
}

/** The count label a group header shows: its unanswered questions of its total. */
function groupPendingLabel(group: InteractionGroup): string {
  const total = group.items.length;
  return group.pending > 0
    ? `${String(group.pending)} of ${String(total)} pending`
    : 'All answered';
}

/**
 * A collapsible section for a multi-question group: a header button (keyboard
 * operable, `aria-expanded`) carrying the group's pending count over the group's
 * question cards. Defaults to expanded so its questions are actionable without a
 * first click.
 */
function InteractionGroupSection({
  group,
  submittingId,
  onSubmit,
}: {
  readonly group: InteractionGroup;
  readonly submittingId: string | undefined;
  readonly onSubmit: (interaction: StreamInteraction, answer: unknown) => void;
}): ReactNode {
  const [open, setOpen] = useState(true);
  const panelId = useId();
  return (
    <Card>
      <div style={groupStyle} data-testid="interaction-group" data-group-id={group.groupId}>
        <button
          type="button"
          className="tai-btn tai-btn-ghost"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen((prev) => !prev);
          }}
          style={groupHeaderStyle}
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          <span>Related questions</span>
          <Badge variant={group.pending > 0 ? 'primary' : 'neutral'}>
            {groupPendingLabel(group)}
          </Badge>
        </button>
        {open ? (
          <div id={panelId} style={listStyle}>
            {group.items.map((interaction) => (
              <InteractionCard
                key={interaction.interaction_id}
                interaction={interaction}
                disabled={submittingId === interaction.interaction_id}
                onSubmit={(answer) => {
                  onSubmit(interaction, answer);
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </Card>
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
    // Questions carrying the same `group_id` belong to one multi-step flow; fold them
    // into collapsible groups (newest-first) so a related set reads as one unit rather
    // than scattered cards. A lone question in its own group stays a bare card.
    const groups = groupInteractions(stream.interactions);
    const submit = (interaction: StreamInteraction, answer: unknown): void => {
      mutation.mutate({ id: interaction.interaction_id, answer });
    };
    body = (
      <div style={listStyle}>
        {groups.map((group) => {
          const [first, ...rest] = group.items;
          // A lone question in its own group renders as a bare card — grouping chrome
          // would be noise; only a genuine multi-question group gets a section.
          if (first !== undefined && rest.length === 0) {
            return (
              <InteractionCard
                key={first.interaction_id}
                interaction={first}
                disabled={submittingId === first.interaction_id}
                onSubmit={(answer) => {
                  submit(first, answer);
                }}
              />
            );
          }
          return (
            <InteractionGroupSection
              key={group.groupId}
              group={group}
              submittingId={submittingId}
              onSubmit={submit}
            />
          );
        })}
      </div>
    );
  }

  return (
    <Stack gap={4}>
      <PageHeader eyebrow="Activity" title="Interactions" />
      <ChannelsCard />
      {stream.disabled ? (
        // The interactions store is unconfigured (terminal 501): render the muted
        // OFF note naming the enabling env var, never the loud red stream error.
        <FeatureDisabled feature="Interactions" envVar="INTERACTIONS_REDIS_URL" />
      ) : (
        <>
          {errorMessage !== null ? <ErrorState message={errorMessage} /> : null}
          {body}
        </>
      )}
    </Stack>
  );
}
