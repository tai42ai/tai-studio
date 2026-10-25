/**
 * The status pieces of a Connectors directory entry: its status line, a provider's
 * connections with their own controls, and a server's mounted tool names. The grants
 * and actions types the entries share live here too.
 */
import { apiRoutes, type ConnectionView, type ProviderView } from '@tai42/api-client';
import {
  AlertTriangleIcon,
  AppLink,
  Button,
  Skeleton,
  toolDisplayLabel,
  useAppNavigate,
  useCanWrite,
  useToolDisplayNames,
} from '@tai42/studio-sdk';
import { type ReactNode, useState } from 'react';

import type { FlowTarget } from './connect-flow-dialog';
import { HEALTH_LABEL } from './connection-detail-cards';
import { useConnectorAdmin } from './use-add-server-dialog';
import {
  connectionEntries,
  type DirectoryReads,
  type DirectoryRow,
  liveStateOf,
  type ProviderRow,
  type ServerRow,
} from './use-directory';

export function reloadNoGrant(title: string): string {
  return `This session cannot reload ${title}. Reloading needs write access to POST /api/mcp-status/{title}/reload; ask an administrator to grant it.`;
}

/** What a directory entry asks the page to open. */
export interface DirectoryActions {
  readonly openFlow: (target: FlowTarget) => void;
  readonly onCredentials: (provider: ProviderView) => void;
  readonly onRemove: (provider: ProviderView) => void;
  readonly onReload: (title: string) => void;
  readonly onDeregister: (title: string) => void;
}

/** The session's grants the entries read. */
export interface DirectoryGrants {
  readonly canConnect: boolean;
  readonly canInstall: boolean;
  readonly canPickTools: boolean;
  readonly canReload: boolean;
  readonly canDeregister: boolean;
  readonly isAdmin: boolean;
}

export function useDirectoryGrants(): DirectoryGrants {
  const canListTools = useCanWrite(apiRoutes.post_api_mcp_status_title_advertised_tools.path);
  const canPick = useCanWrite(apiRoutes.put_api_mcp_config_entries_title_tool_filter.path, 'PUT');
  return {
    canConnect: useCanWrite(apiRoutes.post_api_connectors_connections_start.path),
    canInstall: useCanWrite(apiRoutes.post_api_marketplace_install.path),
    canPickTools: canListTools && canPick,
    canReload: useCanWrite(apiRoutes.post_api_mcp_status_title_reload.path),
    canDeregister: useCanWrite(apiRoutes.post_api_mcp_status_title_deregister.path),
    isAdmin: useConnectorAdmin(),
  };
}

export interface EntryProps {
  readonly row: DirectoryRow;
  readonly reads: DirectoryReads;
  readonly grants: DirectoryGrants;
  readonly actions: DirectoryActions;
}

export function StatusLine({
  tone,
  children,
}: {
  tone?: 'warn' | 'err';
  children: ReactNode;
}): ReactNode {
  const className =
    tone === 'warn'
      ? 'tai-status tai-status-warn'
      : tone === 'err'
        ? 'tai-status tai-status-err'
        : 'tai-status';
  return (
    <p className={className} style={{ margin: 0, overflowWrap: 'anywhere' }}>
      {tone !== undefined ? <AlertTriangleIcon /> : null}
      {children}
    </p>
  );
}

export function NoGrantLine({ children }: { children: string }): ReactNode {
  return (
    <p role="status" className="tai-status" style={{ margin: 0 }}>
      {children}
    </p>
  );
}

/** One connection's state on its provider card, by the first rule that holds. */
function connectionState(
  connection: ConnectionView,
  reads: DirectoryReads,
): { text: string; tone?: 'warn' | 'err'; fixable: 'detail' | { title: string } | null } {
  if (connection.auth_health_state !== 'healthy') {
    return { text: HEALTH_LABEL[connection.auth_health_state], tone: 'warn', fixable: 'detail' };
  }
  const entries = reads.manifest.status === 'ready' ? reads.manifest.data : null;
  const status = reads.status.status === 'ready' ? reads.status.data : null;
  const mine = connectionEntries(entries, connection.connection_id);
  if (entries !== null && mine.length === 0) return { text: 'No server enabled', fixable: null };
  for (const entry of mine) {
    const live = liveStateOf(entry.title, status);
    if (live.kind === 'failed') {
      return {
        text: `Failed: ${live.failure.category}`,
        tone: 'err',
        fixable: { title: entry.title },
      };
    }
  }
  for (const entry of mine) {
    if (liveStateOf(entry.title, status).kind === 'not_loaded') {
      return { text: `Not loaded: ${entry.title}`, tone: 'warn', fixable: { title: entry.title } };
    }
  }
  if (entries === null || status === null) return { text: 'Connected', fixable: null };
  const count = mine.reduce((sum, entry) => sum + (status.bound[entry.title]?.length ?? 0), 0);
  return { text: `${String(count)} tools mounted`, fixable: null };
}

function ProviderConnections({
  row,
  connections,
  reads,
  grants,
  actions,
}: {
  row: ProviderRow;
  connections: readonly ConnectionView[];
} & Omit<EntryProps, 'row'>): ReactNode {
  const navigate = useAppNavigate();
  const [expanded, setExpanded] = useState(false);
  const entries = reads.manifest.status === 'ready' ? reads.manifest.data : null;
  const shown = expanded ? connections : connections.slice(0, 3);
  const name = row.provider.display_name;
  return (
    <div>
      <ul
        aria-label={`Connections to ${name}`}
        style={{ listStyle: 'none', margin: 'var(--tai-space-2) 0 0', padding: 0 }}
      >
        {shown.map((connection) => {
          const state = connectionState(connection, reads);
          const mine = connectionEntries(entries, connection.connection_id);
          return (
            <li
              key={connection.connection_id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 'var(--tai-space-2)',
                marginBottom: 'var(--tai-space-1)',
              }}
            >
              <AppLink to="connectors" search={{ connection: connection.connection_id }}>
                {connection.alias}
              </AppLink>
              <StatusLine {...(state.tone === undefined ? {} : { tone: state.tone })}>
                {state.text}
              </StatusLine>
              {grants.canPickTools && entries !== null && mine.length > 0 ? (
                <Button
                  variant="ghost"
                  aria-label={`Pick tools for ${connection.alias}`}
                  onClick={() => {
                    actions.openFlow({
                      kind: 'pick',
                      name: `${name} (${connection.alias})`,
                      titles: mine.map((entry) => entry.title),
                      connectionId: connection.connection_id,
                    });
                  }}
                >
                  Pick tools
                </Button>
              ) : null}
              {state.fixable === 'detail' ? (
                <Button
                  variant="ghost"
                  aria-label={`Fix ${connection.alias}`}
                  onClick={() => {
                    navigate('connectors', { connection: connection.connection_id });
                  }}
                >
                  Fix
                </Button>
              ) : state.fixable !== null && grants.canReload ? (
                <Button
                  variant="ghost"
                  aria-label={`Fix ${connection.alias}`}
                  onClick={() => {
                    if (state.fixable !== null && state.fixable !== 'detail') {
                      actions.openFlow({ kind: 'server', title: state.fixable.title });
                    }
                  }}
                >
                  Fix
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {connections.length > 3 ? (
        <Button
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((was) => !was);
          }}
        >
          {expanded ? 'Show fewer' : `Show all ${String(connections.length)} connections`}
        </Button>
      ) : null}
    </div>
  );
}

/** A provider's status line and its connections. */
function ProviderStatus({
  row,
  reads,
  grants,
  actions,
}: { row: ProviderRow } & Omit<EntryProps, 'row'>): ReactNode {
  const { connections } = row;
  if (connections === null) return <Skeleton height={16} />;
  if (connections === 'unknown') return <StatusLine>Connection status not available</StatusLine>;
  if (connections.length === 0) return <StatusLine>Not connected</StatusLine>;
  let line = `${String(connections.length)} connected`;
  const entries = reads.manifest.status === 'ready' ? reads.manifest.data : null;
  const status = reads.status.status === 'ready' ? reads.status.data : null;
  if (entries !== null && status !== null) {
    const count = connections
      .flatMap((c) => connectionEntries(entries, c.connection_id))
      .reduce((sum, entry) => sum + (status.bound[entry.title]?.length ?? 0), 0);
    line += ` · ${String(count)} tools mounted`;
  }
  return (
    <>
      <StatusLine>{line}</StatusLine>
      <ProviderConnections
        row={row}
        connections={connections}
        reads={reads}
        grants={grants}
        actions={actions}
      />
    </>
  );
}

/** A server's live state, with up to five of its mounted tool names. */
function ServerStatus({ row }: { row: ServerRow }): ReactNode {
  const names = useToolDisplayNames();
  const { live } = row;
  switch (live.kind) {
    case 'bound': {
      const listed = live.tools.slice(0, 5).map((tool) => toolDisplayLabel(names, tool));
      const more = live.tools.length - listed.length;
      return (
        <>
          <StatusLine>{`Connected · ${String(live.tools.length)} tools mounted`}</StatusLine>
          {listed.length > 0 ? (
            <p className="tai-status" style={{ margin: 0, overflowWrap: 'anywhere' }}>
              {listed.join(', ')}
              {more > 0 ? ` +${String(more)} more` : ''}
            </p>
          ) : null}
        </>
      );
    }
    case 'failed':
      return <StatusLine tone="err">{`Failed: ${live.failure.category}`}</StatusLine>;
    case 'not_loaded':
      return (
        <>
          <StatusLine tone="warn">Configured · not loaded</StatusLine>
          <p className="tai-status" style={{ margin: 0 }}>
            {
              "The worker that answered has not loaded this server's tools: it was deregistered there, or that worker has not loaded a recent change yet."
            }
          </p>
        </>
      );
    case 'unknown':
      return <StatusLine>Configured · status not available</StatusLine>;
  }
}

/** The status pieces of an entry: its status line, its connections or tool names. */
export function EntryStatus({ row, reads, grants, actions }: EntryProps): ReactNode {
  switch (row.kind) {
    case 'provider':
      return <ProviderStatus row={row} reads={reads} grants={grants} actions={actions} />;
    case 'listing':
      return <StatusLine>Available in the marketplace</StatusLine>;
    case 'server':
      return <ServerStatus row={row} />;
  }
}
