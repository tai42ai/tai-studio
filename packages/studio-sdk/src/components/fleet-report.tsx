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
 * `'deregister'` (a connector detach fan-out) likewise drops the "Change saved"
 * framing and points the operator back at re-running the deregister, because a
 * reload would re-attach the very server being detached — the wrong remediation.
 *
 * A `converged` summary (every worker applied, or a lone-worker local-only change)
 * renders NOTHING — the calling surface shows its own success. A `degraded` summary
 * (the bus was reached but a sibling did not confirm) or an `unreachable` summary (the
 * bus itself failed) renders a loud `role="alert"` panel naming the honest per-worker
 * outcomes: `failed` / `missing` / `departed` / `timed_out` / `resyncing` / `recycling` /
 * `stale`, or the bus error. It never fakes success on a stranded worker. Every
 * server-supplied string (a worker name, an error/detail message) renders as escaped
 * React text, never an HTML sink.
 *
 * Every state — the headline and each worker's outcome — is a `tai-status` line: an
 * icon MARK plus a word LABEL, with the tone color only reinforcing them, so the
 * report is readable without color perception.
 */
import type { ReactNode } from 'react';
import type { FleetReportSummary, FleetFailureOutcome } from '@tai42/api-client';

import { AlertTriangleIcon, PendingIcon, XCircleIcon, type IconComponent } from './icons';

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

/**
 * Render a fleet broadcast's failure state. Returns `null` for a converged/absent
 * report (nothing to warn about) so callers can always mount it unconditionally
 * beside their own success line.
 */
export interface FleetReportProps {
  readonly summary: FleetReportSummary | null;
  /**
   * Whose framing the copy takes: a saved config change (`'save'`), a dispatched
   * reload (`'reload'`), a connector detach fan-out (`'deregister'`), or a live-registry
   * tool removal (`'remove'`). All but `'save'` drop the "Change saved" framing;
   * `'deregister'` and `'remove'` also point remediation back at
   * re-running the deregister, since a reload would re-attach the detached server.
   */
  readonly action?: 'save' | 'reload' | 'deregister' | 'remove';
}

export function FleetReport({ summary, action = 'save' }: FleetReportProps): ReactNode {
  if (summary === null || summary.status === 'converged') return null;

  // Only a saved config change carries the "Change saved" framing; a reload or a
  // deregister saved nothing.
  const savedFraming = action === 'save';

  if (summary.status === 'unreachable') {
    // Where to send the operator once the bus is back: re-run the same op, except a
    // saved change reloads from the System page.
    const unreachableRemediation =
      action === 'deregister'
        ? 'Re-run the deregister once the bus is back.'
        : action === 'remove'
          ? 'Re-run the remove once the bus is back.'
          : action === 'reload'
            ? 'Re-run the reload once the bus is back.'
            : 'Re-run the reload from the System page once the bus is back.';
    return (
      <div role="alert" className="tai-error-state tai-stack tai-stack-2">
        <strong className="tai-status tai-status-err">
          <XCircleIcon />
          {savedFraming
            ? 'Change saved, but the worker fleet was not reached'
            : 'The worker fleet was not reached'}
        </strong>
        <p>
          {`The worker bus was unreachable, so other workers may still be running the old config. ${unreachableRemediation}`}
        </p>
        {/* The bus error is a message, not a listing: it wraps rather than scrolls. */}
        {summary.error !== null ? (
          <p className="tai-code-block tai-code-block-wrap">{summary.error}</p>
        ) : null}
      </div>
    );
  }

  // degraded — the bus was reached but named workers did not converge. That is a
  // warning, not a failure, so it takes the warning surface: a warn-toned
  // headline inside an error-toned panel would state two different severities.
  //
  // A count and its noun agree. `worker(s)` is machine output at the one moment
  // an operator is being told something went wrong, and a single unconverged
  // worker is the commonest degraded fleet there is.
  const count = summary.failures.length;
  const workers = `${String(count)} worker${count === 1 ? '' : 's'}`;
  // How the operator converges the stranded workers: re-run the same op, except a
  // saved change reloads the fleet from the System page.
  const remediation =
    action === 'deregister'
      ? 're-run the deregister'
      : action === 'remove'
        ? 're-run the remove'
        : action === 'reload'
          ? 're-run the reload'
          : 'reload the fleet from the System page';
  return (
    <div role="alert" className="tai-warn-state tai-stack tai-stack-2">
      <strong className="tai-status tai-status-warn">
        <AlertTriangleIcon />
        {savedFraming
          ? `Change saved, but ${workers} did not converge`
          : `${workers} did not converge`}
      </strong>
      <p>
        {`${count === 1 ? 'This worker' : 'These workers'} may still be running the old config — ` +
          remediation +
          ` to converge ${count === 1 ? 'it' : 'them'}.`}
      </p>
      <ul className="tai-stack tai-stack-2">
        {summary.failures.map((failure) => {
          const { tone, Icon } = OUTCOME_STATUS[failure.outcome];
          return (
            <li key={failure.name} className="tai-row">
              <span className="tai-mono">{failure.name}</span>
              <span className={`tai-status ${tone}`}>
                <Icon />
                {OUTCOME_LABEL[failure.outcome]}
              </span>
              {failure.message !== null ? (
                <span className="tai-muted">{failure.message}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
