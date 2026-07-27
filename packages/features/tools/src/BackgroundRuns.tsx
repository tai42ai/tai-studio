/**
 * The BACKGROUND-RUNS panel for a selected tool.
 *
 * A background run survives a dropped connection: submit returns a `run_id`
 * immediately, and this panel POLLS `GET /api/tool-runs/{run_id}` (TanStack Query
 * `refetchInterval`, {@link POLL_INTERVAL_MS}, stopping the moment the status is
 * terminal). It also lists the tool's RECENT runs from
 * `GET /api/tool-runs?tool_name=...` — status chips only, no result — and, on
 * selecting one, reads its full record and renders the result through the SAME
 * `ResultViewer` the sync path uses (oversized handling included). A `lost` run
 * (the server restarted mid-run) renders its own explanation — the result is
 * unrecoverable.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery, type Query } from '@tanstack/react-query';
import {
  Badge,
  EmptyState,
  ErrorState,
  Skeleton,
  Spinner,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import { isTerminalRunStatus, type ToolRunListItem, type ToolRunRecord } from '@tai42/api-client';

import { ResultViewer } from './ResultViewer';
import {
  POLL_INTERVAL_MS,
  STATUS_LABEL,
  STATUS_VARIANT,
  toolRunKey,
  toolRunsListKey,
} from './backgroundRunsCommon';

const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

/** One status chip; the running state pairs the chip with a live spinner. */
function StatusChip({ status }: { readonly status: ToolRunRecord['status'] }): ReactNode {
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {status === 'running' ? <Spinner label="Running" /> : null}
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** The `lost` explanation — a distinct, honest state (not a generic error). */
function LostNotice(): ReactNode {
  return (
    // `.tai-warn-state` is the design system's published warn surface: the state
    // degraded rather than failed, so it takes that panel rather than a formula of
    // its own.
    <div role="alert" data-testid="tool-run-lost" className="tai-warn-state">
      <strong className="tai-status-warn">Run lost</strong>
      <p style={{ margin: 'var(--tai-space-2) 0 0' }}>
        The server restarted while this run was executing; the result is unrecoverable.
      </p>
    </div>
  );
}

/** Poll and render one run's live record (status + terminal result/error). */
function RunDetail({ runId }: { readonly runId: string }): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: toolRunKey(runId),
    queryFn: () => api.getToolRun(runId),
    // Stop polling the instant the run reaches a terminal state; keep polling
    // (every POLL_INTERVAL_MS) while it is still running or not yet loaded.
    refetchInterval: (q: Query<ToolRunRecord>) =>
      q.state.data !== undefined && isTerminalRunStatus(q.state.data.status)
        ? false
        : POLL_INTERVAL_MS,
  });

  if (query.isPending) {
    return <Skeleton height={80} />;
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const record = query.data;
  return (
    <section style={stackStyle} data-testid="tool-run-detail">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
        <StatusChip status={record.status} />
        <code style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}>
          {record.run_id}
        </code>
      </div>

      {record.status === 'running' ? (
        <div
          role="status"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}
        >
          <Spinner label="Polling" />
          <span>Running in the background — polling for the result.</span>
        </div>
      ) : null}

      {record.status === 'succeeded' ? <ResultViewer result={record.result} /> : null}
      {record.status === 'failed' ? (
        <ErrorState message={record.error ?? 'The tool run failed.'} />
      ) : null}
      {record.status === 'lost' ? <LostNotice /> : null}
    </section>
  );
}

export function BackgroundRuns({
  toolName,
  activeRunId,
}: {
  readonly toolName: string;
  /** The most recently submitted run — auto-selected so its poll shows at once. */
  readonly activeRunId?: string;
}): ReactNode {
  const api = useApi();
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>(activeRunId);

  // A fresh submit selects its run so the panel jumps to its live poll.
  useEffect(() => {
    if (activeRunId !== undefined) setSelectedRunId(activeRunId);
  }, [activeRunId]);

  const recent = useQuery({
    queryKey: toolRunsListKey(toolName),
    queryFn: () => api.listToolRuns(toolName),
    // A listed run that is still running has a stale chip (running → terminal);
    // refresh the list on the poll cadence while ANY entry is non-terminal, and
    // stop the instant every listed run has settled — mirroring RunDetail so the
    // list does not poll forever once nothing is active.
    refetchInterval: (q: Query<ToolRunListItem[]>) =>
      q.state.data?.some((run) => !isTerminalRunStatus(run.status)) ? POLL_INTERVAL_MS : false,
  });

  return (
    <section style={{ ...stackStyle, gap: 'var(--tai-space-4)' }} data-testid="background-runs">
      {selectedRunId !== undefined ? <RunDetail runId={selectedRunId} /> : null}

      <div style={stackStyle}>
        <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Recent background runs</h3>
        {recent.isPending ? (
          <Skeleton height={60} />
        ) : recent.isError ? (
          <ErrorState message={errorMessage(recent.error)} onRetry={() => void recent.refetch()} />
        ) : recent.data.length === 0 ? (
          <EmptyState
            title="No background runs yet"
            description="Run this tool in the background to see its runs here."
          />
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              ...stackStyle,
              gap: 'var(--tai-space-2)',
            }}
          >
            {recent.data.map((run) => (
              <li key={run.run_id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRunId(run.run_id);
                  }}
                  aria-pressed={run.run_id === selectedRunId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--tai-space-3)',
                    width: '100%',
                    padding: 'var(--tai-space-2) var(--tai-space-3)',
                    // An unselected row has a transparent ground, so this edge is
                    // the control's ONLY boundary: contrast-safe token, not decor.
                    border: '1px solid var(--tai-color-control-border)',
                    borderRadius: 'var(--tai-radius-sm)',
                    background:
                      run.run_id === selectedRunId
                        ? 'var(--tai-color-surface-raised)'
                        : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'var(--tai-color-text)',
                  }}
                >
                  <StatusChip status={run.status} />
                  <code style={{ fontSize: 'var(--tai-text-sm)' }}>{run.run_id}</code>
                  <span
                    style={{
                      marginLeft: 'auto',
                      color: 'var(--tai-color-text-muted)',
                      fontSize: 'var(--tai-text-sm)',
                    }}
                  >
                    {run.started_at}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
