/**
 * `FleetReport` — the shared, loud rendering of a config mutation's fleet broadcast.
 * Every mutation surface (connector, backup, mcp-config, env, extensions, single-MCP
 * reload, fleet reload) computes a `FleetReportSummary` from its response through the
 * api-client's shared handler and hands it here, so a FAILED propagation is never
 * invisible.
 *
 * The `action` prop tunes the copy to the caller's framing: `'save'` (the default,
 * used by every config-mutation surface) reports a saved change that did not fully
 * propagate and points the operator at the System page to reload; `'reload'` (the
 * System page's own fleet-reload action) drops the "Change saved" framing — nothing
 * was saved, a reload was dispatched — and the self-referential System-page pointer;
 * `'deregister'` and `'remove'` (detach fan-outs) likewise drop the "Change saved"
 * framing and points the operator back at re-running the deregister, because a
 * reload would re-attach the very server being detached — the wrong remediation;
 * `'failed'` (a write whose reply is a failure carrying a roll) drops the framing too,
 * because such a reply does not establish that a change stands, and keeps the System-page
 * pointer.
 *
 * A `converged` summary (every worker applied or was settled by its roll, or a lone-worker
 * local-only change) with no worker awaiting a respawn renders NOTHING — the calling surface
 * shows its own success. A `degraded` summary (the bus was reached but a sibling did not
 * confirm and its roll did not settle it) or an `unreachable` summary (the
 * bus itself failed) renders a loud `role="alert"` panel naming the honest per-worker
 * outcomes: `failed` / `missing` / `departed` / `timed_out` / `resyncing` / `recycling` /
 * `stale`, or the bus error. It never fakes success on a stranded worker. Every
 * server-supplied string (a worker name, an error/detail message) renders as escaped
 * React text, never an HTML sink.
 *
 * A degraded panel lists a worker whose reload was refused at its epoch build apart from
 * the others: trying again may be refused the same way, so it is told to have the stored
 * config fixed first.
 *
 * Whatever the status, a `spanReleaseError` (the config store did not release its exclusive
 * write span after the persist) renders its own `role="alert"` panel with the store's
 * error: the change landed, but a later write can block or be refused until the writer
 * process exits.
 *
 * Whatever the status, the workers the operation names as still awaiting a respawn are listed
 * beside it in warning status panels, one per reading of the reply, each with its own heading,
 * count and row label. A worker a restart would serve is told to restart. A worker the
 * operation withheld (the stored config did not build on it) is told to have that config
 * fixed first, since a restart may fail the same way. A worker the reply says neither about
 * gets the guidance that holds for both.
 *
 * Every state — the headline and each worker's outcome — is a `tai-status` line: an
 * icon MARK plus a word LABEL, with the tone color only reinforcing them, so the
 * report is readable without color perception.
 */
import type {
  AwaitingRestartReading,
  FleetFailureOutcome,
  FleetReportSummary,
  FleetWorkerAwaitingRespawn,
  FleetWorkerFailure,
} from '@tai42/api-client';
import type { ReactNode } from 'react';

import { AlertTriangleIcon, type IconComponent, PendingIcon, XCircleIcon } from './icons';

/** Human labels for the per-worker non-applied outcomes. */
const OUTCOME_LABEL: Record<FleetFailureOutcome, string> = {
  failed: 'apply failed',
  missing: 'alive but did not acknowledge in time',
  departed: 'left mid-broadcast',
  timed_out: 'acknowledged but did not finish applying',
  resyncing: 'resyncing — will converge on resync',
  recycling: 'restarting',
  stale: 'quiet — reconnecting or dead',
};

interface StatusTone {
  /** The `tai-status-*` modifier carrying the tone. */
  readonly tone: string;
  /** The mark that states the outcome without relying on that tone. */
  readonly Icon: IconComponent;
}

/**
 * How each outcome reads as a status. `failed` is a definite negative — the apply
 * raised. `departed` is a warning — the worker is gone, so nothing will converge it.
 * `missing` and `timed_out` are both UNRESOLVED (never acknowledged / acknowledged
 * but never finished), so they read as pending rather than as an outright failure.
 * `resyncing` and `recycling` are transient restart-in-progress states, and `stale` is
 * a quiet row past the freshness bound (reconnecting or dead, carrying no convergence
 * promise) — all three read as warnings the operator should watch.
 */
const OUTCOME_STATUS: Record<FleetFailureOutcome, StatusTone> = {
  failed: { tone: 'tai-status-err', Icon: XCircleIcon },
  missing: { tone: 'tai-status-pending', Icon: PendingIcon },
  departed: { tone: 'tai-status-warn', Icon: AlertTriangleIcon },
  timed_out: { tone: 'tai-status-pending', Icon: PendingIcon },
  resyncing: { tone: 'tai-status-warn', Icon: AlertTriangleIcon },
  recycling: { tone: 'tai-status-warn', Icon: AlertTriangleIcon },
  stale: { tone: 'tai-status-warn', Icon: AlertTriangleIcon },
};

export interface FleetReportProps {
  readonly summary: FleetReportSummary | null;
  /**
   * Whose framing the copy takes: a saved config change (`'save'`), a dispatched
   * reload (`'reload'`), a connector detach fan-out (`'deregister'`), a live-registry
   * tool removal (`'remove'`), or a failed write's reply (`'failed'`). All but `'save'`
   * drop the "Change saved" framing;
   * `'deregister'` and `'remove'` also point remediation back at re-running that
   * same detach, since a reload would re-attach the detached server or tool.
   */
  readonly action?: 'save' | 'reload' | 'deregister' | 'remove' | 'failed';
}

type FleetAction = NonNullable<FleetReportProps['action']>;

/**
 * Where to send the operator, per action and phase. On `unreachable` the copy
 * is a full sentence ending "once the bus is back."; on `degraded` it is the
 * verb phrase spliced into the sentence the panel builds. A saved change or a failed
 * write reloads from the System page; a detach re-runs itself, since a reload would
 * re-attach.
 */
function remediationText(action: FleetAction, phase: FleetReportStatusPhase): string {
  if (phase === 'unreachable') {
    if (action === 'deregister') return 'Re-run the deregister once the bus is back.';
    if (action === 'remove') return 'Re-run the remove once the bus is back.';
    if (action === 'reload') return 'Re-run the reload once the bus is back.';
    return 'Re-run the reload from the System page once the bus is back.';
  }
  if (action === 'deregister') return 're-run the deregister';
  if (action === 'remove') return 're-run the remove';
  if (action === 'reload') return 're-run the reload';
  return 'reload the fleet from the System page';
}

type FleetReportStatusPhase = 'unreachable' | 'degraded';

/**
 * What a worker not reached may be running. A failed write's stored value may be its old one
 * again, after a revert, so only the stored configuration names what the worker may be missing.
 */
function stalenessText(action: FleetAction): string {
  return action === 'failed'
    ? 'may not be running the stored configuration'
    : 'may still be running the old config';
}

/** The loud panel for a bus that could not be reached: no sibling was told. */
function UnreachableReport({
  error,
  savedFraming,
  staleness,
  remediation,
}: {
  readonly error: string | null;
  readonly savedFraming: boolean;
  readonly staleness: string;
  readonly remediation: string;
}): ReactNode {
  return (
    <div role="alert" className="tai-error-state tai-stack tai-stack-2">
      <strong className="tai-status tai-status-err">
        <XCircleIcon />
        {savedFraming
          ? 'Change saved, but the worker fleet was not reached'
          : 'The worker fleet was not reached'}
      </strong>
      <p>{`The worker bus was unreachable, so other workers ${staleness}. ${remediation}`}</p>
      {/* The bus error is a message, not a listing: it wraps rather than scrolls. */}
      {error !== null ? <p className="tai-code-block tai-code-block-wrap">{error}</p> : null}
    </div>
  );
}

/** One worker that did not converge: its name, its outcome and the report's message for it. */
function FailureRow({ failure }: { readonly failure: FleetWorkerFailure }): ReactNode {
  const { tone, Icon } = OUTCOME_STATUS[failure.outcome];
  return (
    <li className="tai-row">
      <span className="tai-mono">{failure.name}</span>
      <span className={`tai-status ${tone}`}>
        <Icon />
        {OUTCOME_LABEL[failure.outcome]}
      </span>
      {failure.message !== null ? <span className="tai-muted">{failure.message}</span> : null}
    </li>
  );
}

/**
 * The loud panel for a reachable bus whose named workers did not converge. A
 * warning, not a failure, so it takes the warning surface: a warn-toned headline
 * inside an error-toned panel would state two different severities. A worker whose
 * reload was refused at its epoch build is listed apart: the action that would converge
 * the others may be refused the same way on it, so its next step is fixing the config.
 */
function DegradedReport({
  failures,
  savedFraming,
  staleness,
  remediation,
}: {
  readonly failures: readonly FleetWorkerFailure[];
  readonly savedFraming: boolean;
  readonly staleness: string;
  readonly remediation: string;
}): ReactNode {
  // A count and its noun agree. `worker(s)` is machine output at the one moment an
  // operator is being told something went wrong, and a single unconverged worker
  // is the commonest degraded fleet there is.
  const count = failures.length;
  const workers = `${String(count)} worker${count === 1 ? '' : 's'}`;
  const retryable = failures.filter((failure) => !failure.withheld);
  const withheld = failures.filter((failure) => failure.withheld);
  return (
    <div role="alert" className="tai-warn-state tai-stack tai-stack-2">
      <strong className="tai-status tai-status-warn">
        <AlertTriangleIcon />
        {savedFraming
          ? `Change saved, but ${workers} did not converge`
          : `${workers} did not converge`}
      </strong>
      {retryable.length > 0 ? (
        <>
          <p>
            {`${retryable.length === 1 ? 'This worker' : 'These workers'} ${staleness} — ` +
              remediation +
              ` to converge ${retryable.length === 1 ? 'it' : 'them'}.`}
          </p>
          <ul className="tai-stack tai-stack-2">
            {retryable.map((failure) => (
              <FailureRow key={failure.name} failure={failure} />
            ))}
          </ul>
        </>
      ) : null}
      {withheld.length > 0 ? (
        <>
          <p>
            {withheld.length === 1
              ? 'The stored configuration did not build on this worker, so it keeps running its current configuration.'
              : 'The stored configuration did not build on these workers, so they keep running their current configuration.'}{' '}
            Trying again may be refused the same way: first fix the stored configuration, or the
            cause the build error names.
          </p>
          <ul className="tai-stack tai-stack-2">
            {withheld.map((failure) => (
              <FailureRow key={failure.name} failure={failure} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/** What one group of awaiting workers reads, by how many it holds. */
interface AwaitingGroupCopy {
  readonly heading: (count: number) => string;
  readonly guidance: { readonly one: string; readonly many: string };
  readonly rowLabel: string;
}

const SUPERVISOR = 'your deployment\u2019s supervisor (on a bare server, restart the server)';

/**
 * The text of each reading, the groups in the order they list. Only a `restartable` worker is
 * told it needs a restart: a `withheld` one is told to fix the stored configuration first, and
 * an `unstated` one reads what holds whichever it is.
 */
const AWAITING_GROUPS: readonly (readonly [AwaitingRestartReading, AwaitingGroupCopy])[] = [
  [
    'restartable',
    {
      heading: (count) =>
        count === 1
          ? '1 worker needs a restart to apply some settings'
          : `${String(count)} workers need a restart to apply some settings`,
      guidance: {
        one: `These settings changed in the stored environment after this worker started, and take effect only when it restarts. Restart it through ${SUPERVISOR}.`,
        many: `These settings changed in the stored environment after these workers started, and take effect only when they restart. Restart them through ${SUPERVISOR}.`,
      },
      rowLabel: 'waits for a restart:',
    },
  ],
  [
    'withheld',
    {
      heading: (count) =>
        count === 1
          ? '1 worker could not build the stored configuration'
          : `${String(count)} workers could not build the stored configuration`,
      guidance: {
        one: `The stored configuration did not build on this worker, so it keeps running its current configuration and was not restarted: a restart may fail the same way. Fix the stored configuration, or the cause the build error names, then restart it through ${SUPERVISOR}.`,
        many: `The stored configuration did not build on these workers, so they keep running their current configuration and were not restarted: a restart may fail the same way. Fix the stored configuration, or the cause the build error names, then restart them through ${SUPERVISOR}.`,
      },
      rowLabel: 'has not applied:',
    },
  ],
  [
    'unstated',
    {
      heading: (count) =>
        count === 1
          ? '1 worker has settings it has not applied'
          : `${String(count)} workers have settings they have not applied`,
      guidance: {
        one: `These settings take effect only when this worker restarts. If its new build failed, fix the stored configuration first, since a restart may fail the same way. Then restart it through ${SUPERVISOR}.`,
        many: `These settings take effect only when these workers restart. If a worker\u2019s new build failed, fix the stored configuration first, since a restart may fail the same way. Then restart them through ${SUPERVISOR}.`,
      },
      rowLabel: 'has not applied:',
    },
  ],
];

/** One awaiting worker's row: its name, its group's label and the keys it has not applied. */
function AwaitingWorkerRow({
  worker,
  label,
}: {
  readonly worker: FleetWorkerAwaitingRespawn;
  readonly label: string;
}): ReactNode {
  return (
    <li className="tai-row">
      <span className="tai-mono">{worker.name}</span>
      <span className="tai-muted">{label}</span>
      <span className="tai-mono">{worker.keys.join(', ')}</span>
    </li>
  );
}

/**
 * The panels for the workers the operation names as still awaiting a respawn, one per reading
 * of the reply present among them. Guidance the operator acts on, not a failure, so each is a
 * warning status rather than an alert.
 */
function AwaitingRespawnReport({
  awaiting,
}: {
  readonly awaiting: readonly FleetWorkerAwaitingRespawn[];
}): ReactNode {
  return AWAITING_GROUPS.map(([reading, copy]) => {
    const workers = awaiting.filter((worker) => worker.reading === reading);
    if (workers.length === 0) return null;
    return (
      <div key={reading} role="status" className="tai-warn-state tai-stack tai-stack-2">
        <strong className="tai-status tai-status-warn">
          <AlertTriangleIcon />
          {copy.heading(workers.length)}
        </strong>
        <p>{workers.length === 1 ? copy.guidance.one : copy.guidance.many}</p>
        <ul className="tai-stack tai-stack-2">
          {workers.map((worker) => (
            <AwaitingWorkerRow key={worker.name} worker={worker} label={copy.rowLabel} />
          ))}
        </ul>
      </div>
    );
  });
}

/**
 * The loud panel for a write span the config store did not release: the change landed,
 * but the store may hold the span until the writer process exits.
 */
function SpanReleaseReport({ error }: { readonly error: string }): ReactNode {
  return (
    <div role="alert" className="tai-error-state tai-stack tai-stack-2">
      <strong className="tai-status tai-status-err">
        <XCircleIcon />
        The config store did not release its write lock
      </strong>
      <p>
        The write landed, but the store may hold its write lock until the server process that wrote
        it exits. Until then another config change can wait or be refused.
      </p>
      <p className="tai-code-block tai-code-block-wrap">{error}</p>
    </div>
  );
}

function FailureReport({
  summary,
  action,
}: {
  readonly summary: FleetReportSummary;
  readonly action: FleetAction;
}): ReactNode {
  if (summary.status === 'converged') return null;

  // Only a saved config change carries the "Change saved" framing: a reload or a deregister
  // saved nothing, and a failed reply does not establish that anything stands.
  const savedFraming = action === 'save';

  if (summary.status === 'unreachable') {
    return (
      <UnreachableReport
        error={summary.error}
        savedFraming={savedFraming}
        staleness={stalenessText(action)}
        remediation={remediationText(action, 'unreachable')}
      />
    );
  }

  return (
    <DegradedReport
      failures={summary.failures}
      savedFraming={savedFraming}
      staleness={stalenessText(action)}
      remediation={remediationText(action, 'degraded')}
    />
  );
}

/**
 * Render a fleet broadcast's failure state, an unreleased write span, and its workers
 * awaiting a respawn. Returns `null` for an absent report or a converged one with no
 * unreleased span and no worker awaiting a respawn (nothing to warn about), so callers can
 * always mount it unconditionally beside their own success line.
 */
export function FleetReport({ summary, action = 'save' }: FleetReportProps): ReactNode {
  if (summary === null) return null;
  if (
    summary.status === 'converged' &&
    summary.awaiting.length === 0 &&
    summary.spanReleaseError === null
  ) {
    return null;
  }
  return (
    <div className="tai-stack tai-stack-3">
      <FailureReport summary={summary} action={action} />
      {summary.spanReleaseError !== null ? (
        <SpanReleaseReport error={summary.spanReleaseError} />
      ) : null}
      <AwaitingRespawnReport awaiting={summary.awaiting} />
    </div>
  );
}
