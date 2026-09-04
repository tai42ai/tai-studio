/**
 * The admin failed-delivery view: every answer record whose delivery ended
 * `failed`, across every route and caller. A read-only surface — the door is
 * admin-only server-side (a failed listing spans every caller), so a scoped
 * session's 403 reads as a capability boundary, not a failure.
 *
 * Each failure renders through the shared {@link Exchange} — the visitor's message,
 * the answer the send failed on, its delivery chip and (behind a disclosure) the
 * admin-only `error` detail — prefaced with which route and address it belongs to,
 * because this listing is not scoped to one route the way a transcript is.
 *
 * It REFRESHES on its own ({@link FAILED_REFRESH_MS}): a delivery that has just
 * failed, or one that a retry has cleared, must not keep the standing it had when
 * the pane was opened.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, EmptyState, ScrollRegion, Skeleton, useApi } from '@tai42/studio-sdk';

import { useNow, RELATIVE_TICK_MS } from './clock';
import { Exchange } from './Exchange';
import { countOf } from './format';
import { conversationFailedMessagesKey } from './keys';
import { ReadFailure } from './read-states';

/** How often the failed listing re-reads the door. */
export const FAILED_REFRESH_MS = 30_000;

const originStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
  fontSize: 'var(--tai-text-xs)',
  color: 'var(--tai-color-text-muted)',
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

export function FailedMessages(): ReactNode {
  const api = useApi();
  const now = useNow(RELATIVE_TICK_MS);
  const failed = useQuery({
    queryKey: conversationFailedMessagesKey,
    queryFn: ({ signal }) => api.listFailedConversationMessages(signal),
    refetchInterval: FAILED_REFRESH_MS,
  });

  let body: ReactNode;
  if (failed.isPending) {
    body = <Skeleton height={160} />;
  } else if (failed.isError) {
    body = (
      <ReadFailure
        error={failed.error}
        onRetry={() => void failed.refetch()}
        forbiddenDescription="The failed-delivery listing spans every caller, so it is available to administrators only."
        notFoundDescription="Failed deliveries are not reachable on this deployment."
      />
    );
  } else if (failed.data.items.length === 0) {
    body = (
      <EmptyState
        title="No failed deliveries"
        description="Every answer has been delivered. A message whose delivery fails appears here with its error."
      />
    );
  } else {
    body = (
      <ScrollRegion label="Failed deliveries">
        <ul style={listStyle} data-testid="conversation-failed-list">
          {failed.data.items.map((record) => (
            <li
              key={record.message_id}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}
            >
              <div style={originStyle}>
                <span className="tai-mono">{record.route_name}</span>
                <span aria-hidden="true">·</span>
                <span className="tai-mono">{record.client_address}</span>
              </div>
              {/* Exchange is an <li> in a transcript; here each failure already sits
                  in its own list item, so the exchange is its content. */}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                <Exchange record={record} now={now} />
              </ul>
            </li>
          ))}
        </ul>
      </ScrollRegion>
    );
  }

  return (
    <div data-testid="conversation-failed">
      <Card>
        <h2 style={{ margin: '0 0 var(--tai-space-4)', fontSize: 'var(--tai-text-lg)' }}>
          Failed deliveries
          {failed.isSuccess && failed.data.items.length > 0 ? (
            <span
              className="tai-muted"
              style={{ fontSize: 'var(--tai-text-sm)', marginInlineStart: 'var(--tai-space-2)' }}
            >
              {countOf(failed.data.total, 'message', 'messages')}
            </span>
          ) : null}
        </h2>
        {body}
      </Card>
    </div>
  );
}
