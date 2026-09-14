/**
 * The `policy_data` key/value model for the policy section: the authored-fields
 * contract, the row round-trip helpers, and the pure field computation that turns
 * the section's edit state into the create/edit request's policy fields.
 */
import type { TemplatedText } from '@tai42/api-client';

/**
 * The subset of the create/edit body the policy section owns. An ABSENT field is not
 * authored (the PATCH-style PUT preserves its stored value); an explicit `null`
 * is an EXPLICIT CLEAR, emitted only by the edit-mode "Remove condition" / "Clear
 * policy data" affordances — an emptied input alone never clears.
 */
export interface PolicyFields {
  policy_data?: Record<string, unknown> | null;
  condition?: TemplatedText | null;
}

/** Pre-fill for the edit dialog (from the key's `tokens-payload` record). */
export interface PolicySeed {
  readonly policy_data?: unknown;
  readonly condition?: TemplatedText | null;
}

/** One `policy_data` editor row. */
export interface PolicyRow {
  readonly key: string;
  readonly value: string;
}

/** A non-null, non-array object — the shape a stored `policy_data` takes. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Parse a cell value as JSON when it can be (numbers/bools/objects), else keep the string. */
export function parseCellValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

/** Collapse the editor rows into a JSON object, dropping rows with a blank key. */
export function rowsToObject(rows: readonly PolicyRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key.length === 0) continue;
    out[key] = parseCellValue(row.value);
  }
  return out;
}

/** Seed editor rows from a stored JSON object (stringifying non-string values). */
export function objectToRows(value: unknown): PolicyRow[] {
  if (!isPlainObject(value)) return [];
  return Object.entries(value).map(([key, raw]) => ({
    key,
    value: typeof raw === 'string' ? raw : JSON.stringify(raw),
  }));
}

/**
 * The authored policy fields for the section's current edit state. An UNTOUCHED
 * field re-emits the stored value BYTE-FOR-BYTE (via OMIT for the condition, and the
 * verbatim-seed branch for policy data): the row form cannot distinguish a stored
 * string `"7"` from the number `7`, so re-serializing an untouched field would
 * silently coerce a stored value's JSON type. An explicit clear emits `null`.
 */
export function computePolicyFields(input: {
  readonly policyDataCleared: boolean;
  readonly policyDataEdited: boolean;
  readonly seededPolicyDataValue: Record<string, unknown> | undefined;
  readonly policyRows: readonly PolicyRow[];
  readonly conditionCleared: boolean;
  readonly conditionEdited: boolean;
  readonly condition: TemplatedText | null;
}): PolicyFields {
  const out: PolicyFields = {};

  if (input.policyDataCleared) {
    out.policy_data = null;
  } else if (input.policyDataEdited) {
    const policyData = rowsToObject(input.policyRows);
    if (Object.keys(policyData).length > 0) out.policy_data = policyData;
  } else if (input.seededPolicyDataValue !== undefined) {
    // Pristine editor in edit mode: re-emit the stored object VERBATIM so a save
    // that never touched policy data cannot coerce a stored value's JSON type.
    out.policy_data = input.seededPolicyDataValue;
  }

  if (input.conditionCleared) {
    out.condition = null;
  } else if (input.conditionEdited) {
    // The control keeps content XOR id and preserves untouched kwargs verbatim, so
    // the emitted value is exactly what the author sees.
    if (input.condition !== null) out.condition = input.condition;
  }
  // Untouched: OMIT (the PATCH-style PUT preserves the stored condition byte-for-byte).
  return out;
}
