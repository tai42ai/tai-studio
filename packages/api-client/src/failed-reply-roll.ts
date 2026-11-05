/**
 * The recycle roll a failed reply carries. A config change whose propagation failed after its
 * roll ran answers with the error beside the roll's fields: a fleet broadcast's failure with
 * `report` when its cause is operator-facing and without it when the cause is masked, a marketplace
 * failure with the roll's fields alone, under any status. This module is the one reader of them:
 * the transport refuses a reply whose roll does not match its schema, and every door reads a
 * well-formed one through {@link failedReplyRoll}.
 */
import type { z } from 'zod';

import { ApiError, ApiSchemaError } from './errors';
import { type FleetReportSummary, summarizeFleetFanout } from './fleet-report';
import { applyResponse } from './generated/openapi-schemas';
import { fleetResult, type RecycleRoll } from './schemas/fleet';

const rollFields = applyResponse.pick({
  awaiting_respawn: true,
  recycle: true,
  roll_deferred: true,
  roll_deferred_to: true,
});

const failedReplyBody = rollFields.extend({ report: fleetResult.optional() });
type FailedReplyBody = z.infer<typeof failedReplyBody>;

/** What a failed reply states about the change's roll, ready for the fleet outcome report. */
export interface FailedReplyRoll {
  /**
   * The fold of the reply's fleet report and its workers awaiting a respawn. A reply without
   * `report` has no broadcast rows, so its summary states no failed worker and no
   * propagation result; a surface never reads a `converged` status here as a success.
   */
  readonly summary: FleetReportSummary | null;
  /** The roll the change ran, or `null` when it ran none. */
  readonly recycle: RecycleRoll | null;
}

function carriesRoll(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  return Object.keys(rollFields.shape).some((field) => field in body);
}

/** Refuse a failed reply from `endpoint` whose roll does not match its schema. */
export function checkFailedReplyRoll(endpoint: string, body: unknown): void {
  if (!carriesRoll(body)) return;
  const parsed = failedReplyBody.safeParse(body);
  if (!parsed.success) throw new ApiSchemaError(endpoint, parsed.error.issues);
}

function foldRoll(body: FailedReplyBody): FailedReplyRoll {
  const { report, recycle, awaiting_respawn } = body;
  const fanout = report === undefined ? null : { ...report, mode: fanoutMode(report.reachable) };
  return {
    summary: summarizeFleetFanout({ fanout, awaiting_respawn, recycle, span_release_error: null }),
    recycle,
  };
}

function fanoutMode(reachable: boolean): 'fleet' | 'unreachable' {
  return reachable ? 'fleet' : 'unreachable';
}

/**
 * The roll the failed reply behind `error` carries: an `ApiError` whose body has roll fields
 * answers it, parsed (a malformed roll throws). Any other error, or a body without roll fields,
 * answers `null`.
 */
export function failedReplyRoll(error: unknown): FailedReplyRoll | null {
  if (!(error instanceof ApiError) || !carriesRoll(error.body)) return null;
  return foldRoll(failedReplyBody.parse(error.body));
}
