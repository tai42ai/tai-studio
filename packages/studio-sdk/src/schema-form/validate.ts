/**
 * `validateAgainstSchema` — a loud, structured pre-submit check. It walks the
 * schema against a value and returns a path-keyed `SchemaFormErrors` bag:
 * required-presence, type/format mismatches, enum/const violations, and the
 * container constraint on a free-form `json` field. It never throws on a
 * malformed value — a malformed value IS the error it reports.
 */
import { isRecord } from '../guards';
import { classifySchema } from './classify';
import type { DateConstraints, FieldModel } from './field-model';
import { decodedByteSize, effectiveMaxBytes, overCapMessage } from './media';
import { resolveRef, scalarLabel } from './resolve';
import type { JsonSchema, SchemaFormErrors } from './types';
import { activeVariantIndex } from './union';
import { isFieldVisible } from './visibility';

/** Options for {@link validateAgainstSchema}. */
export interface ValidateOptions {
  /**
   * The host's default byte cap for media-upload fields, mirroring the renderer's
   * `maxUploadBytes` prop. A field's own `contentMaxBytes` still overrides it;
   * absent both, the shared default applies.
   */
  readonly maxUploadBytes?: number;
}

/** The invariants every per-node validator shares while walking one value tree. */
interface ValidateCtx {
  /** The document root, for `$ref` resolution during re-classification. */
  readonly root: JsonSchema;
  /** The path-keyed error bag every validator writes into. */
  readonly errors: Record<string, string>;
  /** The host's default media byte cap (a field's own cap still overrides it). */
  readonly maxUploadBytes: number | undefined;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function joinPath(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`;
}

function formatError(format: string, value: string): string | undefined {
  switch (format) {
    case 'email':
      return EMAIL_RE.test(value) ? undefined : 'must be a valid email address';
    case 'uri':
    case 'uri-reference':
      try {
        new URL(value, 'https://base.invalid');
        return undefined;
      } catch {
        return 'must be a valid URI';
      }
    case 'uuid':
      return UUID_RE.test(value) ? undefined : 'must be a valid UUID';
    case 'date':
      return DATE_RE.test(value) && !Number.isNaN(Date.parse(value))
        ? undefined
        : 'must be a valid date (YYYY-MM-DD)';
    case 'date-time':
      return Number.isNaN(Date.parse(value)) ? 'must be a valid date-time' : undefined;
    default:
      return undefined;
  }
}

type ModelOf<K extends FieldModel['kind']> = Extract<FieldModel, { kind: K }>;

// A free-form JSON field: any JSON is accepted, subject only to the container the
// schema commits to (mirrors the renderer's inline check).
function validateJson(
  model: ModelOf<'json'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  if (model.jsonType === 'object' && !isRecord(value)) {
    ctx.errors[path] = 'must be a JSON object';
  } else if (model.jsonType === 'array' && !Array.isArray(value)) {
    ctx.errors[path] = 'must be a JSON array';
  }
}

function validateConst(
  model: ModelOf<'const'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  if (value !== model.value) ctx.errors[path] = `must equal ${scalarLabel(model.value)}`;
}

function validateEnum(
  model: ModelOf<'enum'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  const allowed = model.options.some((option) => option.value === value);
  if (!allowed) ctx.errors[path] = 'must be one of the allowed values';
}

function validateString(
  model: ModelOf<'string'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  if (typeof value !== 'string') {
    ctx.errors[path] = 'must be a string';
    return;
  }
  // A media-annotated string carries a byte cap; enforce it on the value's
  // DECODED size so a value that arrived by any route is caught here too. The
  // precedence matches the renderer: field `contentMaxBytes` → host cap →
  // shared default.
  if (model.media !== undefined) {
    const cap = effectiveMaxBytes(model.media.maxBytes, ctx.maxUploadBytes);
    const size = decodedByteSize(value);
    if (size > cap) {
      ctx.errors[path] = overCapMessage('The value', size, cap);
      return;
    }
  }
  if (value.length > 0 && model.format !== undefined) {
    const message = formatError(model.format, value);
    if (message !== undefined) {
      ctx.errors[path] = message;
      return;
    }
  }
  // Date bounds and unavailable days. Range span/ordering needs the sibling
  // start field, so it is enforced at the object level (see validateDateRanges).
  if (model.date !== undefined && value.length > 0) {
    const message = dateConstraintError(model.date, value);
    if (message !== undefined) ctx.errors[path] = message;
  }
}

/** The inclusive bound/unavailable-day violation on a date value, or `undefined`. */
function dateConstraintError(date: DateConstraints, value: string): string | undefined {
  // `YYYY-MM-DD` strings compare lexicographically in chronological order, so the bounds
  // are plain string comparisons. A value that is not a well-formed date is left to the
  // `format` check above; this runs only for a syntactically valid date.
  if (!DATE_RE.test(value)) return undefined;
  if (date.min !== undefined && value < date.min) return `must be on or after ${date.min}`;
  if (date.max !== undefined && value > date.max) return `must be on or before ${date.max}`;
  if (date.unavailable.includes(value)) return 'is not an available date';
  return undefined;
}

function validateNumber(
  model: ModelOf<'number'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    ctx.errors[path] = model.integer ? 'must be an integer' : 'must be a number';
    return;
  }
  if (model.integer && !Number.isInteger(value)) ctx.errors[path] = 'must be an integer';
}

function validateBoolean(value: unknown, path: string, ctx: ValidateCtx): void {
  if (typeof value !== 'boolean') ctx.errors[path] = 'must be true or false';
}

function validateArray(
  model: ModelOf<'array'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  if (!Array.isArray(value)) {
    ctx.errors[path] = 'must be an array';
    return;
  }
  value.forEach((item, index) => {
    walk(model.items, item, `${path}[${String(index)}]`, ctx);
  });
}

function validateObject(
  model: ModelOf<'object'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  if (!isRecord(value)) {
    ctx.errors[path] = 'must be an object';
    return;
  }
  const propMap = new Map(model.properties);
  for (const [name, propSchema] of model.properties) {
    // A field hidden by its `visibleWhen` predicate is not part of the answer:
    // it is not required and not validated, and a value left on it is dropped by the
    // server, not an error here. Evaluated on the current values, so a field that was
    // hidden by the predicate is skipped even if it still carries a stale value.
    if (!isFieldVisible(propSchema, value)) continue;
    const childPath = joinPath(path, name);
    const childValue = value[name];
    if (childValue === undefined) {
      if (model.required.has(name)) ctx.errors[childPath] = `"${name}" is required`;
      continue;
    }
    walk(propSchema, childValue, childPath, ctx);
  }
  // Required keys naming a property that somehow isn't declared still count.
  for (const name of model.required) {
    if (!propMap.has(name) && value[name] === undefined) {
      ctx.errors[joinPath(path, name)] = `"${name}" is required`;
    }
  }
  validateDateRanges(model, value, path, ctx);
}

/** Days from `start` to `end` inclusive (both `YYYY-MM-DD`); 1 when they are equal. */
function inclusiveDayCount(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

/**
 * Enforce a date RANGE declared on an END field: the end is on or after its
 * named `rangeStart` field, and the inclusive day span is within `minDays`/`maxDays`.
 * Read from the two plain date values — nothing recombined. A missing or not-yet-valid
 * endpoint is left to that field's own validation; a hidden end field is skipped.
 */
function validateDateRanges(
  model: ModelOf<'object'>,
  value: Record<string, unknown>,
  path: string,
  ctx: ValidateCtx,
): void {
  for (const [name, propSchema] of model.properties) {
    if (!isFieldVisible(propSchema, value)) continue;
    const resolved = resolveRef(propSchema, ctx.root);
    if (typeof resolved.rangeStart !== 'string') continue;
    const endValue = value[name];
    const startValue = value[resolved.rangeStart];
    if (typeof endValue !== 'string' || typeof startValue !== 'string') continue;
    if (!DATE_RE.test(endValue) || !DATE_RE.test(startValue)) continue;
    const childPath = joinPath(path, name);
    if (ctx.errors[childPath] !== undefined) continue;
    const message = dateRangeMessage(resolved, startValue, endValue);
    if (message !== undefined) ctx.errors[childPath] = message;
  }
}

/** The ordering/span violation on a range END field, or `undefined` when it holds. */
function dateRangeMessage(
  resolved: JsonSchema,
  startValue: string,
  endValue: string,
): string | undefined {
  if (endValue < startValue) return 'must be on or after the start date';
  const days = inclusiveDayCount(startValue, endValue);
  const minDays = typeof resolved.minDays === 'number' ? resolved.minDays : undefined;
  const maxDays = typeof resolved.maxDays === 'number' ? resolved.maxDays : undefined;
  if (minDays !== undefined && days < minDays)
    return `must span at least ${String(minDays)} day(s)`;
  if (maxDays !== undefined && days > maxDays) return `must span at most ${String(maxDays)} day(s)`;
  return undefined;
}

function validateMultiselect(
  model: ModelOf<'multiselect'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  if (!Array.isArray(value)) {
    ctx.errors[path] = 'must be an array';
    return;
  }
  const allowed = new Set(model.options.map((option) => option.value));
  for (const item of value) {
    if (!allowed.has(item)) {
      ctx.errors[path] = 'must be one of the allowed values';
      return;
    }
  }
}

/**
 * The JSON-Schema value/length/items bounds the client mirrors from the server:
 * `minLength`/`maxLength`/`pattern` on a string, `minimum`/`maximum` on a number,
 * `minItems`/`maxItems` on an array. Applied only when the kind check found no type
 * error. A `pattern` that cannot compile surfaces as a loud field error, never a silent
 * skip — the server validates every send's schema, so a well-formed form never hits it.
 */
function applyBounds(schema: JsonSchema, value: unknown, path: string, ctx: ValidateCtx): void {
  if (typeof value === 'string') applyStringBounds(schema, value, path, ctx);
  else if (typeof value === 'number') applyNumberBounds(schema, value, path, ctx);
  else if (Array.isArray(value)) applyArrayBounds(schema, value, path, ctx);
}

function applyStringBounds(
  schema: JsonSchema,
  value: string,
  path: string,
  ctx: ValidateCtx,
): void {
  const length = Array.from(value).length;
  if (typeof schema.minLength === 'number' && length < schema.minLength) {
    ctx.errors[path] = `must be at least ${String(schema.minLength)} character(s)`;
    return;
  }
  if (typeof schema.maxLength === 'number' && length > schema.maxLength) {
    ctx.errors[path] = `must be at most ${String(schema.maxLength)} character(s)`;
    return;
  }
  if (typeof schema.pattern !== 'string' || schema.pattern === '') return;
  let pattern: RegExp;
  try {
    pattern = new RegExp(schema.pattern);
  } catch {
    ctx.errors[path] = 'has an invalid pattern constraint';
    return;
  }
  if (!pattern.test(value)) ctx.errors[path] = 'must match the required pattern';
}

function applyNumberBounds(
  schema: JsonSchema,
  value: number,
  path: string,
  ctx: ValidateCtx,
): void {
  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    ctx.errors[path] = `must be at least ${String(schema.minimum)}`;
    return;
  }
  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    ctx.errors[path] = `must be at most ${String(schema.maximum)}`;
  }
}

function applyArrayBounds(
  schema: JsonSchema,
  value: readonly unknown[],
  path: string,
  ctx: ValidateCtx,
): void {
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    ctx.errors[path] = `must have at least ${String(schema.minItems)} item(s)`;
    return;
  }
  if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
    ctx.errors[path] = `must have at most ${String(schema.maxItems)} item(s)`;
  }
}

function validateRecord(
  model: ModelOf<'record'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  if (!isRecord(value)) {
    ctx.errors[path] = 'must be an object';
    return;
  }
  for (const [key, entryValue] of Object.entries(value)) {
    walk(model.values, entryValue, joinPath(path, key), ctx);
  }
}

function validateUnion(
  model: ModelOf<'union'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  const index = activeVariantIndex(value, model.variants, model.discriminator, ctx.root);
  const variant = index === -1 ? undefined : model.variants[index];
  if (variant === undefined) {
    ctx.errors[path] = 'does not match any allowed variant';
    return;
  }
  walk(variant.schema, value, path, ctx);
}

function walk(schema: JsonSchema, value: unknown, path: string, ctx: ValidateCtx): void {
  const classified = classifySchema(schema, ctx.root);

  if (value === null) {
    if (!classified.nullable) ctx.errors[path] = 'must not be null';
    return;
  }

  dispatchKind(classified.model, value, path, ctx);
  // The value/length/items bounds mirror the server and apply only when the kind
  // check found no type error for this field — a bound on a wrong-typed value is noise.
  if (ctx.errors[path] === undefined) applyBounds(classified.schema, value, path, ctx);
}

function dispatchKind(model: FieldModel, value: unknown, path: string, ctx: ValidateCtx): void {
  switch (model.kind) {
    case 'json':
      validateJson(model, value, path, ctx);
      return;
    case 'const':
      validateConst(model, value, path, ctx);
      return;
    case 'enum':
      validateEnum(model, value, path, ctx);
      return;
    case 'string':
      validateString(model, value, path, ctx);
      return;
    case 'number':
      validateNumber(model, value, path, ctx);
      return;
    case 'boolean':
      validateBoolean(value, path, ctx);
      return;
    case 'array':
      validateArray(model, value, path, ctx);
      return;
    case 'multiselect':
      validateMultiselect(model, value, path, ctx);
      return;
    case 'object':
      validateObject(model, value, path, ctx);
      return;
    case 'record':
      validateRecord(model, value, path, ctx);
      return;
    case 'union':
      validateUnion(model, value, path, ctx);
      return;
  }
}

/**
 * Validate `value` against `schema`, returning a per-path error bag (empty =
 * valid). The caller runs this before submit and feeds the result back to
 * `SchemaForm` for display. `options.maxUploadBytes` mirrors the renderer's
 * `maxUploadBytes` prop so a media field's byte cap is enforced identically here.
 */
export function validateAgainstSchema(
  schema: JsonSchema,
  value: unknown,
  options?: ValidateOptions,
): SchemaFormErrors {
  const errors: Record<string, string> = {};
  walk(schema, value, '', { root: schema, errors, maxUploadBytes: options?.maxUploadBytes });
  return errors;
}
