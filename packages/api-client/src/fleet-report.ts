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
import { isMcpStarting } from './mcp-failure';
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

/**
 * One worker whose reload named recycle-class keys awaiting a respawn: their value
 * changed since the worker bound it (at boot, or when the plugin that declares them was
 * loaded), and they take effect only when it is respawned.
 */
export interface FleetWorkerAwaitingRespawn {
  readonly name: string;
  readonly keys: readonly string[];
}

export interface FleetReportSummary {
  readonly status: FleetReportStatus;
  /** The single-worker `local-only` note, when the broadcast reached no sibling. */
  readonly note: string | null;
  /** The workers that did not apply — empty unless `status` is `degraded`. */
  readonly failures: readonly FleetWorkerFailure[];
  /** The bus-unreachable transport error — non-null only when `unreachable`. */
  readonly error: string | null;
  /** The workers whose reload named recycle-class keys awaiting a respawn. */
  readonly awaiting: readonly FleetWorkerAwaitingRespawn[];
  /**
   * The config store's error releasing its exclusive write span after the persist, or
   * `null` when it released. Non-null means the change landed but the store may hold
   * the span until the writer process exits, so a later write can block or be refused.
   */
  readonly spanReleaseError: string | null;
}

/**
 * The recycle-class keys a worker's reload payload names under `awaiting_respawn`.
 * The per-worker payload is opaque on the wire, so it is read defensively: a payload
 * that is not a reload result names nothing.
 */
function awaitingKeys(payload: unknown): string[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return [];
  const keys = (payload as Record<string, unknown>).awaiting_respawn;
  if (!Array.isArray(keys)) return [];
  return keys.filter((key): key is string => typeof key === 'string');
}

/**
 * True when a summary describes a failure the operator must be shown: a propagation
 * that did not converge, or a write span the store did not release.
 */
export function isFleetReportFailure(summary: FleetReportSummary | null): boolean {
  return summary !== null && (summary.status !== 'converged' || summary.spanReleaseError !== null);
}

/**
 * Interpret a bare {@link FleetResult} (the fleet-reload / single-MCP-reload body).
 * An unreachable bus is `unreachable`; a reachable report with any non-`applied`
 * worker is `degraded` (those workers named); otherwise `converged`. Every worker whose
 * reload payload names `awaiting_respawn` keys is listed under `awaiting`, whatever the
 * status.
 */
export function summarizeFleetResult(result: Omit<FleetResult, 'ok'>): FleetReportSummary {
  const awaiting: FleetWorkerAwaitingRespawn[] = result.results
    .map((entry) => ({ name: entry.name, keys: awaitingKeys(entry.payload) }))
    .filter((entry) => entry.keys.length > 0);
  return summarizeWith(result, awaiting, null);
}

function summarizeWith(
  result: Omit<FleetResult, 'ok'>,
  awaiting: readonly FleetWorkerAwaitingRespawn[],
  spanReleaseError: string | null,
): FleetReportSummary {
  if (!result.reachable) {
    return {
      status: 'unreachable',
      note: null,
      failures: [],
      error: result.error,
      awaiting,
      spanReleaseError,
    };
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
    awaiting,
    spanReleaseError,
  };
}

/**
 * Interpret a mutation's mode-wrapped {@link FleetReportFanout}. `null`/`undefined`
 * (the response path mutated no manifest) yields `null` — there is nothing to report.
 * A `local-only` fan-out is `converged` with its note; `fleet`/`unreachable` carry a
 * bare {@link FleetResult} judged as {@link summarizeFleetResult} judges its failures.
 * `awaiting` is the mutation's own verdict (its response's `awaiting_respawn`, or `[]`
 * for a mutation that states none): the operation knows whether its recycle roll
 * carried a worker's moved env, so its per-worker rows are never re-read for it.
 * `spanReleaseError` is the response's `span_release_error`: a non-null value makes the
 * summary a failure ({@link isFleetReportFailure}) whatever the fan-out reports, and a
 * response that mutated no manifest still yields a summary carrying it.
 */
export function summarizeFleetFanout(
  fanout: FleetReportFanout | null | undefined,
  awaiting: readonly FleetWorkerAwaitingRespawn[],
  spanReleaseError: string | null,
): FleetReportSummary | null {
  if (fanout === null || fanout === undefined) {
    if (spanReleaseError === null) return null;
    return {
      status: 'converged',
      note: null,
      failures: [],
      error: null,
      awaiting,
      spanReleaseError,
    };
  }
  if (fanout.mode === 'local-only') {
    return {
      status: 'converged',
      note: fanout.note,
      failures: [],
      error: null,
      awaiting,
      spanReleaseError,
    };
  }
  return summarizeWith(fanout, awaiting, spanReleaseError);
}

/** One MCP server skipped by the viability check — its title, a coarse status, and the
 *  credential-free detail the platform records when present: `category` (`preset_store`
 *  when the preset store could not be read, `auth` for a 401/403, `unreachable` for a
 *  transport error or a start that outran the start budget, `starting` for a start still
 *  in progress — not a failure, read through `isMcpStarting` — and `error` otherwise), the
 *  redacted `message`, and the `http_status` the failure carried (`null` for a pure
 *  transport failure). The three detail fields are absent when the reporting server
 *  omitted them. */
export interface FailedMcpEntry {
  readonly title: string;
  readonly status: string;
  readonly category?: string;
  readonly message?: string;
  readonly http_status?: number | null;
}

/** One worker's failed-list entry as a roster row, or `null` when it is not an object with a
 *  non-empty string title. A missing status reads as `unavailable`; a detail field of the
 *  wrong type is dropped, never coerced. */
function failedMcpEntryOf(entry: unknown): FailedMcpEntry | null {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
  const record = entry as Record<string, unknown>;
  const { title, status, category, message } = record;
  if (typeof title !== 'string' || title === '') return null;
  return {
    title,
    status: typeof status === 'string' ? status : 'unavailable',
    ...(typeof category === 'string' ? { category } : {}),
    ...(typeof message === 'string' ? { message } : {}),
    ...(typeof record.http_status === 'number' || record.http_status === null
      ? { http_status: record.http_status }
      : {}),
  };
}

/**
 * The failed-MCP roster carried by a `GET /api/mcp-status/failed` broadcast report.
 * The query op rides the fleet fan-out primitive, so each worker's own failed list
 * arrives as its per-worker `payload` (opaque on the wire). This unions those lists
 * by title — a server failed on ANY worker is a server the operator must see — and
 * name-sorts the result, tolerating a worker whose payload is absent or malformed
 * (skipped, never a throw: a partial fleet report still yields the roster it can).
 *
 * One record per title carries the whole row, detail fields included: a failure record
 * on any worker wins over a server start still in progress ({@link isMcpStarting}) on
 * another, and otherwise the first-seen record wins.
 */
export function failedMcpsFromReport(result: Omit<FleetResult, 'ok'>): FailedMcpEntry[] {
  const byTitle = new Map<string, FailedMcpEntry>();
  for (const worker of result.results) {
    const payload: unknown = worker.payload;
    if (!Array.isArray(payload)) continue;
    for (const entry of payload) {
      const row = failedMcpEntryOf(entry);
      if (row === null) continue;
      const seen = byTitle.get(row.title);
      if (seen === undefined || (isMcpStarting(seen) && !isMcpStarting(row))) {
        byTitle.set(row.title, row);
      }
    }
  }
  return [...byTitle.values()].sort((a, b) => a.title.localeCompare(b.title));
}
