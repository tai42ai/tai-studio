/**
 * `validateAgainstSchema` — a loud, structured pre-submit check. It walks the
 * schema against a value and returns a path-keyed `SchemaFormErrors` bag:
 * required-presence, type/format mismatches, enum/const violations, and the
 * container constraint on a free-form `json` field. It never throws on a
 * malformed value — a malformed value IS the error it reports.
 */
import { classifySchema } from './classify';
import type { FieldModel } from './field-model';
import { isRecord } from '../guards';
import { decodedByteSize, effectiveMaxBytes, overCapMessage } from './media';
import { scalarLabel } from './resolve';
import { activeVariantIndex } from './union';
import type { JsonSchema, SchemaFormErrors } from './types';

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
    if (message !== undefined) ctx.errors[path] = message;
  }
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

  const { model } = classified;
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
