/**
 * The Connectors surface. Two sections — PROVIDERS you can connect to (grouped by
 * category, each showing its existing connection state), and existing CONNECTIONS —
 * plus a routed detail view. Selecting a connection sets the `connection` search param
 * (the shell owns the route); the detail view renders when that param is present.
 *
 * When a popup-blocked sign-in redirected the whole tab, the provider round-trips back
 * here with its result on the URL; {@link ConnectorsPage} completes that exchange on
 * arrival (see {@link useOAuthRedirectResume}).
 *
 * Server state flows through TanStack Query: each section shows a loading skeleton, a
 * shared empty state, or a LOUD, always-visible error surface — a failed request or a
 * zod mismatch is never a silent empty render, and a 401 is not special-cased here.
 */
import {
  AppLink,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FleetReport,
  PageHeader,
  Skeleton,
  Stack,
} from '@tai42/studio-sdk';
import type { PageProps } from '@tai42/studio-sdk';
import type {
  ConnectionView,
  ConnectorCategoryView,
  FleetReportSummary,
  ProviderView,
} from '@tai42/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@tai42/studio-sdk';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { CONNECTIONS_KEY, PROVIDERS_KEY, connectionKey } from './keys';
import { ConnectDialog } from './connect-dialog';
import { ConnectionDetail } from './connection-detail';
import { McpServersSection } from './mcp-servers';
import { Notice } from './notice';
import { useOAuthRedirectResume } from './oauth';

const HEALTH_VARIANT: Record<ConnectionView['auth_health_state'], string> = {
  healthy: 'success',
  reconnect_required: 'warning',
  refresh_failing: 'danger',
};

/** A category grouping of providers, in the order the section renders them. */
interface ProviderGroup {
  readonly id: string;
  readonly label: string;
  readonly providers: ProviderView[];
}

/**
 * Group providers under their categories, ordered by the catalog's `sort_order`, with
 * any provider whose category has no grouping row kept (never dropped) under its raw
 * category id at the end — the operator never loses sight of a provider.
 */
function groupByCategory(
  providers: ProviderView[],
  categories: ConnectorCategoryView[],
): ProviderGroup[] {
  const byCategory = new Map<string, ProviderView[]>();
  for (const provider of providers) {
    const bucket = byCategory.get(provider.category) ?? [];
    bucket.push(provider);
    byCategory.set(provider.category, bucket);
  }
  const groups: ProviderGroup[] = [];
  const seen = new Set<string>();
  for (const category of [...categories].sort((a, b) => a.sort_order - b.sort_order)) {
    const bucket = byCategory.get(category.id);
    if (bucket !== undefined && bucket.length > 0) {
      groups.push({ id: category.id, label: category.display_name, providers: bucket });
      seen.add(category.id);
    }
  }
  for (const [id, bucket] of byCategory) {
    if (!seen.has(id)) groups.push({ id, label: id, providers: bucket });
  }
  return groups;
}

function SectionHeading({ children }: { children: ReactNode }): ReactNode {
  return (
    <h2 className="tai-section-title" style={{ margin: '0 0 var(--tai-space-3)' }}>
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

function ProviderCard({
  provider,
  connections,
  connectionsUnavailable,
  onConnect,
}: {
  provider: ProviderView;
  connections: ConnectionView[];
  // The connections request failed: this card's connection state is unknown, so
  // it must not imply zero connections (Connect) or a healthy fleet.
  connectionsUnavailable: boolean;
  onConnect: (provider: ProviderView) => void;
}): ReactNode {
  const connectedCount = connections.length;
  const needsAttention = connections.some((c) => c.auth_health_state !== 'healthy');
  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
          {/* The provider mark is decorative — the display name beside it is the
              accessible name, so the icon carries an empty alt rather than a
              duplicate. `icon_url` is a required URL (the api-client schema parses
              it with `z.string().url()`), so it renders unconditionally. */}
          <img
            src={provider.icon_url}
            alt=""
            width={28}
            height={28}
            style={{ borderRadius: 'var(--tai-radius-sm)', flexShrink: 0 }}
          />
          <div>
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
          </div>
        </div>
        {connectionsUnavailable ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 'var(--tai-space-1)',
              flexShrink: 0,
            }}
          >
            <Badge variant="warning">Connection state unavailable</Badge>
            <Button
              onClick={() => {
                onConnect(provider);
              }}
            >
              Connect
            </Button>
          </div>
        ) : connectedCount === 0 ? (
          <Button
            variant="primary"
            onClick={() => {
              onConnect(provider);
            }}
          >
            Connect
          </Button>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 'var(--tai-space-1)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
              {`${String(connectedCount)} connected`}
            </span>
            <Button
              onClick={() => {
                onConnect(provider);
              }}
            >
              Add another account
            </Button>
          </div>
        )}
      </div>
    </Card>
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
  // The per-provider connection state is joined client-side from the connections list
  // (same key as the section below — one request, shared cache).
  const connectionsQuery = useQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: ({ signal }) => api.listConnections(signal),
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
  } else if (query.data.providers.length === 0) {
    body = (
      <EmptyState
        title="No connectors installed"
        description="Connectors arrive as marketplace plugins — install one to add a provider."
        action={
          <AppLink
            to="marketplace"
            search={{ kind: 'connector' }}
            className="tai-btn tai-btn-secondary"
          >
            Browse marketplace
          </AppLink>
        }
      />
    );
  } else {
    const connectionsByProvider = new Map<string, ConnectionView[]>();
    for (const connection of connectionsQuery.data?.items ?? []) {
      const bucket = connectionsByProvider.get(connection.provider_id) ?? [];
      bucket.push(connection);
      connectionsByProvider.set(connection.provider_id, bucket);
    }
    const groups = groupByCategory(query.data.providers, query.data.categories);
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        {groups.map((group) => (
          <div key={group.id}>
            <h3
              style={{
                margin: '0 0 var(--tai-space-2)',
                fontSize: 'var(--tai-text-sm)',
                fontWeight: 600,
                color: 'var(--tai-color-text-muted)',
              }}
            >
              {group.label}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
              {group.providers.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  connections={connectionsByProvider.get(provider.id) ?? []}
                  connectionsUnavailable={connectionsQuery.isError}
                  onConnect={onConnect}
                />
              ))}
            </div>
          </div>
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
  // The empty copy branches on provider availability, so the section reads the same
  // providers list the section above does (same key — one request, shared cache).
  const providers = useQuery({
    queryKey: PROVIDERS_KEY,
    queryFn: ({ signal }) => api.listProviders(signal),
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
    body =
      providers.data?.providers.length === 0 ? (
        <EmptyState
          title="No connections yet"
          description="Install a connector plugin from the marketplace, then connect it here."
          action={
            <AppLink
              to="marketplace"
              search={{ kind: 'connector' }}
              className="tai-btn tai-btn-secondary"
            >
              Browse marketplace
            </AppLink>
          }
        />
      ) : (
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
    <Stack gap={6}>
      <PageHeader eyebrow="Connections" title="Connectors" />
      {/* The unified page lists every sourced MCP server (mounted status + manifest
          config, each row showing how it was added) alongside the provider connectors
          below — one surface for all the tool sources the deployment mounts. */}
      <McpServersSection />
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
    </Stack>
  );
}

/** The Connectors page. Renders a connection's detail when `search.connection` is set. */
export function ConnectorsPage(props: PageProps<'connectors'>): ReactNode {
  const selected = props.search.connection;
  const detailId = selected !== undefined && selected !== '' ? selected : null;
  const queryClient = useQueryClient();
  // Finish a popup-blocked redirect flow whose provider round-trip returned here. A
  // reconnect/patch flow returns to a connection's detail, so its cached record is
  // invalidated too; the connections list is always invalidated inside the hook.
  const [resumeFleet, setResumeFleet] = useState<FleetReportSummary | null>(null);
  const resume = useOAuthRedirectResume({
    onSuccess: (fleet) => {
      if (detailId !== null) {
        void queryClient.invalidateQueries({ queryKey: connectionKey(detailId) });
      }
      setResumeFleet(fleet !== null && fleet.status !== 'converged' ? fleet : null);
    },
  });

  return (
    <Stack gap={4}>
      {resume.notice !== null ? (
        <Notice notice={resume.notice} onDismiss={resume.clearNotice} />
      ) : null}
      {resumeFleet !== null ? <FleetReport summary={resumeFleet} /> : null}
      {detailId !== null ? <ConnectionDetail connectionId={detailId} /> : <ConnectorsList />}
    </Stack>
  );
}
