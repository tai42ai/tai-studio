/**
 * The shared fleet-report handler — the single interpreter of a config mutation's
 * fleet broadcast. Every mutation surface (connector, backup, mcp-config, env,
 * extensions, single-MCP reload, fleet reload) routes its broadcast report through
 * this one function so a FAILED propagation is never invisible: an unconfirmed
 * sibling (any non-`applied` outcome the operation's recycle roll did not settle) or an
 * unreachable bus becomes an explicit summary the UI renders as a loud, user-visible
 * state — never a faked success on a worker that did not converge.
 *
 * A mutation embeds its broadcast in one of three shapes: the mode-wrapped
 * {@link FleetReportFanout} (`fanout` field), the fleet soft restart's
 * {@link FleetReloadResult}, or the bare {@link FleetResult} (the single-MCP reload,
 * deregister and tool reload/remove bodies). Each normalizes to a
 * {@link FleetReportSummary} through the functions here; the SDK's `FleetReport`
 * component renders the summary.
 */
import type {
  AwaitingWorker,
  FleetOutcome,
  FleetReloadResult,
  FleetReportFanout,
  FleetResult,
  RecycleEntry,
  RecycleRoll,
} from './schemas';

/** The outcome of a worker's broadcast row that did not confirm `applied`. */
export type FleetFailureOutcome = Exclude<FleetOutcome, 'applied'>;

/** One worker that failed to converge, with the report's message for it. */
export interface FleetWorkerFailure {
  readonly name: string;
  readonly outcome: FleetFailureOutcome;
  /** The failed apply's `error`, or the publisher's computed-outcome `detail`. */
  readonly message: string | null;
  /**
   * True when the reply states its reload was refused at its epoch build
   * (the `withheld` {@link AwaitingRestartReading}): trying again may be refused the same way
   * until the stored config is fixed.
   */
  readonly withheld: boolean;
}

/**
 * The interpreted state of one broadcast.
 *   - `converged` — the bus was reached and every worker applied or was settled by the
 *     operation's roll (or the change was local-only on a lone worker). The caller renders its own success; the report
 *     needs no loud state.
 *   - `degraded` — the bus was reached but one or more workers did not confirm and the
 *     operation's roll did not settle them; the named `failures` are stale/unreached
 *     siblings the operator must see.
 *   - `unreachable` — the bus itself could not be reached, so no sibling was told;
 *     `error` carries the transport failure.
 */
export type FleetReportStatus = 'converged' | 'degraded' | 'unreachable';

/**
 * What the reply says about a worker awaiting a respawn:
 *   - `restartable` — it carries the worker's broadcast row or recycle line, and neither
 *     states a refused build, so a restart applies its settings.
 *   - `withheld` — its reload was refused at its epoch build: the stored config did not build
 *     on it, so the operation left it running on its current config and a restart may fail
 *     the same way until that config is fixed. Its broadcast row is `failed` with a
 *     `discarded` payload, or its recycle line is `withheld`.
 *   - `unstated` — it carries neither a row nor a line for the worker (an upgrade-all's reply
 *     has no rows, nor has a lone worker's `local-only` fan-out), so it does not say which of
 *     the other two the worker is.
 */
export type AwaitingRestartReading = 'restartable' | 'withheld' | 'unstated';

/**
 * One worker an operation names as still awaiting a respawn: its recycle-class keys
 * changed since the worker bound them (at boot, or when the plugin that declares them was
 * loaded), and they take effect only when it is respawned.
 */
export interface FleetWorkerAwaitingRespawn {
  readonly name: string;
  readonly keys: readonly string[];
  readonly reading: AwaitingRestartReading;
}

export interface FleetReportSummary {
  readonly status: FleetReportStatus;
  /** The single-worker `local-only` note, when the broadcast reached no sibling. */
  readonly note: string | null;
  /** The workers that did not apply — empty unless `status` is `degraded`. */
  readonly failures: readonly FleetWorkerFailure[];
  /** The bus-unreachable transport error — non-null only when `unreachable`. */
  readonly error: string | null;
  /** The workers the operation names as still awaiting a respawn. */
  readonly awaiting: readonly FleetWorkerAwaitingRespawn[];
  /** The workers whose roll line is `self-deferred`: a restart the reply cannot confirm. */
  readonly restartsPending: readonly string[];
  /**
   * The workers the roll settled without a confirmed fresh life whose broadcast row did not
   * confirm `applied`: the reply states no restart is outstanding, not that they applied.
   */
  readonly reloadsUnconfirmed: readonly string[];
  /**
   * The config store's error releasing its exclusive write span after the persist, or
   * `null` when it released. Non-null means the change landed but the store may hold
   * the span until the writer process exits, so a later write can block or be refused.
   */
  readonly spanReleaseError: string | null;
}

/**
 * True when a summary describes a failure the operator must be shown: a propagation
 * that did not converge, or a write span the store did not release.
 */
export function isFleetReportFailure(summary: FleetReportSummary | null): boolean {
  return summary !== null && (summary.status !== 'converged' || summary.spanReleaseError !== null);
}

/**
 * Interpret a bare {@link FleetResult} (the single-MCP reload, deregister, and tool
 * reload/remove bodies). An unreachable bus is `unreachable`; a reachable report with
 * any non-`applied` worker is `degraded` (those workers named); otherwise `converged`.
 * A bare report states no verdict on workers awaiting a respawn, so `awaiting` is empty.
 */
export function summarizeFleetResult(result: Omit<FleetResult, 'ok'>): FleetReportSummary {
  return summarizeWith(result, [], NO_ROLL, null);
}

/**
 * Interpret a fleet soft restart's {@link FleetReloadResult}: its per-worker report
 * judged as {@link summarizeFleetResult} judges it, with `awaiting` the operation's own
 * `awaiting_respawn` verdict. Each worker's reload payload states the keys that worker
 * found moved before the operation's recycle roll ran; the roll restarts those workers,
 * so only the verdict says which still await a respawn. Its rows and its roll's lines
 * give the reading of each ({@link AwaitingRestartReading}), and the roll settles the
 * workers whose rows did not confirm ({@link settledWorkers}).
 */
export function summarizeFleetReload(reply: Omit<FleetReloadResult, 'ok'>): FleetReportSummary {
  return summarizeWith(reply, reply.awaiting_respawn, reply.recycle ?? NO_ROLL, null);
}

/** What a roll states of each worker: its lines, and the workers it left running as clean. */
type RollStatements = NonNullable<FleetFanoutReply['recycle']>;

const NO_ROLL: RollStatements = { recycle: [], skipped: [] };

/** Whether a broadcast row states that its worker's reload was refused at its epoch build. */
function statesDiscardedBuild(row: FleetResult['results'][number]): boolean {
  if (row.outcome !== 'failed') return false;
  const payload = row.payload;
  return (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as Record<string, unknown>).status === 'discarded'
  );
}

/**
 * The workers the reply states as withheld, the one reading of it: a broadcast row states
 * a discarded build, or a recycle line is `withheld`.
 */
function withheldWorkers(
  rows: FleetResult['results'],
  recycle: readonly RecycleEntry[],
): ReadonlySet<string> {
  return new Set([
    ...rows.filter(statesDiscardedBuild).map((row) => row.name),
    ...recycle.filter((line) => line.status === 'withheld').map((line) => line.name),
  ]);
}

/**
 * The workers whose latest statement is the roll's and leaves nothing to converge, the one
 * reading of it, whatever their broadcast rows say: a line `recycled` or `self-deferred`, or a
 * worker named in `skipped`. A discarded build with no moved keys is skipped on that row alone,
 * with no later statement, so its row still stands: the stored configuration did not build there.
 */
function settledWorkers(rows: FleetResult['results'], roll: RollStatements): ReadonlySet<string> {
  const discarded = new Set(rows.filter(statesDiscardedBuild).map((row) => row.name));
  return new Set([
    ...roll.recycle
      .filter((line) => line.status === 'recycled' || line.status === 'self-deferred')
      .map((line) => line.name),
    ...roll.skipped.filter((name) => !discarded.has(name)),
  ]);
}

function awaitingWorkers(
  verdict: readonly AwaitingWorker[],
  rows: FleetResult['results'],
  recycle: readonly RecycleEntry[],
): FleetWorkerAwaitingRespawn[] {
  const withheld = withheldWorkers(rows, recycle);
  const stated = new Set([...rows, ...recycle].map((statement) => statement.name));
  return verdict.map((worker) => ({
    name: worker.name,
    keys: worker.keys,
    reading: withheld.has(worker.name)
      ? 'withheld'
      : stated.has(worker.name)
        ? 'restartable'
        : 'unstated',
  }));
}

/** The worker lines of one status, by name. */
function linesWith(roll: RollStatements, status: string): string[] {
  return roll.recycle.filter((line) => line.status === status).map((line) => line.name);
}

function summarizeWith(
  result: Omit<FleetResult, 'ok'>,
  verdict: readonly AwaitingWorker[],
  roll: RollStatements,
  spanReleaseError: string | null,
): FleetReportSummary {
  const awaiting = awaitingWorkers(verdict, result.results, roll.recycle);
  const restartsPending = linesWith(roll, 'self-deferred');
  if (!result.reachable) {
    return {
      status: 'unreachable',
      note: null,
      failures: [],
      error: result.error,
      awaiting,
      restartsPending,
      reloadsUnconfirmed: [],
      spanReleaseError,
    };
  }
  const withheld = withheldWorkers(result.results, roll.recycle);
  const settled = settledWorkers(result.results, roll);
  const recycled = new Set(linesWith(roll, 'recycled'));
  const unconfirmed = result.results.filter((entry) => entry.outcome !== 'applied');
  const failures: FleetWorkerFailure[] = unconfirmed
    .filter((entry) => !settled.has(entry.name))
    .map((entry) => ({
      name: entry.name,
      outcome: entry.outcome as FleetFailureOutcome,
      message: entry.error ?? entry.detail ?? null,
      withheld: withheld.has(entry.name),
    }));
  return {
    status: failures.length > 0 ? 'degraded' : 'converged',
    note: null,
    failures,
    error: null,
    awaiting,
    restartsPending,
    reloadsUnconfirmed: unconfirmed
      .map((entry) => entry.name)
      .filter((name) => settled.has(name) && !recycled.has(name)),
    spanReleaseError,
  };
}

/**
 * The slice of a mutation's reply its fleet report reads, under the reply's own field names.
 * A reply states only what its operation has: `fanout` is absent or `null` when it reloaded
 * no manifest, `awaiting_respawn` absent when it states no verdict, and `recycle` absent or
 * `null` when it ran no roll.
 */
export interface FleetFanoutReply {
  readonly fanout?: FleetReportFanout | null;
  readonly awaiting_respawn?: readonly AwaitingWorker[];
  /** The roll the operation ran. A reply carrying its roll's fields flat passes itself here. */
  readonly recycle?: Pick<RecycleRoll, 'recycle' | 'skipped'> | null;
  readonly span_release_error: string | null;
}

/**
 * Interpret a mutation's reply. A reply with no fan-out, no unreleased span and no worker
 * awaiting a respawn yields `null`: there is nothing to report. A `local-only` fan-out is
 * `converged` with its note; `fleet`/`unreachable` carry a bare {@link FleetResult} judged
 * as {@link summarizeFleetResult} judges it. `awaiting_respawn` is the operation's own
 * verdict: it knows whether its recycle roll carried a worker's moved env, so its per-worker
 * rows are never re-read for it. The roll's lines, with the broadcast rows, give the reading of
 * each worker it names ({@link AwaitingRestartReading}), and the roll settles the workers whose
 * rows did not confirm ({@link settledWorkers}). A non-null `span_release_error` makes the summary a failure
 * ({@link isFleetReportFailure}) whatever the fan-out reports.
 */
export function summarizeFleetFanout(reply: FleetFanoutReply): FleetReportSummary | null {
  const { fanout, span_release_error: spanReleaseError } = reply;
  const verdict = reply.awaiting_respawn ?? [];
  const roll = reply.recycle ?? NO_ROLL;
  if (fanout === null || fanout === undefined || fanout.mode === 'local-only') {
    const note = fanout?.note ?? null;
    if (note === null && spanReleaseError === null && verdict.length === 0) return null;
    return {
      status: 'converged',
      note,
      failures: [],
      error: null,
      awaiting: awaitingWorkers(verdict, [], roll.recycle),
      restartsPending: linesWith(roll, 'self-deferred'),
      reloadsUnconfirmed: [],
      spanReleaseError,
    };
  }
  return summarizeWith(fanout, verdict, roll, spanReleaseError);
}
