/**
 * The report of one fleet recycle roll — shared by the profile apply report and the
 * Environment tab's save report, so both read the same rows the same way.
 *
 * One row per worker the roll reached: its name, kind, status and life (joined onto a
 * fresh life sharing its name). `recycled` reads as done, the writer's own
 * `self-deferred` line as a warning with its note, and the target the roll stopped at
 * (`timed-out` / `failed`) as a failure with the reason the server gave. When the roll
 * stopped, a warning panel says where and why and that the workers after it still run
 * the old value. Names only — the report carries no env value. Every server string
 * renders as escaped React text.
 */
import type { FreshLife, RecycleEntry, RecycleStop } from '@tai42/api-client';
import { AlertTriangleIcon, Badge } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

const labelStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const rowListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

const noteStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

/** The badge tone a row's status takes: done, the writer's deferred exit, or the stop. */
function statusVariant(status: string): string {
  if (status === 'recycled') return 'success';
  if (status === 'self-deferred') return 'warning';
  return 'danger';
}

/** Where the roll stopped and why: the workers after it were not recycled. */
function StoppedPanel({ stopped }: { readonly stopped: RecycleStop }): ReactNode {
  const where =
    stopped.name !== null
      ? `The recycle stopped at ${stopped.name} (${stopped.kind} workers)`
      : `The recycle stopped before it reached a worker (${stopped.kind} workers)`;
  return (
    <div
      role="alert"
      className="tai-warn-state tai-stack tai-stack-2"
      data-testid="recycle-stopped"
    >
      <strong className="tai-status tai-status-warn">
        <AlertTriangleIcon />
        {where}
      </strong>
      <p>{stopped.detail}</p>
      <p>
        The change is saved and every worker reloaded, but the workers after this point were not
        recycled and still run the old value, and this worker was not recycled. Restart them through
        your deployment&rsquo;s supervisor.
      </p>
    </div>
  );
}

export interface RecycleRollSectionProps {
  readonly recycle: readonly RecycleEntry[];
  readonly fresh: readonly FreshLife[];
  readonly stopped: RecycleStop | null;
  /** The note beside the worker that took the change, on its `self-deferred` row. */
  readonly writerNote: string;
}

export function RecycleRollSection({
  recycle,
  fresh,
  stopped,
  writerNote,
}: RecycleRollSectionProps): ReactNode {
  if (recycle.length === 0 && stopped === null) {
    return <p style={noteStyle}>No process recycle was needed.</p>;
  }
  return (
    <div className="tai-stack">
      {recycle.length > 0 ? (
        <ul style={rowListStyle} data-testid="apply-recycle">
          {recycle.map((entry) => {
            const joined = fresh.find((life) => life.name === entry.name);
            return (
              <li
                key={`${entry.name}-${entry.kind}-${String(entry.generation_before)}`}
                className="tai-row"
              >
                <span className="tai-mono">{entry.name}</span>
                <Badge variant="neutral">{entry.kind}</Badge>
                <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                <span style={labelStyle}>
                  {joined !== undefined
                    ? `life ${String(entry.generation_before)} to ${String(joined.generation)}`
                    : `life ${String(entry.generation_before)}`}
                </span>
                {entry.status === 'self-deferred' ? (
                  <span style={labelStyle}>{writerNote}</span>
                ) : null}
                {entry.detail !== null && entry.detail !== undefined ? (
                  <span style={labelStyle}>{entry.detail}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {stopped !== null ? <StoppedPanel stopped={stopped} /> : null}
    </div>
  );
}
