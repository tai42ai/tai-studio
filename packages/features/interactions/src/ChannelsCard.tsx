/**
 * Read-only catalog card: the channel plugins installed on this deployment —
 * the media an `ask_user` question can be delivered on (Telegram, Slack, SMS…)
 * besides this inbox. Purely informational; binding a channel to a question is
 * the tool author's call (the `channel` argument), not a Studio action.
 */
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties, ReactNode } from 'react';

import { Badge, Card, ErrorState, Skeleton, useApi } from '@tai42/studio-sdk';

import { channelsKey } from './keys';

const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

const titleStyle: CSSProperties = {
  margin: 0,
  font: 'var(--tai-text-md) var(--tai-font-sans)',
  color: 'var(--tai-color-text)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
};

const mutedStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

export function ChannelsCard(): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: channelsKey(),
    queryFn: ({ signal }) => api.listChannels(signal),
  });

  let body: ReactNode;
  if (query.isPending) {
    body = <Skeleton width="60%" />;
  } else if (query.isError) {
    body = <ErrorState message={query.error.message} />;
  } else if (query.data.channels.length === 0) {
    body = (
      <span style={mutedStyle}>
        No delivery channels installed — questions appear only in this inbox.
      </span>
    );
  } else {
    body = (
      <div style={rowStyle} data-testid="channels-list">
        {query.data.channels.map((name) => (
          <Badge key={name} variant="neutral">
            {name}
          </Badge>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <div style={bodyStyle} data-testid="channels-card">
        <h2 style={titleStyle}>Delivery channels</h2>
        {body}
      </div>
    </Card>
  );
}
