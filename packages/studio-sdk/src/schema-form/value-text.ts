/**
 * The text a form shows for a value it does not edit: a review step's readback of an
 * entered value, and a display slot's current value.
 */

/** The words a readback draws for a yes/no value; an unset one reads "Yes" / "No". */
export interface ReadbackWords {
  readonly trueLabel?: string | null;
  readonly falseLabel?: string | null;
}

/** An arbitrary value as display text: primitives direct, objects/arrays as JSON. */
function toText(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    default:
      return JSON.stringify(value);
  }
}

/** An entered value as readback text: `—` when unfilled or an empty list, a list's
 * entries joined by `, `, a yes/no value in the field's own words, anything else as
 * {@link toText} draws it. */
export function formatReadbackValue(value: unknown, words: ReadbackWords | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map(toText).join(', ');
  if (typeof value === 'boolean')
    return value ? (words?.trueLabel ?? 'Yes') : (words?.falseLabel ?? 'No');
  return toText(value);
}

/** A display slot's current value as text (a computed total is a number); absent or
 * `null` (the slot unfilled) → `undefined`. */
export function slotValueText(
  value: string | number | boolean | null | undefined,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}
