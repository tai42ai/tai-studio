/**
 * A Connectors directory entry, drawn as a card (the grid view) or as table cells
 * (the list view) from the same pieces: its mark, name, badge, status line, its
 * connections (a provider), its own button, and its overflow menu. Every control is
 * drawn only for a session whose projection reaches the control's route; a control a
 * card cannot do without is replaced by a muted line naming the missing grant.
 */
import type { ConnectionView } from '@tai42/api-client';
import {
  ActionMenu,
  type ActionMenuItem,
  Badge,
  Button,
  Card,
  INSTALL_NO_GRANT,
  TD,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import {
  type DirectoryActions,
  type DirectoryGrants,
  type EntryProps,
  EntryStatus,
  NoGrantLine,
  reloadNoGrant,
} from './entry-status';
import { ClientSourceLine, hasStoredClient, ProviderMark } from './provider-controls';
import { type DirectoryRow, rowDescription, rowName, type ServerRow } from './use-directory';

/** The entry's own button. */
function EntryAction({ row, grants, actions }: Omit<EntryProps, 'reads'>): ReactNode {
  if (row.kind === 'provider') {
    if (!grants.canConnect || row.connections === null) return null;
    const open = (): void => {
      actions.openFlow({ kind: 'provider', provider: row.provider });
    };
    if (row.connections === 'unknown') return <Button onClick={open}>Connect</Button>;
    if (row.connections.length === 0) {
      return (
        <Button variant="primary" onClick={open}>
          Connect
        </Button>
      );
    }
    return <Button onClick={open}>Add another account</Button>;
  }
  if (row.kind === 'listing') {
    if (!grants.canInstall) return <NoGrantLine>{INSTALL_NO_GRANT}</NoGrantLine>;
    const { listing } = row;
    return (
      <Button
        variant="primary"
        onClick={() => {
          actions.openFlow({ kind: 'listing', listing });
        }}
      >
        Connect
      </Button>
    );
  }
  return <ServerAction row={row} grants={grants} actions={actions} />;
}

function ServerAction({
  row,
  grants,
  actions,
}: {
  row: ServerRow;
  grants: DirectoryGrants;
  actions: DirectoryActions;
}): ReactNode {
  const { live } = row;
  const needsFix = live.kind === 'failed' || live.kind === 'not_loaded';
  const fix = !needsFix ? null : grants.canReload ? (
    <Button
      variant="primary"
      onClick={() => {
        actions.openFlow({ kind: 'server', title: row.title });
      }}
    >
      Fix
    </Button>
  ) : (
    <NoGrantLine>{reloadNoGrant(row.title)}</NoGrantLine>
  );
  const pick =
    live.kind !== 'failed' && grants.canPickTools && row.entry !== null ? (
      <Button
        onClick={() => {
          actions.openFlow({
            kind: 'pick',
            name: row.title,
            titles: [row.title],
            connectionId: null,
          });
        }}
      >
        Pick tools
      </Button>
    ) : null;
  if (fix === null && pick === null) return null;
  return (
    <>
      {fix}
      {pick}
    </>
  );
}

/** The entry's overflow menu, each action gated on its own route. */
function EntryMenu({ row, grants, actions }: Omit<EntryProps, 'reads'>): ReactNode {
  const items: ActionMenuItem[] = [];
  if (row.kind === 'provider' && grants.isAdmin) {
    const { provider } = row;
    if (hasStoredClient(provider)) {
      items.push({
        id: 'credentials',
        label: 'Client credentials',
        onSelect: () => {
          actions.onCredentials(provider);
        },
      });
    }
    if (provider.removable) {
      items.push({
        id: 'remove',
        label: 'Remove',
        danger: true,
        onSelect: () => {
          actions.onRemove(provider);
        },
      });
    }
  }
  if (row.kind === 'server') {
    if ((row.live.kind === 'failed' || row.live.kind === 'not_loaded') && grants.canReload) {
      items.push({
        id: 'reload',
        label: 'Reload',
        onSelect: () => {
          actions.onReload(row.title);
        },
      });
    }
    if (row.live.kind === 'failed' && grants.canDeregister) {
      items.push({
        id: 'deregister',
        label: 'Deregister',
        danger: true,
        onSelect: () => {
          actions.onDeregister(row.title);
        },
      });
    }
  }
  return <ActionMenu label={`Actions for ${rowName(row)}`} items={items} />;
}

function EntryMark({ row }: { row: DirectoryRow }): ReactNode {
  if (row.kind === 'provider') return <ProviderMark provider={row.provider} />;
  if (row.kind === 'listing' && row.listing.icon_url !== null) {
    return (
      <img
        src={row.listing.icon_url}
        alt=""
        width={28}
        height={28}
        style={{ borderRadius: 'var(--tai-radius-sm)', flexShrink: 0 }}
      />
    );
  }
  return null;
}

function EntryBadge({ row }: { row: DirectoryRow }): ReactNode {
  return <Badge>{row.kind === 'listing' ? 'In marketplace' : 'Installed'}</Badge>;
}

function NeedsAttention({ row }: { row: DirectoryRow }): ReactNode {
  if (row.kind !== 'provider' || !Array.isArray(row.connections)) return null;
  const connections: readonly ConnectionView[] = row.connections;
  return connections.some((c) => c.auth_health_state !== 'healthy') ? (
    <Badge variant="warning">Needs attention</Badge>
  ) : null;
}

/** Where an entry comes from, for the Source column and the card's last line. */
export function entrySource(row: DirectoryRow): string {
  if (row.kind === 'provider') return 'Connector';
  if (row.kind === 'listing') return 'Marketplace';
  if (row.fromMarketplace === true) return 'From marketplace';
  if (row.entry?.connectionId !== null && row.entry?.connectionId !== undefined)
    return 'Connection';
  return 'Manifest';
}

export function ServerCard(props: EntryProps): ReactNode {
  const { row } = props;
  const description = rowDescription(row);
  return (
    <Card>
      <div
        data-directory-row={row.key}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
          <EntryMark row={row} />
          <strong style={{ overflowWrap: 'anywhere', flex: 1, minWidth: 0 }}>{rowName(row)}</strong>
          <EntryMenu row={row} grants={props.grants} actions={props.actions} />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--tai-space-2)' }}>
          <EntryBadge row={row} />
          <NeedsAttention row={row} />
        </div>
        {description !== '' ? (
          <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>{description}</p>
        ) : null}
        {row.kind === 'provider' ? <ClientSourceLine provider={row.provider} /> : null}
        {row.kind === 'server' && row.fromMarketplace === true ? (
          <p className="tai-status" style={{ margin: 0 }}>
            From marketplace
          </p>
        ) : null}
        <EntryStatus {...props} />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: 'var(--tai-space-2)',
          }}
        >
          <EntryAction row={row} grants={props.grants} actions={props.actions} />
        </div>
      </div>
    </Card>
  );
}

/** The list view's cells: Name, Status, Source, Action. */
export function ServerRowCells(props: EntryProps): ReactNode {
  const { row } = props;
  return (
    <>
      <TD>
        <div
          data-directory-row={row.key}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}
        >
          <EntryMark row={row} />
          <span style={{ overflowWrap: 'anywhere' }}>{rowName(row)}</span>
          <EntryBadge row={row} />
          <NeedsAttention row={row} />
        </div>
      </TD>
      <TD>
        <EntryStatus {...props} />
      </TD>
      <TD>{entrySource(row)}</TD>
      <TD>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
          <EntryAction row={row} grants={props.grants} actions={props.actions} />
          <EntryMenu row={row} grants={props.grants} actions={props.actions} />
        </div>
      </TD>
    </>
  );
}
