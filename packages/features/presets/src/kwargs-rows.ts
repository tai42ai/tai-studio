/**
 * The pure row model behind the fixed-kwargs editor: it maps the `fixed_kwargs`
 * JSON text a preset door carries to and from an ordered list of typed rows, and it
 * owns the `!ENV ${VAR[:default]}` secret-reference marker grammar the platform
 * resolves at bind time.
 *
 * A reference row stores ONLY the marker string — the environment variable's name,
 * never a value — so a read round-trips exactly what the server accepts and a write
 * emits exactly what it will resolve. Every other kind is the ordinary JSON scalar or
 * container it names.
 */
import { parseJsonObject } from './parse';

/** The kind of value a row carries. */
export type RowKind = 'text' | 'number' | 'boolean' | 'null' | 'reference' | 'json';

/** The `${VAR}` / `${VAR:default}` a reference row references. */
export interface ReferenceValue {
  readonly key: string;
  /** The `:default` text (without the leading colon), or `undefined` for a bare ref. */
  readonly default?: string;
}

/**
 * One top-level `fixed_kwargs` entry as a typed row. Only the field matching `kind`
 * is meaningful: `text` reads `text`; `number` reads `text` (its raw, possibly
 * unparseable input); `boolean` reads `bool`; `null` reads none; `reference` reads
 * `reference`; `json` reads `json` (the object/array value).
 */
export interface KwargRow {
  readonly key: string;
  readonly kind: RowKind;
  readonly text: string;
  readonly bool: boolean;
  readonly reference: ReferenceValue;
  readonly json: unknown;
}

/**
 * The marker grammar, matching the platform's `ENV_REF` behind the `!ENV ` prefix:
 * a whole leaf that is exactly `!ENV ${VAR}` or `!ENV ${VAR:default}` — a single
 * reference with no surrounding text. Group 1 is the variable name; group 2 is the
 * optional `:default` suffix (leading colon included).
 */
const MARKER = /^!ENV \$\{([^}{:]+)(:[^}]+)?\}$/;

/** The `!ENV ${VAR}` / `!ENV ${VAR:default}` marker for a reference. */
export function formatMarker(key: string, defaultText?: string): string {
  return defaultText !== undefined && defaultText !== ''
    ? `!ENV \${${key}:${defaultText}}`
    : `!ENV \${${key}}`;
}

/** The reference a marker leaf names, or `null` when the string is not a marker. */
export function parseMarker(text: string): ReferenceValue | null {
  const match = MARKER.exec(text);
  if (match === null) return null;
  const suffix = match[2];
  return { key: match[1] ?? '', default: suffix === undefined ? undefined : suffix.slice(1) };
}

/** An empty row of a given kind — the shape the other fields default to. */
function emptyRow(key: string, kind: RowKind): KwargRow {
  return { key, kind, text: '', bool: false, reference: { key: '' }, json: null };
}

/** A fresh blank text row, the shape "Add kwarg" appends (its empty key gates submit). */
export function blankRow(): KwargRow {
  return emptyRow('', 'text');
}

/** The typed row for one `fixed_kwargs` value, classifying strings by the marker grammar. */
function rowForValue(key: string, value: unknown): KwargRow {
  if (typeof value === 'string') {
    const reference = parseMarker(value);
    if (reference !== null) return { ...emptyRow(key, 'reference'), reference };
    return { ...emptyRow(key, 'text'), text: value };
  }
  if (typeof value === 'number') return { ...emptyRow(key, 'number'), text: String(value) };
  if (typeof value === 'boolean') return { ...emptyRow(key, 'boolean'), bool: value };
  if (value === null) return emptyRow(key, 'null');
  return { ...emptyRow(key, 'json'), json: value };
}

/** Parse `fixed_kwargs` JSON text into ordered rows, or a loud parser message. */
export function parseRows(
  text: string,
): { readonly rows: KwargRow[] } | { readonly error: string } {
  const parsed = parseJsonObject(text);
  if ('error' in parsed) return { error: parsed.error };
  return { rows: Object.entries(parsed.value).map(([key, value]) => rowForValue(key, value)) };
}

/** The JSON value a row serialises to (assumes the row is valid — see {@link rowError}). */
function valueOfRow(row: KwargRow): unknown {
  switch (row.kind) {
    case 'text':
      return row.text;
    case 'number':
      return Number(row.text);
    case 'boolean':
      return row.bool;
    case 'null':
      return null;
    case 'reference':
      return formatMarker(row.reference.key, row.reference.default);
    case 'json':
      return row.json;
  }
}

/** Serialise valid rows back to pretty `fixed_kwargs` JSON text, key order preserved. */
export function serializeRows(rows: readonly KwargRow[]): string {
  const object: Record<string, unknown> = {};
  for (const row of rows) object[row.key] = valueOfRow(row);
  return JSON.stringify(object, null, 2);
}

/** Whether `text` is a finite number (a blank or non-numeric string is not). */
function isFiniteNumber(text: string): boolean {
  return text.trim() !== '' && Number.isFinite(Number(text));
}

/**
 * The inline error for row `index`, or `undefined` when it is valid. A row is invalid
 * when its key is blank, its key duplicates another row's, its number does not parse,
 * or its reference names no variable — the exact states that must never reach a write.
 */
export function rowError(rows: readonly KwargRow[], index: number): string | undefined {
  const row = rows[index];
  if (row === undefined) return undefined;
  const key = row.key.trim();
  if (key === '') return 'Key is required';
  if (rows.some((other, otherIndex) => otherIndex !== index && other.key.trim() === key)) {
    return 'Duplicate key';
  }
  if (row.kind === 'number' && !isFiniteNumber(row.text)) return 'Not a number';
  if (row.kind === 'reference') {
    if (row.reference.key.trim() === '') return 'Environment variable is required';
    // A `{`/`}` in the default breaks out of the `${VAR:default}` marker, so the leaf
    // no longer round-trips as a reference (and the server rejects it) — a loud row error.
    if (row.reference.default !== undefined && /[{}]/.test(row.reference.default)) {
      return 'Default must not contain { or }';
    }
  }
  return undefined;
}

/** Whether every row is valid — the gate a door adds beside its schema/extensions checks. */
export function rowsValid(rows: readonly KwargRow[]): boolean {
  return rows.every((_row, index) => rowError(rows, index) === undefined);
}
