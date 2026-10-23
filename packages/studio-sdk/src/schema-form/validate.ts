/**
 * `validateAgainstSchema` — a loud, structured pre-submit check. It walks the
 * schema against a value and returns a path-keyed `SchemaFormErrors` bag:
 * required-presence, type/format mismatches, enum/const violations, and the
 * container constraint on a free-form `json` field. It never throws on a
 * malformed value — a malformed value IS the error it reports.
 */
import { isRecord, ownValue } from '../guards';
import { classifySchema } from './classify';
import type { DateConstraints, FieldModel } from './field-model';
import { decodedByteSize, effectiveMaxBytes, overCapMessage } from './media';
import { resolveRef, scalarLabel } from './resolve';
import type { FieldWords, JsonSchema, SchemaFormErrors } from './types';
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
  /**
   * Per-field words, keyed by the root object's exact property name. A field's
   * `invalid` sentence replaces every shape error on that field and anything inside
   * it (a format, pattern, length, bound, type or item error). A missing required
   * value at the field or anywhere inside it shows the field's `required` sentence
   * when set, else the SDK's own required message; `invalid` never covers it. A
   * `pattern` that cannot compile keeps its own message, since that is a defect of the
   * schema, not of the value. A field with no `invalid` sentence keeps the SDK's word
   * for the failing shape.
   */
  readonly fieldWording?: Readonly<Record<string, FieldWords>>;
}

/** The invariants every per-node validator shares while walking one value tree. */
interface ValidateCtx {
  /** The document root, for `$ref` resolution during re-classification. */
  readonly root: JsonSchema;
  /**
   * The path-keyed error bag every validator writes into. It has no prototype, so a
   * path that names a built-in object member (`toString`, `__proto__`) is an ordinary key.
   */
  readonly errors: Record<string, string>;
  /** The host's default media byte cap (a field's own cap still overrides it). */
  readonly maxUploadBytes: number | undefined;
  /**
   * The root object's property the walk is inside, or `undefined` at the root itself
   * and inside a root that is not an object or record.
   */
  readonly field: string | undefined;
  /**
   * The paths whose error is a shape error a field's `invalid` sentence may replace,
   * each mapped to the root property it lies inside.
   */
  readonly shapeErrorFields: Map<string, string>;
  /**
   * The paths whose error is a missing required value a field's `required` sentence
   * may replace, each mapped to the root property it lies inside.
   */
  readonly requiredFields: Map<string, string>;
}

/**
 * Record a shape error at `path`: the value breaks a shape the schema declares. Inside
 * a root property, that field's `invalid` sentence may replace it.
 */
function shapeError(ctx: ValidateCtx, path: string, message: string): void {
  ctx.errors[path] = message;
  ctx.requiredFields.delete(path);
  if (ctx.field === undefined) ctx.shapeErrorFields.delete(path);
  else ctx.shapeErrorFields.set(path, ctx.field);
}

/**
 * Record an error at `path` that is not a shape the value breaks (a missing required
 * value, a schema constraint that cannot run): a field's words never replace it.
 */
function keptError(ctx: ValidateCtx, path: string, message: string): void {
  ctx.errors[path] = message;
  ctx.shapeErrorFields.delete(path);
  ctx.requiredFields.delete(path);
}

/** The context for the child `name` of the value at `path`: a root child is its own field. */
function childCtx(ctx: ValidateCtx, path: string, name: string): ValidateCtx {
  return path === '' ? { ...ctx, field: name } : ctx;
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
    shapeError(ctx, path, 'must be a JSON object');
  } else if (model.jsonType === 'array' && !Array.isArray(value)) {
    shapeError(ctx, path, 'must be a JSON array');
  }
}

function validateConst(
  model: ModelOf<'const'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  if (value !== model.value) shapeError(ctx, path, `must equal ${scalarLabel(model.value)}`);
}

function validateEnum(
  model: ModelOf<'enum'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  const allowed = model.options.some((option) => option.value === value);
  if (!allowed) shapeError(ctx, path, 'must be one of the allowed values');
}

function validateString(
  model: ModelOf<'string'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  if (typeof value !== 'string') {
    shapeError(ctx, path, 'must be a string');
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
      shapeError(ctx, path, overCapMessage('The value', size, cap));
      return;
    }
  }
  if (value.length > 0 && model.format !== undefined) {
    const message = formatError(model.format, value);
    if (message !== undefined) {
      shapeError(ctx, path, message);
      return;
    }
  }
  // Date bounds and unavailable days. Range span/ordering needs the sibling
  // start field, so it is enforced at the object level (see validateDateRanges).
  if (model.date !== undefined && value.length > 0) {
    const message = dateConstraintError(model.date, value);
    if (message !== undefined) shapeError(ctx, path, message);
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
    shapeError(ctx, path, model.integer ? 'must be an integer' : 'must be a number');
    return;
  }
  if (model.integer && !Number.isInteger(value)) shapeError(ctx, path, 'must be an integer');
}

function validateBoolean(value: unknown, path: string, ctx: ValidateCtx): void {
  if (typeof value !== 'boolean') shapeError(ctx, path, 'must be true or false');
}

function validateArray(
  model: ModelOf<'array'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  if (!Array.isArray(value)) {
    shapeError(ctx, path, 'must be an array');
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
    shapeError(ctx, path, 'must be an object');
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
    const childValue = ownValue(value, name);
    if (childValue === undefined) {
      if (model.required.has(name)) markRequired(childPath, name, childCtx(ctx, path, name));
      continue;
    }
    walk(propSchema, childValue, childPath, childCtx(ctx, path, name));
  }
  // Required keys naming a property that somehow isn't declared still count.
  for (const name of model.required) {
    if (!propMap.has(name) && ownValue(value, name) === undefined) {
      markRequired(joinPath(path, name), name, childCtx(ctx, path, name));
    }
  }
  validateDateRanges(model, value, path, ctx);
}

/**
 * Record a missing required value at `path`. `ctx` is the missing child's own context,
 * so inside a root property the field's `required` sentence may replace the message
 * (never its `invalid` sentence).
 */
function markRequired(path: string, name: string, ctx: ValidateCtx): void {
  keptError(ctx, path, `"${name}" is required`);
  if (ctx.field !== undefined) ctx.requiredFields.set(path, ctx.field);
}

/** Days from `start` to `end` inclusive (both `YYYY-MM-DD`); 1 when they are equal. */
function inclusiveDayCount(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

const WRITTEN_DATE_RE = /^(\d{4}-\d{2}-\d{2})[Tt]/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * The written `YYYY-MM-DD` date of a range end's value: a `date` value as is, a
 * `date-time` value's leading date. `undefined` when the value does not pass its own
 * format check (that field's own validation reports it).
 */
function writtenDate(schema: JsonSchema, value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (schema.format === 'date') return formatError('date', value) === undefined ? value : undefined;
  if (schema.format === 'date-time' && formatError('date-time', value) === undefined) {
    return WRITTEN_DATE_RE.exec(value)?.[1];
  }
  return undefined;
}

/** The seconds into the day a `HH:MM[:SS]` value names, or `undefined` when it is not a real time. */
function secondsOfDay(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const match = TIME_RE.exec(value);
  if (match === null) return undefined;
  const [hours, minutes, seconds] = [match[1], match[2], match[3] ?? '0'].map(Number);
  if (hours === undefined || minutes === undefined || seconds === undefined) return undefined;
  if (hours > 23 || minutes > 59 || seconds > 59) return undefined;
  return hours * 3600 + minutes * 60 + seconds;
}

/** The `timeOf` time property paired with the date `dateName`, if any. */
function pairedTimeName(
  dateName: string,
  properties: readonly (readonly [string, JsonSchema])[],
): string | undefined {
  return properties.find(([name, schema]) => schema.timeOf === dateName && name !== dateName)?.[0];
}

/**
 * Enforce a date RANGE declared on an END field: the end is on or after its named
 * `rangeStart` field, and the inclusive day span is within `minDays`/`maxDays`. Each end is
 * read by its written date (a `date-time` end by its leading `YYYY-MM-DD`), so a mixed
 * `date`/`date-time` pair is ordered by date; a pair of two `date-time` ends is left to
 * the answer door, which orders it by instant. Two ends on the same date that each carry
 * a readable `timeOf` time are then ordered by those times, the error on the END's time.
 * Nothing is recombined. A missing or not-yet-valid endpoint is left to that field's own
 * validation; a hidden end field is skipped.
 */
function validateDateRanges(
  model: ModelOf<'object'>,
  value: Record<string, unknown>,
  path: string,
  ctx: ValidateCtx,
): void {
  const propMap = new Map(model.properties);
  for (const [name, propSchema] of model.properties) {
    if (!isFieldVisible(propSchema, value)) continue;
    const resolved = resolveRef(propSchema, ctx.root);
    const startName = resolved.rangeStart;
    if (typeof startName !== 'string') continue;
    const startDeclared = propMap.get(startName);
    if (startDeclared === undefined) continue;
    const startSchema = resolveRef(startDeclared, ctx.root);
    if (resolved.format === 'date-time' && startSchema.format === 'date-time') continue;
    const endDate = writtenDate(resolved, ownValue(value, name));
    const startDate = writtenDate(startSchema, ownValue(value, startName));
    if (endDate === undefined || startDate === undefined) continue;
    const childPath = joinPath(path, name);
    if (ctx.errors[childPath] !== undefined) continue;
    if (endDate === startDate && timeOrderError(model, value, path, ctx, startName, name)) continue;
    const message = dateRangeMessage(resolved, startDate, endDate);
    if (message !== undefined) shapeError(childCtx(ctx, path, name), childPath, message);
  }
}

/**
 * Record the order error on the END's time when two same-date ends each carry a readable
 * `timeOf` time and the END's is earlier; `true` when it was recorded. An absent or
 * unreadable time leaves the dates to decide.
 */
function timeOrderError(
  model: ModelOf<'object'>,
  value: Record<string, unknown>,
  path: string,
  ctx: ValidateCtx,
  startName: string,
  endName: string,
): boolean {
  const startTimeName = pairedTimeName(startName, model.properties);
  const endTimeName = pairedTimeName(endName, model.properties);
  if (startTimeName === undefined || endTimeName === undefined) return false;
  const startSeconds = secondsOfDay(ownValue(value, startTimeName));
  const endSeconds = secondsOfDay(ownValue(value, endTimeName));
  if (startSeconds === undefined || endSeconds === undefined || endSeconds >= startSeconds) {
    return false;
  }
  const timePath = joinPath(path, endTimeName);
  if (ctx.errors[timePath] === undefined) {
    shapeError(childCtx(ctx, path, endTimeName), timePath, 'must be on or after the start time');
  }
  return true;
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
    shapeError(ctx, path, 'must be an array');
    return;
  }
  const allowed = new Set(model.options.map((option) => option.value));
  for (const item of value) {
    if (!allowed.has(item)) {
      shapeError(ctx, path, 'must be one of the allowed values');
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
    shapeError(ctx, path, `must be at least ${String(schema.minLength)} character(s)`);
    return;
  }
  if (typeof schema.maxLength === 'number' && length > schema.maxLength) {
    shapeError(ctx, path, `must be at most ${String(schema.maxLength)} character(s)`);
    return;
  }
  if (typeof schema.pattern !== 'string' || schema.pattern === '') return;
  let pattern: RegExp;
  try {
    pattern = new RegExp(schema.pattern);
  } catch {
    keptError(ctx, path, 'has an invalid pattern constraint');
    return;
  }
  if (!pattern.test(value)) shapeError(ctx, path, 'must match the required pattern');
}

function applyNumberBounds(
  schema: JsonSchema,
  value: number,
  path: string,
  ctx: ValidateCtx,
): void {
  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    shapeError(ctx, path, `must be at least ${String(schema.minimum)}`);
    return;
  }
  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    shapeError(ctx, path, `must be at most ${String(schema.maximum)}`);
  }
}

function applyArrayBounds(
  schema: JsonSchema,
  value: readonly unknown[],
  path: string,
  ctx: ValidateCtx,
): void {
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    shapeError(ctx, path, `must have at least ${String(schema.minItems)} item(s)`);
    return;
  }
  if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
    shapeError(ctx, path, `must have at most ${String(schema.maxItems)} item(s)`);
  }
}

function validateRecord(
  model: ModelOf<'record'>,
  value: unknown,
  path: string,
  ctx: ValidateCtx,
): void {
  if (!isRecord(value)) {
    shapeError(ctx, path, 'must be an object');
    return;
  }
  for (const [key, entryValue] of Object.entries(value)) {
    walk(model.values, entryValue, joinPath(path, key), childCtx(ctx, path, key));
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
    shapeError(ctx, path, 'does not match any allowed variant');
    return;
  }
  walk(variant.schema, value, path, ctx);
}

function walk(schema: JsonSchema, value: unknown, path: string, ctx: ValidateCtx): void {
  const classified = classifySchema(schema, ctx.root);

  if (value === null) {
    if (!classified.nullable) shapeError(ctx, path, 'must not be null');
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
 * Replace each shape error inside a root property whose words carry an `invalid`
 * sentence with that sentence, and each missing required value inside a root property
 * whose words carry a `required` sentence with that one; every other error keeps its
 * own message.
 */
function applyFieldWording(
  fieldWording: Readonly<Record<string, FieldWords>>,
  errors: Record<string, string>,
  shapeErrorFields: ReadonlyMap<string, string>,
  requiredFields: ReadonlyMap<string, string>,
): void {
  for (const [path, field] of shapeErrorFields) {
    const invalid = ownValue(fieldWording, field)?.invalid;
    if (invalid !== undefined) errors[path] = invalid;
  }
  for (const [path, field] of requiredFields) {
    const required = ownValue(fieldWording, field)?.required;
    if (required !== undefined) errors[path] = required;
  }
}

/**
 * Validate `value` against `schema`, returning a per-path error bag (empty =
 * valid). The caller runs this before submit and feeds the result back to
 * `SchemaForm` for display. `options.maxUploadBytes` mirrors the renderer's
 * `maxUploadBytes` prop so a media field's byte cap is enforced identically here;
 * `options.fieldWording` puts a field's own `invalid` sentence in place of the
 * SDK's word for any shape error on that field, and its own `required` sentence in
 * place of the SDK's message for a missing required value at or inside that field.
 */
export function validateAgainstSchema(
  schema: JsonSchema,
  value: unknown,
  options?: ValidateOptions,
): SchemaFormErrors {
  const errors = Object.create(null) as Record<string, string>;
  const shapeErrorFields = new Map<string, string>();
  const requiredFields = new Map<string, string>();
  walk(schema, value, '', {
    root: schema,
    errors,
    maxUploadBytes: options?.maxUploadBytes,
    field: undefined,
    shapeErrorFields,
    requiredFields,
  });
  if (options?.fieldWording !== undefined) {
    applyFieldWording(options.fieldWording, errors, shapeErrorFields, requiredFields);
  }
  // Hand back an ordinary object; its entries are defined as own keys, so a path such as
  // `__proto__` stays an entry of the result.
  return Object.fromEntries(Object.entries(errors));
}
