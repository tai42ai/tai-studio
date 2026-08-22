/**
 * The interactions inbox: the live list of human-in-the-loop questions plus a
 * floating count badge.
 *
 * STATE: the pending set is the PAGED base from `GET /api/interactions` (a
 * TanStack infinite query), and the live tail-only SSE stream overlays
 * `interaction.add` / `interaction.answered` / `interaction.removed` deltas on it.
 * `useInbox` composes the two — the query seeds the stream and is refetched on
 * every (re)connect (the tail carries no backlog to reconcile against). This page
 * renders that state and submits answers:
 *
 *   - loading (the first page not yet in) → Skeleton;
 *   - empty (the page settled, no interactions) → EmptyState;
 *   - a stream, list-read OR answer error → a LOUD, always-visible ErrorState
 *     (401 is not special-cased here — the shell owns that).
 *
 * The count badge reads the live derived count (the door's `total` moved by the
 * stream overlay, reconciled by resync epoch so a reconnect never double-counts):
 * every terminal frame refers to a question within `total`, so an answer/removal
 * decrements even for a question on an unloaded page, and a live add moves it without
 * a refetch. The one residual — a frame arriving while a refetch is in flight — may or
 * may not be in that refetch's total and reconciles on the next resync. "Load more"
 * pages the rest in.
 *
 * ANSWER SUBMISSION: `answerInteraction(id, answer)` wrapped in a `useMutation`. A
 * 409 (`ApiConflictError`) is surfaced as the specific "already answered elsewhere"
 * message rather than a generic error — the question was resolved on another
 * client, not a failure the operator should retry.
 */
import { useCallback, useId, useMemo, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties, ReactNode } from 'react';

import { ApiConflictError } from '@tai42/api-client';
import type { Interaction } from '@tai42/api-client';
import {
  AlertTriangleIcon,
  AppLink,
  Badge,
  Button,
  Card,
  ChevronDownIcon,
  ChevronRightIcon,
  EmptyState,
  ErrorState,
  FeatureDisabled,
  featureDisabledMessage,
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
import { inboxKey } from './keys';
import { InteractionCard } from './renderers';

/** Shown when a 409 says the question was resolved elsewhere (not a generic error). */
const ALREADY_ANSWERED_MESSAGE = 'This question was already answered elsewhere.';

/** Pending interactions per page. The server caps a page at 200 whatever is asked. */
const INBOX_PAGE_SIZE = 50;

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
 * The composed inbox: the paged pending base (the infinite query) seeding the
 * tail-only stream, refetched on every (re)connect. Both the page and the
 * always-mounted badge consume it; the query cache is shared by key, and each
 * mount opens its own stream (distinct-URL per open).
 */
interface Inbox {
  /** The merged live list: the paged base with the tail's deltas overlaid. */
  readonly interactions: StreamInteraction[];
  /**
   * The live pending count for the badge: the door's `total` adjusted by the stream
   * overlay (adds/answered/removed), so it moves on a live delta without a refetch.
   */
  readonly count: number;
  readonly connected: boolean;
  readonly streamError: Error | null;
  readonly disabled: boolean;
  /**
   * A background refetch of the paged base FAILED after an initial success (the door
   * 500s on a resync): the count is now stale, so the badge degrades rather than
   * freezing silently on the last value.
   */
  readonly refetchFailed: boolean;
  /** The query lifecycle: `pending` gates the loading skeleton. */
  readonly loading: boolean;
  readonly loadError: Error | null;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  /**
   * The most recent `fetchNextPage` FAILED (the next-page fetch 500s): surfaced
   * loudly beside the Load more control, which stays usable to retry. Cleared once a
   * retry succeeds.
   */
  readonly loadMoreFailed: boolean;
  fetchNextPage(): void;
}

function useInbox(): Inbox {
  const api = useApi();
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: inboxKey(INBOX_PAGE_SIZE),
    queryFn: ({ pageParam, signal }) => api.listInteractions(pageParam, INBOX_PAGE_SIZE, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next_page ?? undefined,
  });
  // A stable seed reference between refetches: the stream hook re-merges on a new
  // reference but does not reopen the stream, so it must not churn every render.
  const seed = useMemo<readonly Interaction[]>(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );
  // Refetch the paged base and report whether it LANDED. `throwOnError` makes
  // `refetchQueries` reject when the list door fails (query-core otherwise swallows a
  // per-query refetch error), so a failed resync resolves `false` and the stream hook
  // holds its resync epoch — the prior-epoch deltas keep applying against the prior
  // total instead of being discarded against a stale one. The failure is still loud:
  // `query.isRefetchError` flips the badge to its degraded state.
  const onResync = useCallback(async (): Promise<boolean> => {
    try {
      await queryClient.refetchQueries(
        { queryKey: inboxKey(INBOX_PAGE_SIZE) },
        { throwOnError: true },
      );
      return true;
    } catch {
      return false;
    }
  }, [queryClient]);
  // Every page echoes the same total; the newest read is the freshest. The stream
  // derives the live badge count from this base total plus its overlay delta.
  const total = query.data?.pages.at(-1)?.total ?? 0;
  const stream = useInteractionsStream({ seed, total, onResync });
  return {
    interactions: stream.interactions,
    count: stream.count,
    connected: stream.connected,
    streamError: stream.error,
    disabled: stream.disabled,
    // `isRefetchError` is a resync failure with pages retained (as opposed to
    // `isLoadingError`, the initial-load failure): the badge degrades on it.
    refetchFailed: query.isRefetchError,
    // `isLoadingError` (not `isError`) is the INITIAL-load failure: query-core flags
    // `status:'error'` on any fetch error even with pages retained.
    loading: query.status === 'pending',
    loadError: query.isLoadingError ? query.error : null,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    loadMoreFailed: query.isFetchNextPageError,
    fetchNextPage: () => void query.fetchNextPage(),
  };
}

/**
 * Resolve the single message the ErrorState shows. An answer error takes priority
 * (it is the operator's most recent action; a 409 maps to the specific "already
 * answered elsewhere" message), then a list-read failure, then a stream error.
 */
function resolveErrorMessage(
  streamError: Error | null,
  loadError: Error | null,
  answerError: Error | null,
): string | null {
  if (answerError !== null) {
    if (answerError instanceof ApiConflictError) return ALREADY_ANSWERED_MESSAGE;
    return answerError.message;
  }
  if (loadError !== null) return loadError.message;
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
 * The floating badge: the count of pending interactions, mounted globally by the
 * shell so it is always visible. Reads the live derived `count` (the door's `total`
 * moved by the stream overlay): a terminal frame decrements even for a question on an
 * unloaded page, and a live add moves it without a refetch (the one residual — a frame
 * arriving while a refetch is in flight — reconciles on the next resync). A real
 * anchor to `/interactions` (focusable, keyboard-operable, middle-clickable).
 *
 * DEGRADED: on a true outage — the stream errored AND disconnected, OR a background
 * refetch of the paged base failed — the count is stale, so the badge flips to a
 * warning naming the fault and stays visible even at a stale zero. An outage is
 * never silent. A healthy stream with nothing pending renders nothing.
 */
export function InteractionsBadge(): ReactNode {
  const inbox = useInbox();
  // The interactions store is unconfigured: the stream is terminally 501 and will
  // never carry a question, so the always-mounted badge stays absent rather than
  // hanging at zero on a stream that keeps trying.
  if (inbox.disabled) return null;
  const pending = inbox.count;
  // A true outage means the count is stale: the stream errored AND is not connected,
  // OR a background resync of the paged base failed. A frame error on a still-open
  // stream is transient and does not degrade the badge.
  const streamDown = inbox.streamError !== null && !inbox.connected;
  const degraded = streamDown || inbox.refetchFailed;
  // Healthy and nothing pending → nothing to show. A degraded badge stays visible
  // even at zero so the outage is announced, not swallowed.
  if (pending === 0 && !degraded) return null;
  const countLabel = pending === 1 ? '1 pending question' : `${String(pending)} pending questions`;
  const label = degraded
    ? streamDown
      ? `Interactions stream disconnected — reconnecting (last known: ${countLabel})`
      : `Interactions list failed to refresh — retrying (last known: ${countLabel})`
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
 * Fold the flat list into groups keyed by `group_id`. Group order and the order
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
  const inbox = useInbox();
  const mutation = useMutation({
    mutationFn: (vars: { id: string; answer: unknown }) =>
      api.answerInteraction(vars.id, vars.answer),
  });

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
    // Questions carrying the same `group_id` belong to one multi-step flow; fold them
    // into collapsible groups (newest-first) so a related set reads as one unit rather
    // than scattered cards. A lone question in its own group stays a bare card.
    const groups = groupInteractions(inbox.interactions);
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
        {inbox.hasNextPage ? (
          <div style={groupStyle}>
            {inbox.loadMoreFailed ? (
              <div role="alert" data-testid="interactions-load-more-error">
                <Badge variant="warning">Could not load more questions. Try again.</Badge>
              </div>
            ) : null}
            <Button
              onClick={() => {
                inbox.fetchNextPage();
              }}
              disabled={inbox.isFetchingNextPage}
              data-testid="interactions-load-more"
            >
              {inbox.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        ) : null}
      </div>
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
    </Stack>
  );
}
