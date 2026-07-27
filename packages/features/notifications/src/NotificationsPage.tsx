/**
 * The `/notifications` feature page: the internal notifications sink inbox.
 *
 * The messages the `notify_user` operation records with no channel land only here. The feed
 * is read through `useApi()` + TanStack Query as a `{ notifications }` list,
 * newest-first, and rendered in a semantic table. The view is a state machine —
 * loading → `<Skeleton>`, error → `<ErrorState>` (loud, always visible; a 401 is
 * not special-cased), empty → `<EmptyState>` — so a failed request is never a
 * silent empty render. Every server-supplied value renders as escaped React text
 * (a table cell), never through an HTML sink.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  EmptyState,
  ErrorState,
  ScrollRegion,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  errorMessage,
  isFullProjection,
  useApi,
  useCapabilities,
  type PageProps,
} from '@tai42/studio-sdk';

import { notificationsKey } from './keys';

const pageStyle: CSSProperties = {
  display: 'grid',
  gap: 'var(--tai-space-6)',
  maxWidth: '64rem',
};

const mutedStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
};

/**
 * An ISO-8601 timestamp rendered for humans. An unparseable value is shown
 * verbatim rather than swallowed.
 */
function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

/**
 * The notifications page. The `notifications` route carries no search parameters
 * ({@link PageProps}'s `search` is the empty object here), so the component
 * declares the shell's `PageProps<'notifications'>` contract for its call site but
 * reads nothing from it.
 */
export const NotificationsPage: (props: PageProps<'notifications'>) => ReactNode = () => {
  const api = useApi();
  const { state } = useCapabilities();
  const feed = useQuery({
    queryKey: notificationsKey,
    queryFn: ({ signal }) => api.listNotifications(signal),
  });

  // The server read door is `audience`-filtered, so a scoped caller sees only the
  // notifications addressed to it; the empty-state copy reflects that inbox.
  const scoped = state.status === 'ready' && !isFullProjection(state.projection);

  let body: ReactNode;
  if (feed.isPending) {
    body = <Skeleton height={160} />;
  } else if (feed.isError) {
    body = <ErrorState message={errorMessage(feed.error)} onRetry={() => void feed.refetch()} />;
  } else if (feed.data.notifications.length === 0) {
    body = (
      <EmptyState
        title="No notifications"
        description={
          scoped
            ? 'Notifications addressed to you appear here.'
            : 'Messages recorded with no delivery channel will appear here.'
        }
      />
    );
  } else {
    body = (
      <ScrollRegion label="Notifications">
        <Table data-testid="notifications-table">
          <THead>
            <TR>
              <TH>Message</TH>
              <TH>Recipient</TH>
              <TH>When</TH>
            </TR>
          </THead>
          <TBody>
            {feed.data.notifications.map((notification) => (
              <TR key={notification.id}>
                <TD>{notification.message}</TD>
                <TD>{notification.recipient ?? <span style={mutedStyle}>—</span>}</TD>
                <TD>{formatTimestamp(notification.created_at)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </ScrollRegion>
    );
  }

  return (
    <div style={pageStyle}>
      <h1 style={{ margin: 0, fontSize: 'var(--tai-text-xl)' }}>Notifications</h1>
      <Card>{body}</Card>
    </div>
  );
};
