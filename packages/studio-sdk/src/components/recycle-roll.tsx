/**
 * The report of one fleet recycle roll — the one section every door that can run a roll shows,
 * through `FleetOutcomeReport`, so all read the same heading, explanation and rows.
 *
 * One row per worker the roll reached: its name, kind, status and life (joined onto a
 * fresh life sharing its name). `recycled` reads as done, a `self-deferred` line as a
 * warning with its note, and the target the roll stopped at (`timed-out` / `failed`) or a
 * `withheld` worker (its reload refused at its epoch build, left running) as a failure
 * with the reason the server gave. An empty roll states that no worker was recycled. When
 * the roll stopped, a warning panel says where and why, which workers it did not recycle,
 * and how to restart them. Names only — the report carries no env value. Every server string renders as
 * escaped React text.
 */
import type { RecycleRoll, RecycleStop } from '@tai42/api-client';
import { type CSSProperties, type ReactNode, useId } from 'react';

import { Badge } from './badge';
import { AlertTriangleIcon } from './icons';

const titleStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-2)',
  fontSize: 'var(--tai-text-md)',
  color: 'var(--tai-color-text)',
};

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

/** The badge tone a row's status takes: done, a deferred exit, or a stop / withheld restart. */
function statusVariant(status: string): string {
  if (status === 'recycled') return 'success';
  if (status === 'self-deferred') return 'warning';
  return 'danger';
}

/**
 * What a `self-deferred` line means, true of both cases the status covers: the writer's own
 * exit after its reply, and a target whose exit waits on its own in-flight change.
 */
const SELF_DEFERRED_NOTE =
  'restarts once its own in-flight change has replied, which this report cannot confirm';

/** Where the roll stopped and why, which workers it did not recycle, and how to restart them. */
function StoppedPanel({ stopped }: { readonly stopped: RecycleStop }): ReactNode {
  const { kind, name, detail } = stopped;
  const where =
    name !== null
      ? `The recycle stopped at ${name} (${kind} workers)`
      : `The recycle stopped before it reached its next worker (${kind} workers)`;
  const left =
    name !== null
      ? `${name} was not confirmed recycled, and any workers after it were not recycled.`
      : 'The workers it did not reach were not recycled.';
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
      <p>{detail}</p>
      <p>
        {`${left} `}
        Restart them through your deployment&rsquo;s supervisor.
      </p>
    </div>
  );
}

export interface RecycleRollSectionProps {
  /** The roll, read from a reply that nests it or one that carries its fields flat. */
  readonly roll: Pick<RecycleRoll, 'recycle' | 'fresh' | 'recycle_stopped'>;
  /** The part of the operation the roll belongs to, named after the heading. */
  readonly scope?: string;
}

export function RecycleRollSection({ roll, scope }: RecycleRollSectionProps): ReactNode {
  const headingId = useId();
  const { recycle, fresh, recycle_stopped: stopped } = roll;
  const ran = recycle.length > 0 || stopped !== null;
  return (
    <section aria-labelledby={headingId}>
      <h4 id={headingId} style={titleStyle}>
        Worker recycle
        {scope !== undefined ? (
          <>
            {' — '}
            <span className="tai-mono">{scope}</span>
          </>
        ) : null}
      </h4>
      {ran ? (
        <p style={noteStyle}>
          Some changed settings take effect only in a fresh worker process, so the fleet restarts
          the workers that need it, one at a time.
        </p>
      ) : (
        <p style={noteStyle}>No worker was recycled.</p>
      )}
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
                    <span style={labelStyle}>{SELF_DEFERRED_NOTE}</span>
                  ) : null}
                  {entry.detail !== null ? <span style={labelStyle}>{entry.detail}</span> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {stopped !== null ? <StoppedPanel stopped={stopped} /> : null}
      </div>
    </section>
  );
}
