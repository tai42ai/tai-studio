/**
 * The render-kwargs model behind `TemplatedTextField`: the row shape, the
 * round-trip between stored kwargs and editable rows, and the normalized
 * `TemplatedText` value the field emits. Pure — no React.
 */
import type { TemplatedText } from '@tai42/api-client';

/** Whether the value's source is inline authored text or a stored template id. */
export type Mode = 'inline' | 'stored';

export interface KwargRow {
  readonly key: string;
  readonly value: string;
  /**
   * The stored value this row was seeded from, kept so an UNTOUCHED row re-emits it
   * BYTE-FOR-BYTE: the row form cannot tell a stored string `"7"` from the number `7`,
   * so re-parsing an untouched row would silently coerce the stored type. `undefined`
   * for a row the author added.
   */
  readonly original?: unknown;
}

/** The row's canonical string form, matched against `value` to detect an untouched row. */
export function stringifyRowValue(raw: unknown): string {
  return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

/** Parse a cell as JSON when it can be (numbers/bools/objects), else keep the string. */
export function parseCellValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

/** Collapse the kwargs rows into an object, dropping rows with a blank key. */
export function rowsToObject(rows: readonly KwargRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key.length === 0) continue;
    // An untouched seeded row re-emits its stored value verbatim (no JSON-type coerce);
    // an edited or added row is parsed from the cell text.
    out[key] =
      row.original !== undefined && stringifyRowValue(row.original) === row.value
        ? row.original
        : parseCellValue(row.value);
  }
  return out;
}

/** Seed rows from a stored kwargs object (stringifying non-string values). */
export function objectToRows(kwargs: Record<string, unknown> | undefined): KwargRow[] {
  if (kwargs === undefined) return [];
  return Object.entries(kwargs).map(([key, raw]) => ({
    key,
    value: stringifyRowValue(raw),
    original: raw,
  }));
}

/** The initial mode: stored when the seed carries an `id`, inline otherwise. */
export function initialMode(value: TemplatedText | null): Mode {
  return value?.id !== undefined ? 'stored' : 'inline';
}

/**
 * The normalized value for a given source/mode and kwargs. The two sources are
 * mutually exclusive by construction (`content` XOR `id`); an empty source emits
 * `null` unless `required`, in which case an empty source is emitted so the
 * schema guard refuses the save.
 */
export function templatedValueFrom(
  mode: Mode,
  inline: string,
  stored: string,
  rows: readonly KwargRow[],
  required: boolean,
): TemplatedText | null {
  const kwargs = rowsToObject(rows);
  const kw = Object.keys(kwargs).length > 0 ? { kwargs } : {};
  if (mode === 'stored') {
    const id = stored.trim();
    if (id === '') return required ? { id: '', ...kw } : null;
    return { id, ...kw };
  }
  if (inline.trim() === '') return required ? { content: '', ...kw } : null;
  return { content: inline, ...kw };
}
