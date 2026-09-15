import type { StreamInteraction } from '@tai42/studio-sdk';
import { Badge, Button, Card, Skeleton } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { groupInteractions } from './inbox-grouping';
import { groupStyle, InteractionGroupSection, listStyle } from './InteractionGroupSection';
import { InteractionCard } from './renderers';

/** The loading placeholder: a few skeleton cards standing in for pending questions. */
export function InboxLoading(): ReactNode {
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
 * The populated inbox list: questions sharing a `group_id` fold into collapsible
 * groups (newest-first) so a related set reads as one unit; a lone question in its
 * own group stays a bare card. The Load more control pages the rest in, surfacing a
 * failed next-page fetch loudly beside it while staying usable to retry.
 */
export function InboxList({
  interactions,
  submittingId,
  onSubmit,
  onCancel,
  hasNextPage,
  loadMoreFailed,
  isFetchingNextPage,
  onLoadMore,
}: {
  readonly interactions: readonly StreamInteraction[];
  readonly submittingId: string | undefined;
  readonly onSubmit: (interaction: StreamInteraction, answer: unknown) => void;
  readonly onCancel: (interaction: StreamInteraction) => void;
  readonly hasNextPage: boolean;
  readonly loadMoreFailed: boolean;
  readonly isFetchingNextPage: boolean;
  readonly onLoadMore: () => void;
}): ReactNode {
  const groups = groupInteractions(interactions);
  return (
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
                onSubmit(first, answer);
              }}
              onCancel={() => {
                onCancel(first);
              }}
            />
          );
        }
        return (
          <InteractionGroupSection
            key={group.groupId}
            group={group}
            submittingId={submittingId}
            onSubmit={onSubmit}
            onCancel={onCancel}
          />
        );
      })}
      {hasNextPage ? (
        <div style={groupStyle}>
          {loadMoreFailed ? (
            <div role="alert" data-testid="interactions-load-more-error">
              <Badge variant="warning">Could not load more questions. Try again.</Badge>
            </div>
          ) : null}
          <Button
            onClick={onLoadMore}
            disabled={isFetchingNextPage}
            data-testid="interactions-load-more"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
