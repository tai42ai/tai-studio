/** Backend identity and worker-bus fleet/fan-out response schemas. */
import { z } from 'zod';

import { jsonValue } from './shared';

/** `GET /api/backend` — the execution-backend identity, or the absent sentinel
 * (`present: false`, a 200) when no backend plugin is registered. Backend identity
 * is kept distinct from the fleet: the fleet doors ride the app's worker bus and
 * need no backend at all. */
export const backendInfo = z.object({
  present: z.boolean(),
  backend: z.string().nullable(),
  module: z.string().nullable(),
});
export type BackendInfo = z.infer<typeof backendInfo>;

/** The two worker kinds that join the bus: an ASGI `serve` worker or a
 * `backend` runtime process. A drift throws `ApiSchemaError`. */
export const workerKind = z.enum(['serve', 'backend']);
export type WorkerKind = z.infer<typeof workerKind>;

/** The lifecycle state a worker advertises in its presence value: `ready` once its
 * resync has converged, `resyncing` while a boot/reconnect resync runs, `recycling`
 * once it has begun a graceful self-exit. A drift throws `ApiSchemaError`. */
export const workerState = z.enum(['ready', 'resyncing', 'recycling']);
export type WorkerState = z.infer<typeof workerState>;

/** The last op a worker applied, stamped onto its presence row after the terminal
 * reply. `outcome` is the free op-outcome string; `at` is the ISO instant it landed. */
export const workerLastOp = z.object({
  op: z.string(),
  outcome: z.string(),
  at: z.string(),
});
export type WorkerLastOp = z.infer<typeof workerLastOp>;

/**
 * One live worker on the bus — a presence-census row. `name` is the stable slot
 * (`{kind}-{n}`) that doubles as a reload target; `generation` is the monotonic life
 * counter minted with the worker's claim; `kind` tells the two worker kinds apart;
 * `pid` is the process id. `joined_at`/`beat_at` are ISO instants (first-seen and last
 * heartbeat) for the cosmetic seen-since display; `state` is the advertised lifecycle
 * state; `stale` is SERVER-computed from the row's remaining presence TTL against the
 * bus cadence (a quiet row past the freshness bound — reconnecting or dead) and is the
 * only freshness signal a client reads, never a client-side threshold; `last_op` is the
 * worker's last applied op, or `null` before it has applied one.
 */
export const fleetWorker = z.object({
  name: z.string(),
  kind: workerKind,
  pid: z.number(),
  generation: z.number(),
  joined_at: z.string(),
  beat_at: z.string(),
  state: workerState,
  stale: z.boolean(),
  last_op: workerLastOp.nullable(),
});
export type FleetWorker = z.infer<typeof fleetWorker>;

/**
 * `GET /api/fleet/workers` — the live worker fleet from the bus presence census.
 * The census lists ALL subscribed workers (ASGI `serve` workers and backend-runtime
 * processes alike), not only backend workers. A census read that fails surfaces as a
 * loud 500, never a fabricated empty fleet.
 */
export const fleetWorkers = z.object({ workers: z.array(fleetWorker) });
export type FleetWorkers = z.infer<typeof fleetWorkers>;

/**
 * One worker's outcome within a fleet broadcast. `applied`/`failed` are terminal wire
 * replies from a subscriber; `missing`/`departed`/`timed_out` are publisher-computed
 * from the presence census (a silent worker never sends them); `resyncing`/`recycling`/
 * `stale` are the gap outcomes for a row that failed the ready+fresh gate — reported as
 * its own actual condition rather than dropped (`resyncing` converges on its resync,
 * `recycling` is departing, `stale` is a quiet row past the freshness bound carrying no
 * convergence promise).
 */
export const fleetOutcome = z.enum([
  'applied',
  'failed',
  'missing',
  'departed',
  'timed_out',
  'resyncing',
  'recycling',
  'stale',
]);
export type FleetOutcome = z.infer<typeof fleetOutcome>;

/**
 * One worker's result within a {@link fleetResult}. `payload` carries query-op data
 * (opaque to the UI); `error` carries a failed apply's message; `detail` carries the
 * publisher's report text for a computed gap outcome (`missing`/`departed`/`timed_out`/
 * `resyncing`/`recycling`/`stale`). A drift throws `ApiSchemaError`.
 */
export const fleetWorkerResult = z.object({
  name: z.string(),
  outcome: fleetOutcome,
  payload: jsonValue,
  error: z.string().nullable(),
  detail: z.string().nullable(),
});
export type FleetWorkerResult = z.infer<typeof fleetWorkerResult>;

/**
 * The awaited per-worker report of one fleet broadcast. Two honest shapes ride the
 * same schema. Reachable (`reachable: true`): `results` holds one entry per expected
 * worker (the serving worker's own entry included) plus the gap rows, so an unconfirmed
 * sibling is a visible `failed`/`missing`/`departed`/`timed_out`/`resyncing`/`recycling`/
 * `stale` entry, never a silent stale worker. Bus-unreachable (`reachable: false`): the
 * transport failed before any worker could reply, so `results` is empty and only `error`
 * is carried. This is the bare body of `POST /api/fleet/reload-config` and the single-MCP
 * reload; it is also the body the mode-wrapped {@link fleetReportFanout} carries under its
 * `fleet` / `unreachable` modes.
 */
export const fleetResult = z.object({
  op: z.string(),
  reachable: z.boolean(),
  local_only: z.boolean(),
  results: z.array(fleetWorkerResult),
  error: z.string().nullable(),
});
export type FleetResult = z.infer<typeof fleetResult>;

/**
 * `POST /api/fleet/reload-config` — soft-restart the fleet and report per-worker. The
 * serving worker applies its own reload first, then broadcasts; the returned report
 * names every worker's outcome. A failed local apply does not abort the broadcast, so
 * the report is embedded even on the convergence-failure path.
 */
export const fleetReloadResult = fleetResult;
export type FleetReloadResult = z.infer<typeof fleetReloadResult>;

/**
 * The mode-wrapped fan-out summary a mutation embeds under its `fanout` field. Three
 * honest modes, discriminated on `mode`:
 *   - `local-only` — the broadcast reached no sibling (a lone worker / no bus), a
 *     benign single-process note.
 *   - `fleet` — a reachable multi-worker broadcast; carries the full {@link
 *     fleetResult} so an unconfirmed sibling is visible.
 *   - `unreachable` — the bus itself could not be reached; carries the
 *     bus-unreachable {@link fleetResult} (no worker list, only `error`).
 *
 * Every mutation whose response embeds this parses it EXPLICITLY: zod's default
 * unknown-key stripping would otherwise silently drop the field, hiding a failed
 * propagation from the shared fleet-report handler. A drift throws `ApiSchemaError`.
 */
export const fleetReportFanout = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('local-only'), note: z.string() }),
  fleetResult.extend({ mode: z.literal('fleet') }),
  fleetResult.extend({ mode: z.literal('unreachable') }),
]);
export type FleetReportFanout = z.infer<typeof fleetReportFanout>;
