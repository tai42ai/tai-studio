/**
 * The adapter compiler — a PURE function set, no React, no jq engine.
 *
 * A named template `update` jq declares an input object (its `params` / declared
 * input keys). A binding must map the run's OUTPUT (and the run's INPUT) into that
 * object; that mapping is the `adapter` — a single jq program over `{ output, input }`
 * that CONSTRUCTS the update jq's declared input (which the update jq then reads as
 * `.input` alongside the record).
 *
 * The editor authors the adapter as a ROW form: one row per declared input key,
 * each row picking one of three value sources — a picked field (from the run's
 * output / input schema), a hardcoded literal, or a raw jq expression. The whole
 * form compiles here into ONE adapter jq; each row's own jq fragment is shown on demand.
 *
 * Compilation never throws: an invalid literal or an empty field surfaces as a
 * loud, human error the editor renders in a `role="alert"`, never a silent empty
 * object.
 */

/** Which root of `{ output, input }` a picked field reads. */
export type FieldRoot = 'output' | 'input';

/** A picked field: a path into `output` or `input`. */
export interface FieldSource {
  readonly kind: 'field';
  readonly root: FieldRoot;
  readonly path: readonly string[];
}

/** A hardcoded literal, authored as JSON text (`"a"`, `42`, `true`, `{…}`). */
export interface LiteralSource {
  readonly kind: 'literal';
  readonly json: string;
}

/** A raw jq expression over `{ output, input }`. */
export interface JqSource {
  readonly kind: 'jq';
  readonly expr: string;
}

/** The three value sources one mapping row may carry — exactly one at a time. */
export type MappingSource = FieldSource | LiteralSource | JqSource;

/** One mapping row: a target key of the update jq's declared input + its value source. */
export interface MappingRow {
  readonly target: string;
  readonly source: MappingSource;
}

/** A compile outcome: the jq program, or a human error to surface loudly. */
export type AdapterCompileResult =
  { readonly ok: true; readonly jq: string } | { readonly ok: false; readonly error: string };

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** An object key rendered for jq: a bare identifier, or a quoted string otherwise. */
export function jqKey(key: string): string {
  return IDENTIFIER.test(key) ? key : JSON.stringify(key);
}

/** A picked field rendered as a jq path, e.g. `.output.user.name` / `.input["odd key"]`. */
export function fieldPathToJq(root: FieldRoot, path: readonly string[]): string {
  let out = `.${root}`;
  for (const segment of path) {
    out += IDENTIFIER.test(segment) ? `.${segment}` : `[${JSON.stringify(segment)}]`;
  }
  return out;
}

/** The jq fragment ONE row's value compiles to — the row's "show jq". */
export function rowValueJq(source: MappingSource): AdapterCompileResult {
  switch (source.kind) {
    case 'field':
      return { ok: true, jq: fieldPathToJq(source.root, source.path) };
    case 'literal': {
      const text = source.json.trim();
      if (text === '') return { ok: false, error: 'Enter a value.' };
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        return { ok: false, error: 'This is not valid JSON.' };
      }
      // A parsed JSON value is a valid jq literal verbatim.
      return { ok: true, jq: JSON.stringify(parsed) };
    }
    case 'jq': {
      const expr = source.expr.trim();
      if (expr === '') return { ok: false, error: 'Enter a jq expression.' };
      return { ok: true, jq: expr };
    }
  }
}

/**
 * Compile a mapping form into ONE adapter jq that constructs the update jq's
 * declared input over `{ output, input }`. An empty form compiles to the
 * empty object `{}`; a blank target, a duplicate target, or an invalid source is a
 * loud error.
 */
export function compileAdapter(rows: readonly MappingRow[]): AdapterCompileResult {
  if (rows.length === 0) return { ok: true, jq: '{}' };
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const row of rows) {
    const target = row.target.trim();
    if (target === '') return { ok: false, error: 'Every mapping row needs a target field.' };
    if (seen.has(target)) return { ok: false, error: `The field '${target}' is mapped twice.` };
    seen.add(target);
    const value = rowValueJq(row.source);
    if (!value.ok) return { ok: false, error: `${target}: ${value.error}` };
    parts.push(`${jqKey(target)}: (${value.jq})`);
  }
  return { ok: true, jq: `{ ${parts.join(', ')} }` };
}

/** One row per declared input key, each defaulting to a picked `output` field. */
export function defaultRowsForInput(params: readonly string[]): MappingRow[] {
  return params.map((target) => ({
    target,
    source: { kind: 'field', root: 'output', path: [] },
  }));
}

// -- The round-trip: recover a mapping form from a STORED adapter jq --------------
//
// `compileAdapter` emits a canonical, PARSEABLE shape so a stored adapter reopens as
// the form it was authored in (never UI-only state): the object
// `{ <key>: (<value>), … }` where `<key>` is a bare identifier or a JSON string and
// `<value>` is one of — a field path `.output…` / `.input…`, a JSON literal, or a raw
// jq expression. `parseAdapter` inverts it; `parse(compileAdapter(rows).jq) === rows`
// for every row kind whose literal is already canonical JSON. A shape it does not
// recognise returns `null` — the editor falls back to the raw-jq escape hatch.

const IDENTIFIER_HEAD = /^([A-Za-z_][A-Za-z0-9_]*)/;
const BRACKET_SEGMENT = /^\[("(?:[^"\\]|\\.)*")\]/;
const ADAPTER_KEY = /^("(?:[^"\\]|\\.)*"|[A-Za-z_][A-Za-z0-9_]*)\s*:\s*\(/;

/** Recover a field source from a pure path expression, or `null` if it is not one. */
export function parseFieldPath(value: string): FieldSource | null {
  const head = /^\.(output|input)/.exec(value);
  if (head === null) return null;
  const root = head[1] as FieldRoot;
  let rest = value.slice(head[0].length);
  const path: string[] = [];
  while (rest.length > 0) {
    if (rest.startsWith('.')) {
      const segment = IDENTIFIER_HEAD.exec(rest.slice(1));
      if (segment?.[1] === undefined) return null;
      path.push(segment[1]);
      rest = rest.slice(1 + segment[0].length);
    } else if (rest.startsWith('[')) {
      const bracket = BRACKET_SEGMENT.exec(rest);
      if (bracket?.[1] === undefined) return null;
      path.push(JSON.parse(bracket[1]) as string);
      rest = rest.slice(bracket[0].length);
    } else {
      // Trailing content (e.g. ` + 1`) means this is a jq expression, not a path.
      return null;
    }
  }
  return { kind: 'field', root, path };
}

/** Classify one recovered value into its source (field, else JSON literal, else jq). */
function parseValue(value: string): MappingSource {
  const field = parseFieldPath(value);
  if (field !== null) return field;
  try {
    const parsed = JSON.parse(value) as unknown;
    return { kind: 'literal', json: JSON.stringify(parsed) };
  } catch {
    return { kind: 'jq', expr: value };
  }
}

/** Find the index of the paren that closes the `(` at `open`, respecting jq strings. */
function matchingParen(text: string, open: number): number {
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i += 1;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Recover the mapping rows from a stored adapter jq, or `null` if it is not the generated shape. */
export function parseAdapter(jq: string): MappingRow[] | null {
  const trimmed = jq.trim();
  if (trimmed === '{}') return [];
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
  let inner = trimmed.slice(1, -1).trim();
  const rows: MappingRow[] = [];
  while (inner.length > 0) {
    const keyMatch = ADAPTER_KEY.exec(inner);
    if (keyMatch?.[1] === undefined) return null;
    const rawKey = keyMatch[1];
    const target = rawKey.startsWith('"') ? (JSON.parse(rawKey) as string) : rawKey;
    const open = keyMatch[0].length - 1;
    const close = matchingParen(inner, open);
    if (close === -1) return null;
    const value = inner.slice(open + 1, close).trim();
    rows.push({ target, source: parseValue(value) });
    inner = inner.slice(close + 1).trim();
    if (inner.startsWith(',')) inner = inner.slice(1).trim();
    else if (inner.length > 0) return null;
  }
  return rows;
}

// -- The canonical single-expression form: `tjq_<callName>(<adapter object>)` --------
//
// When a template update rides inside ONE jq field (rather than the structured
// `template_jq` + `adapter` pair), it is written as the call `tjq_<callName>({ … })`.
// A jq name is `[a-z][a-z0-9_]*` (double underscores legal); a tai42 template name is a
// SLUG (`[a-z][a-z0-9-]*` with no leading, trailing, or consecutive hyphens). So the
// qualified call name is `enc(template) + "__" + name`, where `enc` maps each `-` to
// `_`. BECAUSE the slug has no consecutive or trailing hyphens, `enc(template)` never
// contains `__` and never ends in `_` — so the FIRST `__` in the call name is the
// unambiguous template/name boundary. Resolution back to a catalog ref is therefore
// injective, but done catalog-driven (`resolveCallName`, `catalog.ts`) rather than by
// string splitting, since a jq name may itself contain `__` after that boundary. A jq
// field whose expression is EXACTLY this generated call reopens as the mapping form;
// any other expression reopens as raw jq.

const TEMPLATE_CALL = /^tjq_([a-z][a-z0-9_]*)\(([\s\S]*)\)$/;

/**
 * Encode a template-name slug for a jq identifier: each `-` becomes `_`. Under the slug
 * invariant (no consecutive or trailing hyphens) the result carries no `__` and no
 * trailing `_`, which is what makes the first `__` in a call name the template boundary.
 */
export function encodeTemplateSegment(template: string): string {
  return template.replace(/-/g, '_');
}

/** The jq call-name of a catalog ref: `template.name` → `enc(template)__name`; a bare `name` unchanged. */
function refToCallName(ref: string): string {
  const dot = ref.indexOf('.');
  if (dot === -1) return ref;
  return `${encodeTemplateSegment(ref.slice(0, dot))}__${ref.slice(dot + 1)}`;
}

/**
 * The single-expression form of a named template update built from a mapping form:
 * `tjq_<enc(template)>__<name>({…})` for a qualified ref, `tjq_<name>({…})` for a bare
 * one (see the module note on the `__` boundary invariant).
 */
export function generateTemplateCall(ref: string, rows: readonly MappingRow[]): string {
  const compiled = compileAdapter(rows);
  return `tjq_${refToCallName(ref)}(${compiled.ok ? compiled.jq : '{}'})`;
}

/**
 * Recover `{ callName, adapter }` from a `tjq_<callName>(<adapter>)` call, or `null`
 * otherwise. `callName` is the RAW jq identifier — NEVER split here (a jq name may carry
 * its own `__` past the template boundary); resolve it to a catalog ref with
 * `resolveCallName`.
 */
export function parseTemplateCall(expr: string): { callName: string; adapter: string } | null {
  const match = TEMPLATE_CALL.exec(expr.trim());
  if (match?.[1] === undefined || match[2] === undefined) return null;
  return { callName: match[1], adapter: match[2].trim() };
}
