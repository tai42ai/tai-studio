/**
 * The pieces of the Connectors directory around its entries: the muted lines naming
 * each read the session cannot reach, the failed reads with their Retry, the loading
 * cards, the directory itself with its search, tags and paging, and the "Your
 * connections" list.
 */
import type { ConnectionView } from '@tai42/api-client';
import {
  AppLink,
  Badge,
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  ExplorerView,
  Skeleton,
} from '@tai42/studio-sdk';
import type { ReactNode, RefObject } from 'react';
import { useEffect, useId, useRef } from 'react';

import { HEALTH_LABEL } from './connection-detail-cards';
import type { DirectoryActions, DirectoryGrants } from './entry-status';
import { NeedsMorePermissions } from './provider-controls';
import { ServerCard, ServerRowCells } from './server-card';
import {
  type DirectoryReads,
  type DirectoryRow,
  type ReadState,
  rowMatches,
} from './use-directory';

const SEARCH_LABEL = 'Search servers and apps';
const INSTALLED_TAG = 'Installed';
const MARKETPLACE_TAG = 'In marketplace';

const COLUMNS = [
  { key: 'name', header: 'Name' },
  { key: 'status', header: 'Status' },
  { key: 'source', header: 'Source' },
  { key: 'action', header: 'Action' },
] as const;

const CANNOT_CONNECT =
  'This session cannot connect apps. Connecting needs write access to POST /api/connectors/connections/start; ask an administrator to grant it.';

export const refused = (state: { readonly status: string }): boolean => state.status === 'refused';

/** Which of the directory's reads the session reaches. */
export function readCoverage(reads: DirectoryReads): {
  /** Every read the screen draws from is refused. */
  readonly allRefused: boolean;
  /** No read that draws directory entries is reached. */
  readonly noCards: boolean;
} {
  const cardReadsRefused =
    refused(reads.providers) && refused(reads.manifest) && refused(reads.status);
  return { allRefused: cardReadsRefused && refused(reads.connections), noCards: cardReadsRefused };
}

/** The muted lines naming each read the session cannot reach, in screen order. */
function statusLines(reads: DirectoryReads, grants: DirectoryGrants, noCards: boolean): string[] {
  const lines: string[] = [];
  if (refused(reads.providers)) {
    lines.push(
      'This session cannot list connector providers. Seeing them needs read access to GET /api/connectors/providers; ask an administrator to grant it.',
    );
  }
  if (refused(reads.manifest)) {
    lines.push(
      refused(reads.status)
        ? 'This session cannot read the MCP configuration. Seeing the configured servers needs read access to GET /api/manifest/preserved; ask an administrator to grant it.'
        : 'This session cannot read the MCP configuration, so servers are shown from their live status only. Seeing every configured server needs read access to GET /api/manifest/preserved; ask an administrator to grant it.',
    );
  }
  if (refused(reads.status)) {
    lines.push(
      'This session cannot read the live MCP status. Seeing which servers are mounted and which failed needs read access to GET /api/mcp-status; ask an administrator to grant it.',
    );
  }
  if (noCards) {
    lines.push(
      'Marketplace listings are not shown, because connecting one needs read access to GET /api/connectors/providers or GET /api/mcp-status; ask an administrator to grant it.',
    );
  } else if (refused(reads.marketplace.state)) {
    lines.push(
      'This session cannot list marketplace listings. Seeing them needs read access to GET /api/marketplace/search; ask an administrator to grant it.',
    );
  } else if (refused(reads.installed)) {
    lines.push(
      'This session cannot read the installed marketplace plugins, so marketplace listings are not shown. Showing them needs read access to GET /api/marketplace/installed; ask an administrator to grant it.',
    );
  }
  if (reads.providers.status === 'ready' && !grants.canConnect) lines.push(CANNOT_CONNECT);
  return lines;
}

/** The muted status lines of the directory. */
export function StatusLines({
  reads,
  grants,
  noCards,
}: {
  reads: DirectoryReads;
  grants: DirectoryGrants;
  noCards: boolean;
}): ReactNode {
  const lines = statusLines(reads, grants, noCards);
  if (lines.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}>
      {lines.map((line) => (
        <p key={line} role="status" className="tai-status" style={{ margin: 0 }}>
          {line}
        </p>
      ))}
    </div>
  );
}

/** The failed directory reads, each with the fixed lead of its message and its own Retry. */
export function ReadFailures({ reads }: { reads: DirectoryReads }): ReactNode {
  const failures: [string, ReadState<unknown>][] = [
    ['Could not load connector providers', reads.providers],
    ['Could not load the MCP configuration', reads.manifest],
    ['Could not load the MCP server status', reads.status],
    ['Could not load the installed marketplace plugins', reads.installed],
    ['Could not load marketplace listings', reads.marketplace.state],
  ];
  return (
    <>
      {failures.map(([lead, state]) =>
        state.status === 'failed' ? (
          <ErrorState
            key={lead}
            message={`${lead}: ${errorMessage(state.error)}`}
            onRetry={state.retry}
          />
        ) : null,
      )}
    </>
  );
}

function LoadingCards(): ReactNode {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 'var(--tai-space-3)',
      }}
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} height={140} />
      ))}
    </div>
  );
}

const HEALTH_VARIANT: Record<ConnectionView['auth_health_state'], string> = {
  healthy: 'success',
  reconnect_required: 'warning',
  refresh_failing: 'danger',
};

export function YourConnections({
  state,
  noProviders,
}: {
  state: ReadState<readonly ConnectionView[]>;
  noProviders: boolean;
}): ReactNode {
  const headingId = useId();
  let body: ReactNode;
  switch (state.status) {
    case 'loading':
      body = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      );
      break;
    case 'refused':
      body = (
        <EmptyState
          title="Your connections are not available"
          description="This list shows the connections made to outside apps. Reading it needs access to GET /api/connectors/connections; ask an administrator to grant it."
        />
      );
      break;
    case 'failed':
      body = (
        <ErrorState
          message={`Could not load your connections: ${errorMessage(state.error)}`}
          onRetry={state.retry}
        />
      );
      break;
    case 'ready':
      body =
        state.data.length === 0 ? (
          <EmptyState
            title="No connections yet"
            description={
              noProviders
                ? 'Install a connector plugin from the marketplace, then connect it here.'
                : 'Connect an app above to get started.'
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
            {state.data.map((connection) => (
              <Card key={connection.connection_id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
                  <AppLink to="connectors" search={{ connection: connection.connection_id }}>
                    {connection.alias}
                  </AppLink>
                  <Badge variant={HEALTH_VARIANT[connection.auth_health_state]}>
                    {connection.auth_health_state === 'healthy'
                      ? 'Healthy'
                      : HEALTH_LABEL[connection.auth_health_state]}
                  </Badge>
                </div>
                <p
                  style={{ margin: 'var(--tai-space-1) 0 0', color: 'var(--tai-color-text-muted)' }}
                >
                  {connection.provider_id}
                  {connection.account_identity !== null ? ` · ${connection.account_identity}` : ''}
                </p>
                <NeedsMorePermissions connection={connection} />
              </Card>
            ))}
          </div>
        );
      break;
  }
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="tai-section-title" style={{ margin: '0 0 var(--tai-space-3)' }}>
        Your connections
      </h2>
      {body}
    </section>
  );
}

/**
 * The marketplace paging control: one click fetches the next page of every query that
 * has one. When the load ends with no page left, focus moves to the last button of the
 * last entry the load added, or to the search field when it added none on screen.
 */
function LoadMore({
  reads,
  directory,
}: {
  reads: DirectoryReads;
  directory: RefObject<HTMLDivElement | null>;
}): ReactNode {
  const { marketplace } = reads;
  const before = useRef<ReadonlySet<string> | null>(null);
  const shownKeys = (): string[] =>
    Array.from(
      directory.current?.querySelectorAll<HTMLElement>('[data-directory-row]') ?? [],
      (node) => node.dataset.directoryRow ?? '',
    );
  useEffect(() => {
    if (before.current === null || marketplace.fetchingNext || marketplace.hasNextPage) return;
    const previous = before.current;
    before.current = null;
    const nodes = Array.from(
      directory.current?.querySelectorAll<HTMLElement>('[data-directory-row]') ?? [],
    ).filter((node) => !previous.has(node.dataset.directoryRow ?? ''));
    const last = nodes.at(-1)?.closest('[role="listitem"], tr');
    const buttons = last?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    const target =
      buttons.length > 0
        ? buttons[buttons.length - 1]
        : directory.current?.querySelector<HTMLInputElement>(`input[aria-label="${SEARCH_LABEL}"]`);
    target?.focus();
  }, [marketplace.fetchingNext, marketplace.hasNextPage, directory]);

  const load = (): void => {
    before.current = new Set(shownKeys());
    marketplace.fetchNext();
  };
  if (marketplace.nextPageError !== null) {
    return (
      <div role="alert" className="tai-stack tai-stack-2" style={{ alignItems: 'center' }}>
        <span className="tai-status tai-status-err">
          Could not load more: {marketplace.nextPageError}
        </span>
        <Button onClick={load} disabled={marketplace.fetchingNext}>
          {marketplace.fetchingNext ? 'Loading…' : 'Retry load more'}
        </Button>
      </div>
    );
  }
  if (!marketplace.hasNextPage) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <Button onClick={load} disabled={marketplace.fetchingNext}>
        {marketplace.fetchingNext ? 'Loading…' : 'Load more'}
      </Button>
    </div>
  );
}

function emptyStates(
  reads: DirectoryReads,
  grants: DirectoryGrants,
  query: string,
  onAdd: () => void,
): {
  empty: { title: string; description?: string; action?: ReactNode };
  noMatch: { title: string };
} {
  const anyRefused =
    refused(reads.providers) ||
    refused(reads.connections) ||
    refused(reads.manifest) ||
    refused(reads.status) ||
    refused(reads.installed) ||
    refused(reads.marketplace.state);
  const browsable = !refused(reads.marketplace.state);
  const emptyAction =
    grants.isAdmin || browsable ? (
      <div style={{ display: 'flex', gap: 'var(--tai-space-2)', flexWrap: 'wrap' }}>
        {browsable ? (
          <AppLink to="marketplace" className="tai-btn tai-btn-secondary">
            Browse the marketplace
          </AppLink>
        ) : null}
        {grants.isAdmin ? <Button onClick={onAdd}>Add a custom server</Button> : null}
      </div>
    ) : undefined;
  const empty = anyRefused
    ? { title: 'No servers or apps in what this session can read.' }
    : {
        title: 'No servers or apps yet',
        description: 'Install one from the marketplace or add a custom server.',
        ...(emptyAction === undefined ? {} : { action: emptyAction }),
      };
  return { empty, noMatch: { title: `Nothing matches "${query.trim()}".` } };
}

/** The directory of entries with its search, its Installed / In marketplace tags and its paging. */
export function DirectoryExplorer({
  rows,
  reads,
  grants,
  actions,
  query,
  onQueryChange,
  selectedTags,
  onTagsChange,
  onAdd,
}: {
  readonly rows: readonly DirectoryRow[];
  readonly reads: DirectoryReads;
  readonly grants: DirectoryGrants;
  readonly actions: DirectoryActions;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly selectedTags: readonly string[];
  readonly onTagsChange: (tags: readonly string[]) => void;
  readonly onAdd: () => void;
}): ReactNode {
  const directory = useRef<HTMLDivElement>(null);
  const props = { reads, grants, actions };
  const marketplaceShown = selectedTags.length === 0 || selectedTags.includes(MARKETPLACE_TAG);
  const cardReadsLoading = [reads.providers, reads.manifest, reads.status].some(
    (state) => state.status === 'loading',
  );
  const { empty, noMatch } = emptyStates(reads, grants, query, onAdd);
  return (
    <div ref={directory} className="tai-stack">
      {rows.length === 0 && cardReadsLoading ? (
        <LoadingCards />
      ) : (
        <ExplorerView<DirectoryRow>
          items={rows}
          getItemKey={(row) => row.key}
          getFolderId={() => null}
          folders={[]}
          currentFolderId={null}
          onNavigate={() => undefined}
          rootLabel="All servers and apps"
          viewSurface="connectors"
          label="Servers and apps"
          columns={COLUMNS}
          renderRow={(row) => <ServerRowCells row={row} {...props} />}
          renderCard={(row) => <ServerCard row={row} {...props} />}
          search={{
            value: query,
            onChange: onQueryChange,
            matches: rowMatches,
            label: SEARCH_LABEL,
            placeholder: 'Search by name or description',
          }}
          tags={{
            getTags: (row) => [row.kind === 'listing' ? MARKETPLACE_TAG : INSTALLED_TAG],
            selected: selectedTags,
            onChange: onTagsChange,
            untaggedLabel: 'Untagged',
            filterLabel: 'Show',
          }}
          emptyStates={{ empty, emptyFolder: empty, noMatch }}
        />
      )}
      {marketplaceShown && rows.some((row) => row.kind === 'listing') ? (
        <LoadMore reads={reads} directory={directory} />
      ) : null}
    </div>
  );
}
