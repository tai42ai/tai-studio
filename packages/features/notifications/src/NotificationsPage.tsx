/**
 * The `/notifications` feature page: the internal notifications sink inbox.
 *
 * The messages the `notify_user` operation records with no channel land only here.
 * The feed is read through `useApi()` + TanStack Query as a `{ notifications }`
 * list, newest-first, and rendered as a vertical list of cards — the same inbox
 * idiom the interactions surface uses — so each record shows its FULL stored shape:
 * the message, any display media (images inline + safe links), any tappable
 * `options` the send offered, any pre-approved `template`, and the recipient /
 * audience / timestamp metadata. The parity wave taught the sink to STORE those
 * richer forms; this page is where they surface.
 *
 * The view is a state machine — loading → `<Skeleton>`, error → `<ErrorState>`
 * (loud, always visible; a 401 is not special-cased), empty → `<EmptyState>` — so a
 * failed request is never a silent empty render. The feed arrives whole (a bounded
 * server-side ring buffer, no cursor door), so pagination is a client-side "Show
 * more" reveal that keeps the initial render — and the images it may load — bounded.
 *
 * Every server-supplied value renders as escaped React text; the ONLY attribute
 * sinks are the media renderer's gated image `src` and link `href`. There is no
 * HTML sink anywhere on this page.
 */
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  Stack,
  errorMessage,
  isFullProjection,
  useApi,
  useCapabilities,
  type PageProps,
} from '@tai42/studio-sdk';
import type { ChannelTemplate, Notification } from '@tai42/api-client';

import { NotificationMedia } from './media';
import { notificationsKey } from './keys';

/** How many notifications the inbox reveals per page. The feed arrives whole (a
 *  bounded ring buffer up to ~1000 records, each possibly carrying an inline
 *  data-URI image), so a client-side reveal keeps the first paint — and its image
 *  loads — bounded; "Show more" widens the window in place. */
const PAGE_SIZE = 20;

const mutedStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
};

const cardBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

const messageStyle: CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
};

const labelStyle: CSSProperties = {
  ...mutedStyle,
  fontSize: 'var(--tai-text-sm)',
};

const metaRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-1) var(--tai-space-4)',
  fontSize: 'var(--tai-text-sm)',
  ...mutedStyle,
};

const templateStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
};

/**
 * An ISO-8601 timestamp rendered for humans. An unparseable value is shown verbatim
 * rather than swallowed.
 */
function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

/** The tappable option labels the send offered. Display-only in the operator inbox —
 *  there is no conversation for the sink to enter — so they render as inert chips,
 *  not activatable controls, each label as escaped text. */
function OptionChips({ options }: { readonly options: readonly string[] }): ReactNode {
  return (
    <div style={templateStyle} data-testid="notification-options">
      <span style={labelStyle}>Options offered</span>
      <div style={chipRowStyle}>
        {options.map((option, index) => (
          <Badge key={`${String(index)}-${option}`} variant="neutral">
            {option}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/** A pre-approved channel template the send carried: its name + language, and the
 *  positional body parameters it would substitute. Every value escaped text. */
function TemplateBlock({ template }: { readonly template: ChannelTemplate }): ReactNode {
  return (
    <div style={templateStyle} data-testid="notification-template">
      <span style={labelStyle}>Template</span>
      <div style={chipRowStyle}>
        <Badge variant="neutral">{template.name}</Badge>
        <Badge variant="neutral">{template.language}</Badge>
      </div>
      {template.parameters.length > 0 ? (
        <span style={labelStyle}>Parameters: {template.parameters.join(', ')}</span>
      ) : null}
    </div>
  );
}

/** One notification, rendered with its full stored shape. */
function NotificationCard({ notification }: { readonly notification: Notification }): ReactNode {
  const hasMedia = Array.isArray(notification.media) && notification.media.length > 0;
  const hasOptions = Array.isArray(notification.options) && notification.options.length > 0;
  return (
    <Card>
      <div
        style={cardBodyStyle}
        data-testid="notification-card"
        data-notification-id={notification.id}
      >
        <p style={messageStyle}>{notification.message}</p>
        {hasMedia ? <NotificationMedia media={notification.media ?? []} /> : null}
        {hasOptions ? <OptionChips options={notification.options ?? []} /> : null}
        {notification.template != null ? <TemplateBlock template={notification.template} /> : null}
        <div style={metaRowStyle} data-testid="notification-meta">
          {notification.recipient != null ? <span>Recipient: {notification.recipient}</span> : null}
          {notification.audience != null ? <span>Audience: {notification.audience}</span> : null}
          <span>{formatTimestamp(notification.created_at)}</span>
        </div>
      </div>
    </Card>
  );
}

/**
 * The notifications page. The `notifications` route carries no search parameters
 * ({@link PageProps}'s `search` is the empty object here), so the component declares
 * the shell's `PageProps<'notifications'>` contract for its call site but reads
 * nothing from it.
 */
export const NotificationsPage: (props: PageProps<'notifications'>) => ReactNode = () => {
  const api = useApi();
  const { state } = useCapabilities();
  const [visible, setVisible] = useState(PAGE_SIZE);
  const feed = useQuery({
    queryKey: notificationsKey,
    queryFn: ({ signal }) => api.listNotifications(signal),
  });

  // The server read door is `audience`-filtered, so a scoped caller sees only the
  // notifications addressed to it; the empty-state copy reflects that inbox.
  const scoped = state.status === 'ready' && !isFullProjection(state.projection);

  let body: ReactNode;
  if (feed.isPending) {
    body = (
      <Card>
        <Skeleton height={160} />
      </Card>
    );
  } else if (feed.isError) {
    body = (
      <Card>
        <ErrorState message={errorMessage(feed.error)} onRetry={() => void feed.refetch()} />
      </Card>
    );
  } else if (feed.data.notifications.length === 0) {
    body = (
      <Card>
        <EmptyState
          title="No notifications"
          description={
            scoped
              ? 'Notifications addressed to you appear here.'
              : 'Messages recorded with no delivery channel will appear here.'
          }
        />
      </Card>
    );
  } else {
    // The feed is served newest-first; render it in place. Only the first `visible`
    // records mount, so the initial paint (and any inline images it loads) is bounded.
    const all = feed.data.notifications;
    const shown = all.slice(0, visible);
    const remaining = all.length - shown.length;
    body = (
      <Stack gap={4}>
        <ul data-testid="notifications-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((notification) => (
            <li key={notification.id} style={{ marginBottom: 'var(--tai-space-4)' }}>
              <NotificationCard notification={notification} />
            </li>
          ))}
        </ul>
        {remaining > 0 ? (
          <div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setVisible((count) => count + PAGE_SIZE);
              }}
            >
              Show more ({remaining.toLocaleString()})
            </Button>
          </div>
        ) : null}
      </Stack>
    );
  }

  return (
    <Stack gap={6}>
      <PageHeader eyebrow="Activity" title="Notifications" />
      {body}
    </Stack>
  );
};
