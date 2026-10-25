/**
 * The Connectors screen: one searchable directory of the outside apps (connector
 * providers), the MCP servers the manifest configures, and the marketplace listings
 * not installed yet, then the "Your connections" list, plus the routed connection
 * detail. Selecting a connection sets the `connection` search param (the shell owns
 * the route); the detail view renders when that param is present.
 *
 * Each directory read is gated on its own route: a read the session cannot reach is
 * a muted status line and the cards the other reads can draw still show; a failed
 * read is an `ErrorState` with a Retry for that read alone.
 *
 * When a popup-blocked sign-in redirected the whole tab, the provider round-trips back
 * here with its result on the URL; {@link ConnectorsPage} completes that exchange on
 * arrival and reopens the connect flow at Pick tools for the returned connection.
 */
import type { FleetReportSummary, ProviderView } from '@tai42/api-client';
import { isFleetReportFailure } from '@tai42/api-client';
import type { PageProps } from '@tai42/studio-sdk';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  errorMessage,
  ErrorState,
  FleetReport,
  PageHeader,
  Stack,
  useDebouncedValue,
} from '@tai42/studio-sdk';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { AddServerDialog } from './add-server-dialog';
import { ClientCredentialsDialog } from './client-credentials-dialog';
import { ConnectFlowDialog, type FlowTarget } from './connect-flow-dialog';
import { ConnectionDetail } from './connection-detail';
import {
  DirectoryExplorer,
  readCoverage,
  ReadFailures,
  StatusLines,
  YourConnections,
} from './directory-panels';
import { type DirectoryActions, useDirectoryGrants } from './entry-status';
import { connectionKey } from './keys';
import { Notice } from './notice';
import { useOAuthRedirectResume } from './oauth';
import { RemoveProviderDialog } from './provider-controls';
import { directoryRows, useDirectoryReads } from './use-directory';
import { useMcpServerActions } from './use-mcp-server-actions';

const SEARCH_DEBOUNCE_MS = 300;

/** A page-level confirmation after a provider-door change. */
interface PageNotice {
  readonly title: string;
  readonly message: string;
}

type ServerActions = ReturnType<typeof useMcpServerActions>;

/** The confirmation that detaches a server and its tools from the live registry. */
function DeregisterDialog({
  title,
  serverActions,
  onClose,
}: {
  readonly title: string;
  readonly serverActions: ServerActions;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <ConfirmDialog
      title="Deregister MCP server"
      confirmLabel="Deregister"
      pendingLabel={`Deregistering ${title}`}
      onConfirm={() => {
        serverActions.deregister.mutate(title);
      }}
      onClose={onClose}
      isPending={serverActions.deregister.isPending}
      error={serverActions.deregister.error}
      confirmVariant="danger"
    >
      <p style={{ margin: 0 }}>
        Detach <strong style={{ fontFamily: 'var(--tai-font-mono)' }}>{title}</strong> and its tools
        from the live registry? This leaves the manifest entry in place — reload it once the server
        is healthy to re-attach.
      </p>
      {serverActions.deregisterReport !== null ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <FleetReport summary={serverActions.deregisterReport} action="deregister" />
        </div>
      ) : null}
    </ConfirmDialog>
  );
}

/** The outcome of a reload started from an entry: its error, or its fleet report. */
function ReloadOutcome({ serverActions }: { readonly serverActions: ServerActions }): ReactNode {
  return (
    <>
      {serverActions.reload.isError ? (
        <ErrorState message={errorMessage(serverActions.reload.error)} />
      ) : null}
      {serverActions.reloadReport !== null ? (
        <FleetReport summary={serverActions.reloadReport} action="reload" />
      ) : null}
    </>
  );
}

function ConnectorsList({
  flow,
  setFlow,
}: {
  flow: FlowTarget | null;
  setFlow: (target: FlowTarget | null) => void;
}): ReactNode {
  const [query, setQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<readonly string[]>([]);
  const debouncedQuery = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const reads = useDirectoryReads(debouncedQuery);
  const grants = useDirectoryGrants();
  const serverActions = useMcpServerActions();

  const [adding, setAdding] = useState(false);
  const [credentialsFor, setCredentialsFor] = useState<ProviderView | null>(null);
  const [removing, setRemoving] = useState<ProviderView | null>(null);
  const [deregistering, setDeregistering] = useState<string | null>(null);
  const [notice, setNotice] = useState<PageNotice | null>(null);

  const { allRefused, noCards } = readCoverage(reads);
  if (allRefused) {
    return (
      <EmptyState
        title="Connectors are not available"
        description="This screen lists the outside apps and MCP servers this deployment can connect and mount, and the connections made to them. It needs read access to GET /api/connectors/providers, GET /api/connectors/connections, GET /api/manifest/preserved or GET /api/mcp-status; ask an administrator to grant it."
      />
    );
  }

  const actions: DirectoryActions = {
    openFlow: setFlow,
    onCredentials: (provider) => {
      setFlow(null);
      setCredentialsFor(provider);
    },
    onRemove: setRemoving,
    onReload: (title) => {
      serverActions.reload.mutate(title);
    },
    onDeregister: (title) => {
      serverActions.deregister.reset();
      setDeregistering(title);
    },
  };
  const openAdd = (): void => {
    setAdding(true);
  };

  return (
    <Stack gap={6}>
      <PageHeader
        eyebrow="Connections"
        title="Connectors"
        {...(grants.isAdmin
          ? { actions: <Button onClick={openAdd}>Add a custom server</Button> }
          : {})}
      />
      {notice !== null ? (
        <Notice
          notice={{ kind: 'success', message: notice.message }}
          title={notice.title}
          onDismiss={() => {
            setNotice(null);
          }}
        />
      ) : null}
      <StatusLines reads={reads} grants={grants} noCards={noCards} />
      <ReadFailures reads={reads} />
      <ReloadOutcome serverActions={serverActions} />
      {noCards ? null : (
        <DirectoryExplorer
          rows={directoryRows(reads)}
          reads={reads}
          grants={grants}
          actions={actions}
          query={query}
          onQueryChange={setQuery}
          selectedTags={selectedTags}
          onTagsChange={setSelectedTags}
          onAdd={openAdd}
        />
      )}
      <YourConnections
        state={reads.connections}
        noProviders={reads.providers.status === 'ready' && reads.providers.data.length === 0}
      />
      {flow !== null ? (
        <ConnectFlowDialog
          target={flow}
          reads={reads}
          onClose={() => {
            setFlow(null);
          }}
          onSetClientCredentials={actions.onCredentials}
        />
      ) : null}

      {adding ? (
        <AddServerDialog
          onClose={() => {
            setAdding(false);
          }}
          onAdded={(provider, automatic) => {
            setAdding(false);
            if (automatic) {
              setFlow({ kind: 'provider', provider });
              return;
            }
            setNotice({
              title: 'Server added',
              message: 'Set its client credentials before anyone can connect.',
            });
          }}
        />
      ) : null}
      {credentialsFor !== null ? (
        <ClientCredentialsDialog
          provider={credentialsFor}
          onClose={() => {
            setCredentialsFor(null);
          }}
          onSaved={() => {
            setNotice({ title: 'Saved', message: 'Client credentials saved.' });
          }}
        />
      ) : null}
      {removing !== null ? (
        <RemoveProviderDialog
          provider={removing}
          onClose={() => {
            setRemoving(null);
          }}
        />
      ) : null}
      {deregistering !== null ? (
        <DeregisterDialog
          title={deregistering}
          serverActions={serverActions}
          onClose={() => {
            setDeregistering(null);
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
  const [flow, setFlow] = useState<FlowTarget | null>(null);
  // A redirect resume returning to a connection's detail (a reconnect or a
  // sub-service change) refreshes that record and shows a failed fleet report there;
  // one returning to the directory reopens the flow at Pick tools.
  const [resumeFleet, setResumeFleet] = useState<FleetReportSummary | null>(null);
  const resume = useOAuthRedirectResume({
    onSuccess: (fleet, connectionId) => {
      if (detailId !== null) {
        void queryClient.invalidateQueries({ queryKey: connectionKey(detailId) });
        setResumeFleet(isFleetReportFailure(fleet) ? fleet : null);
        return;
      }
      setFlow({ kind: 'resumed', connectionId, fleet });
    },
  });

  return (
    <Stack gap={4}>
      {resume.notice !== null ? (
        <Notice notice={resume.notice} onDismiss={resume.clearNotice} />
      ) : null}
      {resumeFleet !== null ? <FleetReport summary={resumeFleet} /> : null}
      {detailId !== null ? (
        <ConnectionDetail connectionId={detailId} />
      ) : (
        <ConnectorsList flow={flow} setFlow={setFlow} />
      )}
    </Stack>
  );
}
