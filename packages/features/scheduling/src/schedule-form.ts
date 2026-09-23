/**
 * Pure model, validation, and submit-body assembly for the add-schedule form —
 * no React, so the branchy parts are unit-testable apart from the dialog.
 */
import type { StateBinding, TemplatedText } from '@tai42/api-client';
import { buildSubject, errorMessage } from '@tai42/studio-sdk';

export type ScheduleMode = 'interval' | 'crontab';

export const MODE_OPTIONS = [
  { value: 'interval', label: 'Interval' },
  { value: 'crontab', label: 'Crontab' },
] as const;

/**
 * Parse the kwargs textarea into a JSON object. A blank field means "no kwargs"
 * (`{}`). Anything that is not a JSON object (array, scalar, malformed) is a
 * validation failure carrying a human message — never silently coerced.
 */
export function parseKwargs(
  raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return { ok: false, message: `Kwargs must be valid JSON: ${errorMessage(error)}` };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, message: 'Kwargs must be a JSON object.' };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

/** The form values validation reads. */
export interface ScheduleFormValues {
  readonly name: string;
  readonly tool: string | null;
  readonly mode: ScheduleMode;
  readonly interval: string;
  readonly cron: string;
}

/** The derived validation flags the dialog shows and the submit guard reads. */
export interface ScheduleValidation {
  readonly nameMissing: boolean;
  readonly toolMissing: boolean;
  readonly intervalInvalid: boolean;
  readonly cronMissing: boolean;
  readonly intervalValue: number;
}

/** Derive the field-level validation flags from the current form values. */
export function validateScheduleForm(v: ScheduleFormValues): ScheduleValidation {
  const nameMissing = v.name.trim() === '';
  const toolMissing = v.tool === null || v.tool === '';
  const intervalValue = Number(v.interval);
  const intervalInvalid =
    v.mode === 'interval' &&
    (v.interval.trim() === '' || !Number.isFinite(intervalValue) || intervalValue <= 0);
  const cronMissing = v.mode === 'crontab' && v.cron.trim() === '';
  return { nameMissing, toolMissing, intervalInvalid, cronMissing, intervalValue };
}

/**
 * The suffix of the backend's schedule vehicle. A tool carrying the backend
 * `schedule_task` extension registers a `<tool>_schedule_task` branch that takes the
 * cadence as `backend_schedule` (an interval in seconds or a crontab string) plus
 * `backend_schedule_name`; the create door dispatches THAT branch to register the
 * recurring schedule, so the request names it rather than the base tool.
 */
export const SCHEDULE_BRANCH_SUFFIX = '_schedule_task';

/** The schedule-vehicle name for `tool`, idempotent if it is already the vehicle. */
export function scheduleVehicle(tool: string): string {
  return tool.endsWith(SCHEDULE_BRANCH_SUFFIX) ? tool : `${tool}${SCHEDULE_BRANCH_SUFFIX}`;
}

/** The four door-contract jqs a schedule may carry, authored as templated text. */
export interface ScheduleDoorContract {
  readonly startExpr: TemplatedText | null;
  readonly cancelExpr: TemplatedText | null;
  readonly resumeExpr: TemplatedText | null;
  readonly extrasExpr: TemplatedText | null;
}

/** The skeleton's add-schedule request body. The door jqs and the execution key are
 * top-level create params; a contract jq requires a key, so a set jq with no key is a
 * loud validation failure before the request fires. */
export interface ScheduleBody {
  tool_name: string;
  tool_kwargs: Record<string, unknown>;
  schedule_kwargs: Record<string, unknown>;
  execution_key?: string | null;
  state_binding?: StateBinding | null;
  start_expr?: TemplatedText | null;
  cancel_expr?: TemplatedText | null;
  resume_expr?: TemplatedText | null;
  extras_expr?: TemplatedText | null;
}

/** The values needed to assemble the submit body (tool is non-null past the guards). */
export interface ScheduleBodyInput {
  readonly tool: string;
  readonly name: string;
  readonly mode: ScheduleMode;
  readonly intervalValue: number;
  readonly cron: string;
  readonly subjectTarget: string;
  readonly subjectKind: string;
  readonly subjectKey: string;
  readonly stateBinding: StateBinding | null;
  readonly executionKey: string;
  readonly contract: ScheduleDoorContract;
}

/** Whether any of the four door-contract jqs is set. */
function hasDoorContract(contract: ScheduleDoorContract): boolean {
  return [contract.startExpr, contract.cancelExpr, contract.resumeExpr, contract.extrasExpr].some(
    (expr) => expr !== null,
  );
}

/** The door-contract wire fields, each emitted only when its jq is set. */
function doorContractBody(contract: ScheduleDoorContract): Partial<ScheduleBody> {
  return {
    ...(contract.startExpr !== null ? { start_expr: contract.startExpr } : {}),
    ...(contract.cancelExpr !== null ? { cancel_expr: contract.cancelExpr } : {}),
    ...(contract.resumeExpr !== null ? { resume_expr: contract.resumeExpr } : {}),
    ...(contract.extrasExpr !== null ? { extras_expr: contract.extrasExpr } : {}),
  };
}

/**
 * Assemble the add-schedule body. The optional subject is either fully specified
 * (target + kind + key) or omitted; a partial subject is a loud validation failure.
 * A door-contract jq requires an execution key (the recurring fire has no live
 * caller to rebind a park under), so a set jq with no key is refused loudly, mirroring
 * the server's own rule.
 */
export function buildScheduleBody(
  v: ScheduleBodyInput,
  parsedKwargs: Record<string, unknown>,
):
  | { ok: true; body: ScheduleBody }
  | { ok: false; field: 'subject' | 'executionKey'; message: string } {
  const scheduleKwargs: Record<string, unknown> = {
    backend_schedule: v.mode === 'interval' ? v.intervalValue : v.cron.trim(),
    backend_schedule_name: v.name.trim(),
  };
  const toolKwargs: Record<string, unknown> = { ...parsedKwargs };
  const subject = buildSubject({
    target: v.subjectTarget,
    kind: v.subjectKind,
    key: v.subjectKey,
  });
  if (!subject.ok) {
    return { ok: false, field: 'subject', message: subject.message };
  }
  if (subject.subject !== null) {
    // `create_schedule` reads and validates the subject as an ordinary tool kwarg; the
    // worker stamps it as the fire's state context (never a schedule-kwarg / internal
    // reserved stamp).
    toolKwargs.subject = subject.subject;
  }
  const executionKey = v.executionKey.trim();
  if (hasDoorContract(v.contract) && executionKey === '') {
    return {
      ok: false,
      field: 'executionKey',
      message: 'A door-contract jq (start / cancel / resume / extras) needs an execution key.',
    };
  }
  return {
    ok: true,
    body: {
      tool_name: scheduleVehicle(v.tool),
      tool_kwargs: toolKwargs,
      schedule_kwargs: scheduleKwargs,
      // Each optional field is sent only when set — an absent key leaves the server default.
      ...(executionKey !== '' ? { execution_key: executionKey } : {}),
      ...(v.stateBinding !== null ? { state_binding: v.stateBinding } : {}),
      ...doorContractBody(v.contract),
    },
  };
}
