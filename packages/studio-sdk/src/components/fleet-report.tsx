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
 * was saved, a reload was dispatched — and the self-referential System-page pointer.
 *
 * A `converged` summary (every origin applied, or a lone-worker local-only change)
 * renders NOTHING — the calling surface shows its own success. A `degraded` summary
 * (the bus was reached but a sibling did not confirm) or an `unreachable` summary (the
 * bus itself failed) renders a loud `role="alert"` panel naming the honest per-origin
 * outcomes: `failed` / `missing` / `departed` / `timed_out`, or the bus error. It
 * never fakes success on a stranded origin. Every server-supplied string (an origin
 * name, an error/detail message) renders as escaped React text, never an HTML sink.
 *
 * Every state — the headline and each origin's outcome — is a `tai-status` line: an
 * icon MARK plus a word LABEL, with the tone color only reinforcing them, so the
 * report is readable without color perception.
 */
import type { ReactNode } from 'react';
import type { FleetReportSummary, FleetFailureOutcome } from '@tai42/api-client';

import { AlertTriangleIcon, PendingIcon, XCircleIcon, type IconComponent } from './icons';

/** Human labels for the per-origin non-applied outcomes. */
const OUTCOME_LABEL: Record<FleetFailureOutcome, string> = {
  failed: 'apply failed',
  missing: 'alive but did not acknowledge in time',
  departed: 'left mid-broadcast',
  timed_out: 'acknowledged but did not finish applying',
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
 */
const OUTCOME_STATUS: Record<FleetFailureOutcome, StatusTone> = {
  failed: { tone: 'tai-status-err', Icon: XCircleIcon },
  missing: { tone: 'tai-status-pending', Icon: PendingIcon },
  departed: { tone: 'tai-status-warn', Icon: AlertTriangleIcon },
  timed_out: { tone: 'tai-status-pending', Icon: PendingIcon },
};

/**
 * Render a fleet broadcast's failure state. Returns `null` for a converged/absent
 * report (nothing to warn about) so callers can always mount it unconditionally
 * beside their own success line.
 */
export function FleetReport({
  summary,
  action = 'save',
}: {
  readonly summary: FleetReportSummary | null;
  readonly action?: 'save' | 'reload';
}): ReactNode {
  if (summary === null || summary.status === 'converged') return null;

  if (summary.status === 'unreachable') {
    return (
      <div role="alert" className="tai-error-state tai-stack tai-stack-2">
        <strong className="tai-status tai-status-err">
          <XCircleIcon />
          {action === 'reload'
            ? 'The worker fleet was not reached'
            : 'Change saved, but the worker fleet was not reached'}
        </strong>
        <p>
          {action === 'reload'
            ? 'The worker bus was unreachable, so other workers may still be running the old config. Re-run the reload once the bus is back.'
            : 'The worker bus was unreachable, so other workers may still be running the old config. Re-run the reload from the System page once the bus is back.'}
        </p>
        {/* The bus error is a message, not a listing: it wraps rather than scrolls. */}
        {summary.error !== null ? (
          <p className="tai-code-block tai-code-block-wrap">{summary.error}</p>
        ) : null}
      </div>
    );
  }

  // degraded — the bus was reached but named origins did not converge. That is a
  // warning, not a failure, so it takes the warning surface: a warn-toned
  // headline inside an error-toned panel would state two different severities.
  return (
    <div role="alert" className="tai-warn-state tai-stack tai-stack-2">
      <strong className="tai-status tai-status-warn">
        <AlertTriangleIcon />
        {action === 'reload'
          ? `${String(summary.failures.length)} worker(s) did not converge`
          : `Change saved, but ${String(summary.failures.length)} worker(s) did not converge`}
      </strong>
      <p>
        {action === 'reload'
          ? 'These workers may still be running the old config — re-run the reload to converge them.'
          : 'These workers may still be running the old config — reload the fleet from the System page to converge them.'}
      </p>
      <ul className="tai-stack tai-stack-2">
        {summary.failures.map((failure) => {
          const { tone, Icon } = OUTCOME_STATUS[failure.outcome];
          return (
            <li key={failure.origin} className="tai-row">
              <span className="tai-mono">{failure.origin}</span>
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
