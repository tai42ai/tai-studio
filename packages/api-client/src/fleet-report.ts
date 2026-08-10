/**
 * The shared fleet-report handler — the single interpreter of a config mutation's
 * fleet broadcast. Every mutation surface (connector, backup, mcp-config, env,
 * extensions, single-MCP reload, fleet reload) routes its broadcast report through
 * this one function so a FAILED propagation is never invisible: an unconfirmed
 * sibling (any non-`applied` outcome) or an unreachable bus becomes an explicit
 * summary the UI renders as a loud, user-visible state — never a faked success on a
 * worker that did not converge.
 *
 * A mutation embeds its broadcast in one of two shapes: the mode-wrapped
 * {@link FleetReportFanout} (`fanout` field) or the bare {@link FleetResult} (the
 * fleet-reload and single-MCP-reload bodies). Both normalize to a
 * {@link FleetReportSummary} through the functions here; the SDK's `FleetReport`
 * component renders the summary.
 */
import type { FleetOutcome, FleetReportFanout, FleetResult } from './schemas';

/** A per-worker propagation FAILURE: a worker that did not confirm `applied`. */
export type FleetFailureOutcome = Exclude<FleetOutcome, 'applied'>;

/** One worker that failed to converge, with the report's message for it. */
export interface FleetWorkerFailure {
  readonly name: string;
  readonly outcome: FleetFailureOutcome;
  /** The failed apply's `error`, or the publisher's computed-outcome `detail`. */
  readonly message: string | null;
}

/**
 * The interpreted state of one broadcast.
 *   - `converged` — the bus was reached and every worker applied (or the change was
 *     local-only on a lone worker). The caller renders its own success; the report
 *     needs no loud state.
 *   - `degraded` — the bus was reached but one or more workers did not confirm; the
 *     named `failures` are stale/unreached siblings the operator must see.
 *   - `unreachable` — the bus itself could not be reached, so no sibling was told;
 *     `error` carries the transport failure.
 */
export type FleetReportStatus = 'converged' | 'degraded' | 'unreachable';

export interface FleetReportSummary {
  readonly status: FleetReportStatus;
  /** The single-worker `local-only` note, when the broadcast reached no sibling. */
  readonly note: string | null;
  /** The workers that did not apply — empty unless `status` is `degraded`. */
  readonly failures: readonly FleetWorkerFailure[];
  /** The bus-unreachable transport error — non-null only when `unreachable`. */
  readonly error: string | null;
}

/** True when a summary describes a propagation the operator must be shown. */
export function isFleetReportFailure(summary: FleetReportSummary | null): boolean {
  return summary !== null && summary.status !== 'converged';
}

/**
 * Interpret a bare {@link FleetResult} (the fleet-reload / single-MCP-reload body).
 * An unreachable bus is `unreachable`; a reachable report with any non-`applied`
 * worker is `degraded` (those workers named); otherwise `converged`.
 */
export function summarizeFleetResult(result: FleetResult): FleetReportSummary {
  if (!result.reachable) {
    return { status: 'unreachable', note: null, failures: [], error: result.error };
  }
  const failures: FleetWorkerFailure[] = result.results
    .filter((entry) => entry.outcome !== 'applied')
    .map((entry) => ({
      name: entry.name,
      outcome: entry.outcome as FleetFailureOutcome,
      message: entry.error ?? entry.detail ?? null,
    }));
  return {
    status: failures.length > 0 ? 'degraded' : 'converged',
    note: null,
    failures,
    error: null,
  };
}

/**
 * Interpret a mutation's mode-wrapped {@link FleetReportFanout}. `null`/`undefined`
 * (the response path mutated no manifest) yields `null` — there is nothing to report.
 * A `local-only` fan-out is `converged` with its note; `fleet`/`unreachable` carry a
 * bare {@link FleetResult} and defer to {@link summarizeFleetResult}.
 */
export function summarizeFleetFanout(
  fanout: FleetReportFanout | null | undefined,
): FleetReportSummary | null {
  if (fanout === null || fanout === undefined) return null;
  if (fanout.mode === 'local-only') {
    return { status: 'converged', note: fanout.note, failures: [], error: null };
  }
  return summarizeFleetResult(fanout);
}
