/**
 * The connect flow's step bodies: a server's Connect step (its live state with a
 * reload to fix it), the Pick tools step with its waits, and the Done step.
 */
import { apiRoutes, type FleetReportSummary, isFleetReportFailure } from '@tai42/api-client';
import {
  Button,
  errorMessage,
  ErrorState,
  FleetReport,
  preservedManifestKey,
  Spinner,
  useAppNavigate,
  useCanWrite,
} from '@tai42/studio-sdk';
import { useIsFetching } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef } from 'react';

import { PickToolsStep, type SavedPick } from './pick-tools-step';
import { type DirectoryReads, liveStateOf, type ServerEntry } from './use-directory';
import { useMcpServerActions } from './use-mcp-server-actions';

const LIST_TOOLS_ROUTE = 'POST /api/mcp-status/{title}/advertised-tools';
const PICK_ROUTE = 'PUT /api/mcp-config/entries/{title}/tool-filter';

/** The muted Done line for a session without the pick routes. */
function noPickLine(
  canListTools: boolean,
  canPick: boolean,
  entries: readonly ServerEntry[] | null,
): string {
  const missing = [canListTools ? null : LIST_TOOLS_ROUTE, canPick ? null : PICK_ROUTE]
    .filter((route): route is string => route !== null)
    .join(' and ');
  if (entries === null) {
    return `Choosing which of this server's tools are mounted needs write access to ${missing}; ask an administrator to grant it.`;
  }
  const unfiltered = entries.every(
    (entry) => entry.include.length === 0 && entry.exclude.length === 0,
  );
  return unfiltered
    ? `Every tool this server offers is mounted. Choosing which ones mount needs write access to ${missing}; ask an administrator to grant it.`
    : `A chosen subset of this server's tools is mounted. Changing it needs write access to ${missing}; ask an administrator to grant it.`;
}

export function ServerConnectStep({
  title,
  reads,
  onBound,
}: {
  title: string;
  reads: DirectoryReads;
  onBound: () => void;
}): ReactNode {
  const actions = useMcpServerActions();
  const status = reads.status.status === 'ready' ? reads.status.data : null;
  const live = liveStateOf(title, status);
  const canReload = useCanWrite(apiRoutes.post_api_mcp_status_title_reload.path);
  const reloading = useRef(false);
  useEffect(() => {
    if (reloading.current && live.kind === 'bound') {
      reloading.current = false;
      onBound();
    }
  }, [live.kind, onBound]);
  const reload = (): void => {
    reloading.current = true;
    actions.reload.mutate(title);
  };
  const reloadButton = (label: string): ReactNode =>
    canReload ? (
      <Button variant="primary" onClick={reload} disabled={actions.reload.isPending}>
        {actions.reload.isPending ? <Spinner label="Reloading" /> : null}
        {label}
      </Button>
    ) : (
      <p role="status" className="tai-status">
        {`This session cannot reload ${title}. Reloading needs write access to POST /api/mcp-status/{title}/reload; ask an administrator to grant it.`}
      </p>
    );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      {live.kind === 'bound' ? <p className="tai-status tai-status-ok">Connected</p> : null}
      {live.kind === 'failed' ? (
        <>
          <p className="tai-status tai-status-err">{`Failed: ${live.failure.category}`}</p>
          <p style={{ margin: 0, overflowWrap: 'anywhere' }}>{live.failure.message}</p>
          {reloadButton('Try again')}
        </>
      ) : null}
      {live.kind === 'not_loaded' ? (
        <>
          <p className="tai-status tai-status-warn">
            {`${title} is configured, but the worker that answered has not loaded it.`}
          </p>
          {reloadButton('Load now')}
        </>
      ) : null}
      {live.kind === 'unknown' ? <Spinner label="Reading the server status" /> : null}
      {actions.reload.isError ? <ErrorState message={errorMessage(actions.reload.error)} /> : null}
      {actions.reloadReport !== null && isFleetReportFailure(actions.reloadReport) ? (
        <FleetReport summary={actions.reloadReport} action="reload" />
      ) : null}
      {live.kind === 'bound' ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={onBound}>
            Continue
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The Pick tools step: a wait while a new connection's entries arrive with the
 * manifest re-read after the connect, a line when the connection enabled no server,
 * else the pick of the titles.
 */
export function PickStepBody({
  name,
  titles,
  connectionId,
  reads,
  justAdded,
  addFleet,
  onDirtyChange,
  onLeave,
  onDone,
}: {
  readonly name: string;
  readonly titles: readonly string[];
  readonly connectionId: string | null;
  readonly reads: DirectoryReads;
  readonly justAdded: boolean;
  readonly addFleet: FleetReportSummary | null;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onLeave: () => void;
  readonly onDone: (saved: readonly SavedPick[]) => void;
}): ReactNode {
  const manifestFetching = useIsFetching({ queryKey: preservedManifestKey }) > 0;
  if (connectionId !== null && titles.length === 0) {
    if (reads.manifest.status === 'loading' || manifestFetching) {
      return <Spinner label={`Waiting for the workers to load ${name}…`} />;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <p className="tai-status">No server enabled</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            onClick={() => {
              onDone([]);
            }}
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }
  return (
    <PickToolsStep
      titles={titles}
      justAdded={justAdded}
      addFleet={addFleet}
      onDirtyChange={onDirtyChange}
      onLeave={onLeave}
      onDone={onDone}
    />
  );
}

/** The Done step: the mounted tool counts, the fleet reports of the saved picks, and the way out. */
export function DoneStep({
  name,
  titles,
  reads,
  saved,
  connectionId,
  onClose,
}: {
  readonly name: string;
  readonly titles: readonly string[];
  readonly reads: DirectoryReads;
  readonly saved: readonly SavedPick[];
  readonly connectionId: string | null;
  readonly onClose: () => void;
}): ReactNode {
  const navigate = useAppNavigate();
  const canListTools = useCanWrite(apiRoutes.post_api_mcp_status_title_advertised_tools.path);
  const canPick = useCanWrite(apiRoutes.put_api_mcp_config_entries_title_tool_filter.path, 'PUT');
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const status = reads.status.status === 'ready' ? reads.status.data : null;
  const entries = reads.manifest.status === 'ready' ? reads.manifest.data : null;
  const titleEntries = entries?.filter((entry) => titles.includes(entry.title)) ?? null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      <h3 ref={heading} tabIndex={-1} style={{ margin: 0 }}>{`${name} is connected.`}</h3>
      {status !== null
        ? titles.map((title) => {
            const tools = status.bound[title];
            return tools === undefined ? null : (
              <p key={title} className="tai-status" style={{ margin: 0 }}>
                {titles.length === 1
                  ? `${String(tools.length)} tools mounted`
                  : `${title}: ${String(tools.length)} tools mounted`}
              </p>
            );
          })
        : null}
      {saved.map((pick) =>
        pick.summary === null ? null : (
          <div key={pick.title}>
            {saved.length > 1 ? <p style={{ margin: 0 }}>{pick.title}</p> : null}
            <FleetReport summary={pick.summary} />
          </div>
        ),
      )}
      {canListTools && canPick ? null : (
        <p role="status" className="tai-status">
          {noPickLine(canListTools, canPick, titleEntries)}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
        {connectionId !== null ? (
          <Button
            onClick={() => {
              onClose();
              navigate('connectors', { connection: connectionId });
            }}
          >
            Manage connection
          </Button>
        ) : null}
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
