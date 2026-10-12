/**
 * A provider's card on the Connectors page: its mark, name, kind and description,
 * where its app registration comes from, its administrator actions behind the admin
 * gate, and its connect affordance by connection state. Also the empty catalog.
 */
import type { ConnectionView, ProviderView } from '@tai42/api-client';
import { AppLink, Badge, Button, Card, EmptyState } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { ClientSourceLine, ProviderAdminActions, ProviderMark } from './provider-controls';

/** The card's connect affordance, by the provider's connection state. */
function ConnectAction({
  provider,
  connectedCount,
  connectionsUnavailable,
  onConnect,
}: {
  provider: ProviderView;
  connectedCount: number;
  connectionsUnavailable: boolean;
  onConnect: (provider: ProviderView) => void;
}): ReactNode {
  const column = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 'var(--tai-space-1)',
    flexShrink: 0,
  } as const;
  const connect = (): void => {
    onConnect(provider);
  };
  if (connectionsUnavailable) {
    return (
      <div style={column}>
        <Badge variant="warning">Connection state unavailable</Badge>
        <Button onClick={connect}>Connect</Button>
      </div>
    );
  }
  if (connectedCount === 0) {
    return (
      <Button variant="primary" onClick={connect}>
        Connect
      </Button>
    );
  }
  return (
    <div style={column}>
      <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
        {`${String(connectedCount)} connected`}
      </span>
      <Button onClick={connect}>Add another account</Button>
    </div>
  );
}

/** What a provider card hands back to the page: connect, and the administrator actions. */
export interface ProviderActions {
  readonly isAdmin: boolean;
  readonly onConnect: (provider: ProviderView) => void;
  readonly onCredentials: (provider: ProviderView) => void;
  readonly onRemove: (provider: ProviderView) => void;
}

export function ProviderCard({
  provider,
  connections,
  connectionsUnavailable,
  actions,
}: {
  provider: ProviderView;
  connections: ConnectionView[];
  // The connections request failed: this card's connection state is unknown, so
  // it must not imply zero connections (Connect) or a healthy fleet.
  connectionsUnavailable: boolean;
  actions: ProviderActions;
}): ReactNode {
  const needsAttention = connections.some((c) => c.auth_health_state !== 'healthy');
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--tai-space-4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--tai-space-3)',
            minWidth: 0,
          }}
        >
          <ProviderMark provider={provider} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
              <strong>{provider.display_name}</strong>
              <Badge variant={provider.kind === 'oauth' ? 'primary' : 'neutral'}>
                {provider.kind}
              </Badge>
              {!connectionsUnavailable && needsAttention ? (
                <Badge variant="warning">Needs attention</Badge>
              ) : null}
            </div>
            <p style={{ margin: 'var(--tai-space-1) 0 0', color: 'var(--tai-color-text-muted)' }}>
              {provider.description}
            </p>
            <ClientSourceLine provider={provider} />
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            gap: 'var(--tai-space-2)',
          }}
        >
          {actions.isAdmin ? (
            <ProviderAdminActions
              provider={provider}
              onCredentials={actions.onCredentials}
              onRemove={actions.onRemove}
            />
          ) : null}
          <ConnectAction
            provider={provider}
            connectedCount={connections.length}
            connectionsUnavailable={connectionsUnavailable}
            onConnect={actions.onConnect}
          />
        </div>
      </div>
    </Card>
  );
}

/** The empty catalog: the marketplace, and — for an administrator — adding a server. */
export function NoProviders({
  isAdmin,
  onAdd,
}: {
  isAdmin: boolean;
  onAdd: () => void;
}): ReactNode {
  return (
    <EmptyState
      title="No connectors installed"
      description={
        isAdmin
          ? 'Install a connector from the marketplace, or add any MCP server that signs in with OAuth by its address.'
          : 'Install a connector from the marketplace.'
      }
      action={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--tai-space-2)' }}>
          <AppLink
            to="marketplace"
            search={{ kind: 'connector' }}
            className="tai-btn tai-btn-secondary"
          >
            Browse marketplace
          </AppLink>
          {isAdmin ? <Button onClick={onAdd}>Add MCP server</Button> : null}
        </div>
      }
    />
  );
}
