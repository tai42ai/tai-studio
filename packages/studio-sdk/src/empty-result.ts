/**
 * Whether a run's returned value carries nothing to show: absent or `null`, a blank
 * string, an empty array or an object with no keys. `0` and `false` are values, never
 * empty. The tools feature's result viewer and the observability span detail (its
 * input and its output) read through this rule, so both say "empty" for the same
 * values; the observability runs table's one-line previews do not use it.
 */
export function isEmptyResult(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}
