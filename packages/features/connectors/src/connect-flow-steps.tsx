/**
 * The connect flow's step bodies: a server's Connect step (its live state, with a
 * reload to fix it, or a re-read of the status to check a start still in progress), the
 * Pick tools step with its waits, and the Done step (what is mounted, and each server
 * still starting, failed or not loaded).
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

import { ReadFailure, STATUS_READ_FAILED, STATUS_REFUSED } from './directory-panels';
import { PickToolsStep, type SavedPick } from './pick-tools-step';
import { NotLoadedLine, ServerFailed, ServerStarting } from './server-live-state';
import {
  type DirectoryReads,
  liveStateOf,
  type ServerEntry,
  type ServerLiveState,
  useRecheckMcpStatus,
} from './use-directory';
import { useMcpServerActions } from './use-mcp-server-actions';

const LIST_TOOLS_ROUTE = 'POST /api/mcp-status/{title}/advertised-tools';
const PICK_ROUTE = 'PUT /api/mcp-config/entries/{title}/tool-filter';

/**
 * What the Done step can say about the flow's servers: every one bound (or the flow has
 * none); every one still starting; one still starting beside others bound, failed or not
 * loaded, so no verdict is final yet; some bound and another failed or not loaded; none
 * bound with a failure; none bound with a server not loaded; or the live status not read
 * (still reading, refused to this session, or failed).
 */
type DoneState =
  | 'connected'
  | 'starting'
  | 'partly_starting'
  | 'partly'
  | 'failed'
  | 'not_loaded'
  | 'reading'
  | 'refused'
  | 'unread';

/** The Done step's state from the live state of each of the flow's titles. */
function doneStateOf(reads: DirectoryReads, lives: readonly ServerLiveState[]): DoneState {
  if (lives.length === 0) return 'connected';
  if (reads.status.status === 'loading') return 'reading';
  if (reads.status.status === 'refused') return 'refused';
  if (reads.status.status === 'failed') return 'unread';
  const has = (kind: ServerLiveState['kind']): boolean => lives.some((live) => live.kind === kind);
  if (has('starting')) {
    return lives.every((live) => live.kind === 'starting') ? 'starting' : 'partly_starting';
  }
  if (has('failed') || has('not_loaded')) {
    if (has('bound')) return 'partly';
    return has('failed') ? 'failed' : 'not_loaded';
  }
  return 'connected';
}

const DONE_HEADING: Readonly<Record<DoneState, (name: string) => string>> = {
  connected: (name) => `${name} is connected.`,
  starting: (name) => `${name} is starting.`,
  partly_starting: (name) => `Part of ${name} is still starting.`,
  partly: (name) => `${name} is partly connected.`,
  failed: (name) => `${name} did not connect.`,
  not_loaded: (name) => `${name} is configured, but not loaded.`,
  reading: (name) => `Reading the status of ${name}…`,
  refused: (name) => `This session cannot read the status of ${name}.`,
  unread: (name) => `The status of ${name} could not be read.`,
};

/** The muted Done line for a session without the pick routes. It says which tools are
 *  mounted only when that is so: a server still starting mounts them once it has started,
 *  and otherwise it says only what choosing them needs. */
function noPickLine(
  canListTools: boolean,
  canPick: boolean,
  entries: readonly ServerEntry[] | null,
  state: DoneState,
): string {
  const missing = [canListTools ? null : LIST_TOOLS_ROUTE, canPick ? null : PICK_ROUTE]
    .filter((route): route is string => route !== null)
    .join(' and ');
  if (entries === null || (state !== 'connected' && state !== 'starting')) {
    return `Choosing which of this server's tools are mounted needs write access to ${missing}; ask an administrator to grant it.`;
  }
  const unfiltered = entries.every(
    (entry) => entry.include.length === 0 && entry.exclude.length === 0,
  );
  const mounts = state === 'starting' ? 'mounts once it has started' : 'is mounted';
  const mounted = unfiltered
    ? `Every tool this server offers ${mounts}.`
    : `A chosen subset of this server's tools ${mounts}.`;
  return unfiltered
    ? `${mounted} Choosing which ones mount needs write access to ${missing}; ask an administrator to grant it.`
    : `${mounted} Changing it needs write access to ${missing}; ask an administrator to grant it.`;
}

/**
 * The live status read while it gives no answer to draw: a spinner while it reads, the
 * line for a session it is refused to, and its failure with Retry; nothing once it is read.
 */
function StatusReadNotice({ status }: { readonly status: DirectoryReads['status'] }): ReactNode {
  switch (status.status) {
    case 'loading':
      return <Spinner label="Reading the server status" />;
    case 'refused':
      return (
        <p role="status" className="tai-status" style={{ margin: 0 }}>
          {STATUS_REFUSED}
        </p>
      );
    case 'failed':
      return <ReadFailure lead={STATUS_READ_FAILED} state={status} />;
    case 'ready':
      return null;
  }
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
  const recheckStatus = useRecheckMcpStatus();
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
      {live.kind === 'starting' ? (
        <ServerStarting message={live.start.message} onCheckAgain={recheckStatus} />
      ) : null}
      {live.kind === 'failed' ? (
        <>
          <ServerFailed failure={live.failure} />
          {reloadButton('Try again')}
        </>
      ) : null}
      {live.kind === 'not_loaded' ? (
        <>
          <NotLoadedLine title={title} />
          {reloadButton('Load now')}
        </>
      ) : null}
      <StatusReadNotice status={reads.status} />
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
 * else the pick of the titles against the live status.
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
      status={reads.status.status === 'ready' ? reads.status.data : null}
      justAdded={justAdded}
      addFleet={addFleet}
      onDirtyChange={onDirtyChange}
      onLeave={onLeave}
      onDone={onDone}
    />
  );
}

/**
 * The Done step: the mounted tool counts, each server whose start is still in progress with
 * Check again, each server that failed with the platform's message, each server not loaded,
 * the fleet reports of the saved picks, and the way out. The heading says connected only
 * when the live status read shows every server bound, and gives no final verdict while a
 * start is still running; a status read that failed says so with its Retry.
 */
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
  const recheckStatus = useRecheckMcpStatus();
  const status = reads.status.status === 'ready' ? reads.status.data : null;
  const entries = reads.manifest.status === 'ready' ? reads.manifest.data : null;
  const titleEntries = entries?.filter((entry) => titles.includes(entry.title)) ?? null;
  const lives = titles.map((title) => ({ title, live: liveStateOf(title, status) }));
  const state = doneStateOf(
    reads,
    lives.map(({ live }) => live),
  );
  const nameLine = (title: string): ReactNode =>
    titles.length > 1 ? <p style={{ margin: 0 }}>{title}</p> : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      <h3 ref={heading} tabIndex={-1} style={{ margin: 0 }}>
        {DONE_HEADING[state](name)}
      </h3>
      <StatusReadNotice status={reads.status} />
      {lives.map(({ title, live }) => {
        switch (live.kind) {
          case 'bound':
            return (
              <p key={title} className="tai-status" style={{ margin: 0 }}>
                {titles.length === 1
                  ? `${String(live.tools.length)} tools mounted`
                  : `${title}: ${String(live.tools.length)} tools mounted`}
              </p>
            );
          case 'failed':
            return (
              <div key={title}>
                {nameLine(title)}
                <ServerFailed failure={live.failure} />
              </div>
            );
          case 'starting':
            return (
              <div key={title}>
                {nameLine(title)}
                <ServerStarting message={live.start.message} onCheckAgain={recheckStatus} />
              </div>
            );
          case 'not_loaded':
            return <NotLoadedLine key={title} title={title} />;
          case 'unknown':
            return null;
        }
      })}
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
          {noPickLine(canListTools, canPick, titleEntries, state)}
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
