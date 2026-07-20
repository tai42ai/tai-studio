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
 */
import type { CSSProperties, ReactNode } from 'react';
import type { FleetReportSummary, FleetFailureOutcome } from '@tai42/api-client';

/** Human labels for the per-origin non-applied outcomes. */
const OUTCOME_LABEL: Record<FleetFailureOutcome, string> = {
  failed: 'apply failed',
  missing: 'alive but did not acknowledge in time',
  departed: 'left mid-broadcast',
  timed_out: 'acknowledged but did not finish applying',
};

const panelStyle: CSSProperties = {
  padding: 'var(--tai-space-4)',
  border: '1px solid var(--tai-color-warning)',
  borderRadius: 'var(--tai-radius-md)',
  color: 'var(--tai-color-text)',
  background: 'color-mix(in srgb, var(--tai-color-warning) 10%, var(--tai-color-surface))',
};

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 'var(--tai-space-2) 0 0',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
};

const monoStyle: CSSProperties = { fontFamily: 'var(--tai-font-mono)' };

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
      <div role="alert" style={panelStyle}>
        <strong style={{ color: 'var(--tai-color-warning)' }}>
          {action === 'reload'
            ? 'The worker fleet was not reached'
            : 'Change saved, but the worker fleet was not reached'}
        </strong>
        <p style={{ margin: 'var(--tai-space-2) 0 0' }}>
          {action === 'reload'
            ? 'The worker bus was unreachable, so other workers may still be running the old config. Re-run the reload once the bus is back.'
            : 'The worker bus was unreachable, so other workers may still be running the old config. Re-run the reload from the System page once the bus is back.'}
        </p>
        {summary.error !== null ? (
          <p style={{ margin: 'var(--tai-space-2) 0 0', ...monoStyle, whiteSpace: 'pre-wrap' }}>
            {summary.error}
          </p>
        ) : null}
      </div>
    );
  }

  // degraded — the bus was reached but named origins did not converge.
  return (
    <div role="alert" style={panelStyle}>
      <strong style={{ color: 'var(--tai-color-warning)' }}>
        {action === 'reload'
          ? `${String(summary.failures.length)} worker(s) did not converge`
          : `Change saved, but ${String(summary.failures.length)} worker(s) did not converge`}
      </strong>
      <p style={{ margin: 'var(--tai-space-2) 0 0' }}>
        {action === 'reload'
          ? 'These workers may still be running the old config — re-run the reload to converge them.'
          : 'These workers may still be running the old config — reload the fleet from the System page to converge them.'}
      </p>
      <ul style={listStyle}>
        {summary.failures.map((failure) => (
          <li key={failure.origin}>
            <span style={monoStyle}>{failure.origin}</span> — {OUTCOME_LABEL[failure.outcome]}
            {failure.message !== null ? (
              <span style={{ color: 'var(--tai-color-text-muted)' }}>: {failure.message}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
