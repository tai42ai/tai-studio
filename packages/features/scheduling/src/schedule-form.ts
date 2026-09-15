/**
 * Pure model, validation, and submit-body assembly for the add-schedule form —
 * no React, so the branchy parts are unit-testable apart from the dialog.
 */
import type { StateBinding } from '@tai42/api-client';
import { errorMessage } from '@tai42/studio-sdk';

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

/** The skeleton's add-schedule request body. */
export interface ScheduleBody {
  tool_name: string;
  tool_kwargs: Record<string, unknown>;
  schedule_kwargs: Record<string, unknown>;
  state_binding?: StateBinding | null;
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
}

/**
 * Assemble the add-schedule body. The optional subject is either fully specified
 * (target + kind + key) or omitted; a partial subject is a loud validation failure.
 */
export function buildScheduleBody(
  v: ScheduleBodyInput,
  parsedKwargs: Record<string, unknown>,
): { ok: true; body: ScheduleBody } | { ok: false; subjectError: string } {
  const subjectTouched =
    v.subjectTarget !== '' || v.subjectKind.trim() !== '' || v.subjectKey.trim() !== '';
  const scheduleKwargs: Record<string, unknown> = {
    backend_schedule: v.mode === 'interval' ? v.intervalValue : v.cron.trim(),
    backend_schedule_name: v.name.trim(),
  };
  const toolKwargs: Record<string, unknown> = { ...parsedKwargs };
  if (subjectTouched) {
    const separator = v.subjectTarget.indexOf(':');
    if (separator < 0 || v.subjectKind.trim() === '' || v.subjectKey.trim() === '') {
      return { ok: false, subjectError: 'A subject needs a target, a kind, and a key.' };
    }
    // `create_schedule` reads and validates the subject as an ordinary tool kwarg; the
    // worker stamps it as the fire's state context (never a schedule-kwarg / internal
    // reserved stamp).
    toolKwargs.subject = {
      target_kind: v.subjectTarget.slice(0, separator),
      target_name: v.subjectTarget.slice(separator + 1),
      kind: v.subjectKind.trim(),
      key: v.subjectKey.trim(),
    };
  }
  return {
    ok: true,
    body: {
      tool_name: v.tool,
      tool_kwargs: toolKwargs,
      schedule_kwargs: scheduleKwargs,
      // OMIT state_binding unless the author bound a state.
      ...(v.stateBinding !== null ? { state_binding: v.stateBinding } : {}),
    },
  };
}
