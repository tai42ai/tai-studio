/**
 * The single evaluator for a property's `visibleWhen` predicate — a static,
 * declarative field-visibility rule. The renderer (`ObjectFields`) and the
 * validator both call it so a field shown by the form is exactly the field validated at
 * submit, and a hidden field is neither rendered nor required. It reads only sibling
 * values already in the object; it never calls a consumer handler.
 *
 * A malformed predicate degrades to VISIBLE: the send-time server validation rejects a
 * malformed predicate loudly, so one never reaches a well-formed render, and showing a
 * field is the safe non-hiding default (a hidden-by-accident required field would dead-
 * end a form).
 */
import type { JsonSchema } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A value is "empty" for a `notEmpty` test: absent/null, a blank string, an empty array. */
function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Whether a property carrying `schema.visibleWhen` is visible against the current
 * `values` of its enclosing object. Absent predicate ⇒ always visible. Exactly one of
 * `equals`/`in`/`notEmpty` must be present; otherwise the predicate is malformed and the
 * field stays visible.
 */
export function isFieldVisible(schema: JsonSchema, values: Record<string, unknown>): boolean {
  const predicate: unknown = schema.visibleWhen;
  if (!isRecord(predicate) || typeof predicate.field !== 'string') return true;
  const current = values[predicate.field];

  const inList = predicate.in;
  const hasEquals = 'equals' in predicate;
  const hasIn = Array.isArray(inList);
  const hasNotEmpty = predicate.notEmpty === true;
  if (Number(hasEquals) + Number(hasIn) + Number(hasNotEmpty) !== 1) return true;

  if (hasEquals) return current === predicate.equals;
  if (hasIn) return (inList as readonly unknown[]).some((candidate) => candidate === current);
  return !isEmptyValue(current);
}
