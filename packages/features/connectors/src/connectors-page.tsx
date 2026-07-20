/**
 * The Connectors surface. Two sections — PROVIDERS you can connect to,
 * and existing CONNECTIONS — plus a routed detail view. Selecting a connection
 * sets the `connection` search param (the shell owns the route); the detail view
 * renders when that param is present.
 *
 * Server state flows through TanStack Query: each section shows a loading
 * skeleton, a shared empty state, or a LOUD, always-visible error surface — a
 * failed request or a zod mismatch is never a silent empty render, and a 401 is
 * not special-cased here.
 */
import { AppLink, Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@tai42/studio-sdk';
import type { PageProps } from '@tai42/studio-sdk';
import type { ConnectionView, ProviderView } from '@tai42/api-client';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@tai42/studio-sdk';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { CONNECTIONS_KEY, PROVIDERS_KEY } from './keys';
import { ConnectDialog } from './connect-dialog';
import { ConnectionDetail } from './connection-detail';

const HEALTH_VARIANT: Record<ConnectionView['auth_health_state'], string> = {
  healthy: 'success',
  reconnect_required: 'warning',
  refresh_failing: 'danger',
};

function SectionHeading({ children }: { children: ReactNode }): ReactNode {
  return (
    <h2
      style={{ margin: '0 0 var(--tai-space-3)', font: 'var(--tai-text-lg) var(--tai-font-sans)' }}
    >
      {children}
    </h2>
  );
}

function LoadingRows(): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <Skeleton height={64} />
      <Skeleton height={64} />
      <Skeleton height={64} />
    </div>
  );
}

function ProvidersSection({
  onConnect,
}: {
  onConnect: (provider: ProviderView) => void;
}): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: ({ signal }) => api.listProviders(signal),
  });

  let body: ReactNode;
  if (query.isPending) {
    body = <LoadingRows />;
  } else if (query.isError) {
    body = (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : 'Failed to load providers.'}
        onRetry={() => void query.refetch()}
      />
    );
  } else if (query.data.length === 0) {
    body = <EmptyState title="No providers available" description="No connectors are installed." />;
  } else {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        {query.data.map((provider) => (
          <Card key={provider.id}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--tai-space-4)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
                  <strong>{provider.display_name}</strong>
                  <Badge variant={provider.kind === 'oauth' ? 'primary' : 'neutral'}>
                    {provider.kind}
                  </Badge>
                  <Badge>{provider.category}</Badge>
                </div>
                <p
                  style={{ margin: 'var(--tai-space-1) 0 0', color: 'var(--tai-color-text-muted)' }}
                >
                  {provider.description}
                </p>
              </div>
              <Button
                variant="primary"
                onClick={() => {
                  onConnect(provider);
                }}
              >
                Connect
              </Button>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <section aria-label="Providers">
      <SectionHeading>Providers</SectionHeading>
      {body}
    </section>
  );
}

function ConnectionsSection(): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: ({ signal }) => api.listConnections(signal),
  });

  let body: ReactNode;
  if (query.isPending) {
    body = <LoadingRows />;
  } else if (query.isError) {
    body = (
      <ErrorState
        message={query.error instanceof Error ? query.error.message : 'Failed to load connections.'}
        onRetry={() => void query.refetch()}
      />
    );
  } else if (query.data.items.length === 0) {
    body = (
      <EmptyState
        title="No connections yet"
        description="Connect a provider above to get started."
      />
    );
  } else {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        {query.data.items.map((connection) => (
          <Card key={connection.connection_id}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--tai-space-4)',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
                  <AppLink to="connectors" search={{ connection: connection.connection_id }}>
                    {connection.alias}
                  </AppLink>
                  <Badge variant={HEALTH_VARIANT[connection.auth_health_state]}>
                    {connection.auth_health_state}
                  </Badge>
                </div>
                <p
                  style={{ margin: 'var(--tai-space-1) 0 0', color: 'var(--tai-color-text-muted)' }}
                >
                  {connection.provider_id}
                  {connection.account_identity !== null ? ` · ${connection.account_identity}` : ''}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <section aria-label="Connections">
      <SectionHeading>Connections</SectionHeading>
      {body}
    </section>
  );
}

function ConnectorsList(): ReactNode {
  const [connectProvider, setConnectProvider] = useState<ProviderView | null>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
      <h1 style={{ margin: 0, fontSize: 'var(--tai-text-xl)' }}>Connectors</h1>
      <ProvidersSection onConnect={setConnectProvider} />
      <ConnectionsSection />
      {connectProvider !== null ? (
        <ConnectDialog
          provider={connectProvider}
          onClose={() => {
            setConnectProvider(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** The Connectors page. Renders a connection's detail when `search.connection` is set. */
export function ConnectorsPage(props: PageProps<'connectors'>): ReactNode {
  const selected = props.search.connection;
  if (selected !== undefined && selected !== '') {
    return <ConnectionDetail connectionId={selected} />;
  }
  return <ConnectorsList />;
}
