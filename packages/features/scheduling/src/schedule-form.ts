/**
 * Pure model, validation, and submit-body assembly for the add-schedule form —
 * no React, so the branchy parts are unit-testable apart from the dialog.
 */
import type { ScheduleCreate, StateBinding, TemplatedText } from '@tai42/api-client';
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
  readonly cronInvalid: boolean;
  readonly intervalValue: number;
}

/** The field error a cron expression of the wrong length shows. */
export const CRON_FIELDS_MESSAGE =
  'Use 5 fields (minute hour day-of-month month day-of-week), or 6 with a leading seconds field.';

/** The five crontab fields the typed cadence carries. */
export interface CronFields {
  readonly minute: string;
  readonly hour: string;
  readonly day_of_month: string;
  readonly month_of_year: string;
  readonly day_of_week: string;
}

/**
 * Split a typed cron expression into the five crontab fields: 5 whitespace-separated
 * fields map in order; 6 drop the leading seconds field; any other count is the field error.
 * The served `CrontabCadence` carries the fields only, so the expression is split here.
 */
export function splitCronExpression(
  expr: string,
): { ok: true; fields: CronFields } | { ok: false; message: string } {
  let parts = expr
    .trim()
    .split(/\s+/)
    .filter((part) => part !== '');
  if (parts.length === 6) parts = parts.slice(1);
  const [minute, hour, dayOfMonth, monthOfYear, dayOfWeek] = parts;
  if (
    parts.length !== 5 ||
    minute === undefined ||
    hour === undefined ||
    dayOfMonth === undefined ||
    monthOfYear === undefined ||
    dayOfWeek === undefined
  ) {
    return { ok: false, message: CRON_FIELDS_MESSAGE };
  }
  return {
    ok: true,
    fields: {
      minute,
      hour,
      day_of_month: dayOfMonth,
      month_of_year: monthOfYear,
      day_of_week: dayOfWeek,
    },
  };
}

/** Whether any field-level validation flag blocks the submit. */
export function hasFieldError(v: ScheduleValidation): boolean {
  return v.nameMissing || v.toolMissing || v.intervalInvalid || v.cronMissing || v.cronInvalid;
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
  const cronInvalid = v.mode === 'crontab' && !cronMissing && !splitCronExpression(v.cron).ok;
  return { nameMissing, toolMissing, intervalInvalid, cronMissing, cronInvalid, intervalValue };
}

/** The four door-contract jqs a schedule may carry, authored as templated text. */
export interface ScheduleDoorContract {
  readonly startExpr: TemplatedText | null;
  readonly cancelExpr: TemplatedText | null;
  readonly resumeExpr: TemplatedText | null;
  readonly extrasExpr: TemplatedText | null;
}

/** The add-schedule request body: the served `ScheduleCreate` document. The door jqs and the
 * execution key are top-level create params; a contract jq requires a key, so a set jq with no
 * key is a loud validation failure before the request fires. */
export type ScheduleBody = ScheduleCreate;

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
 * Assemble the add-schedule body: the BASE tool (the server resolves the backend's schedule
 * vehicle), its kwargs, the typed cadence — `{kind: 'interval', every}` or the five crontab
 * fields split from the typed expression — and the schedule name. The optional subject is
 * either fully specified (target + kind + key) and sent as the top-level door field (the
 * fire's state context, never a tool argument), or omitted; a partial subject is a loud
 * validation failure. A door-contract jq requires an execution key (the recurring fire has no
 * live caller to rebind a park under), so a set jq with no key is refused loudly, mirroring
 * the server's own rule.
 */
export function buildScheduleBody(
  v: ScheduleBodyInput,
  parsedKwargs: Record<string, unknown>,
):
  | { ok: true; body: ScheduleBody }
  | { ok: false; field: 'subject' | 'executionKey' | 'cron'; message: string } {
  let cadence: NonNullable<ScheduleBody['cadence']>;
  if (v.mode === 'interval') {
    cadence = { kind: 'interval', every: v.intervalValue };
  } else {
    const split = splitCronExpression(v.cron);
    if (!split.ok) return { ok: false, field: 'cron', message: split.message };
    cadence = { kind: 'crontab', ...split.fields };
  }
  const subject = buildSubject({
    target: v.subjectTarget,
    kind: v.subjectKind,
    key: v.subjectKey,
  });
  if (!subject.ok) {
    return { ok: false, field: 'subject', message: subject.message };
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
      tool_name: v.tool,
      tool_kwargs: { ...parsedKwargs },
      cadence,
      schedule_name: v.name.trim(),
      // Each optional field is sent only when set — an absent key leaves the server default.
      ...(subject.subject !== null ? { subject: subject.subject } : {}),
      ...(executionKey !== '' ? { execution_key: executionKey } : {}),
      ...(v.stateBinding !== null ? { state_binding: v.stateBinding } : {}),
      ...doorContractBody(v.contract),
    },
  };
}
