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
 *
 * The recent-runs list is a quiet, borderless `.tai-nav-item` list: a status chip
 * (label + colour, plus a live spinner while running), the run id in mono, and the
 * start time. The selected row carries `aria-pressed` and the accent tint so the
 * detail above it and the row it came from read as one selection.
 */
import { useEffect, useState, type ReactNode } from 'react';
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
    <section className="tai-stack tai-stack-3" data-testid="tool-run-detail">
      <div className="tai-row">
        <StatusChip status={record.status} />
        <code className="tai-mono tai-muted">{record.run_id}</code>
      </div>

      {record.status === 'running' ? (
        <div role="status" className="tai-row">
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
    <section className="tai-stack" data-testid="background-runs">
      {selectedRunId !== undefined ? <RunDetail runId={selectedRunId} /> : null}

      <div className="tai-stack tai-stack-3">
        <h3 className="tai-card-title">Recent background runs</h3>
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
          <div className="tai-stack tai-stack-2">
            {recent.data.map((run) => {
              const selected = run.run_id === selectedRunId;
              return (
                <button
                  key={run.run_id}
                  type="button"
                  onClick={() => {
                    setSelectedRunId(run.run_id);
                  }}
                  aria-pressed={selected}
                  // `.tai-nav-item` is borderless (no decorative-border boundary) and
                  // paints its own hover. It keys its selected tint on
                  // `aria-current="page"`, which is a nav-route affordance this
                  // in-panel toggle is not; the selected row therefore carries the
                  // accent tint via canonical tokens (never a literal). See the return
                  // note: there is no SDK persistent-pressed list-row primitive.
                  className="tai-nav-item"
                  style={
                    selected
                      ? {
                          background: 'var(--tai-color-accent-tint)',
                          color: 'var(--tai-color-accent-on-tint)',
                        }
                      : undefined
                  }
                >
                  <StatusChip status={run.status} />
                  <code className="tai-mono">{run.run_id}</code>
                  <span className="tai-muted" style={{ marginLeft: 'auto' }}>
                    {run.started_at}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
