/**
 * `validateAgainstSchema` — a loud, structured pre-submit check. It walks the
 * schema against a value and returns a path-keyed `SchemaFormErrors` bag:
 * required-presence, type/format mismatches, enum/const violations, and any
 * `unsupported` construct (surfaced, never hidden). It never throws on a
 * malformed value — a malformed value IS the error it reports.
 */
import { classifySchema } from './classify';
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

function walk(
  schema: JsonSchema,
  value: unknown,
  path: string,
  root: JsonSchema,
  errors: Record<string, string>,
  maxUploadBytes: number | undefined,
): void {
  const classified = classifySchema(schema, root);

  if (value === null) {
    if (!classified.nullable) errors[path] = 'must not be null';
    return;
  }

  const { model } = classified;
  switch (model.kind) {
    case 'unsupported':
      errors[path] = `unsupported schema (${model.reason})`;
      return;
    case 'const':
      if (value !== model.value) errors[path] = `must equal ${scalarLabel(model.value)}`;
      return;
    case 'enum': {
      const allowed = model.options.some((option) => option.value === value);
      if (!allowed) errors[path] = 'must be one of the allowed values';
      return;
    }
    case 'string': {
      if (typeof value !== 'string') {
        errors[path] = 'must be a string';
        return;
      }
      // A media-annotated string carries a byte cap; enforce it on the value's
      // DECODED size so a value that arrived by any route is caught here too. The
      // precedence matches the renderer: field `contentMaxBytes` → host cap →
      // shared default.
      if (model.media !== undefined) {
        const cap = effectiveMaxBytes(model.media.maxBytes, maxUploadBytes);
        const size = decodedByteSize(value);
        if (size > cap) {
          errors[path] = overCapMessage('The value', size, cap);
          return;
        }
      }
      if (value.length > 0 && model.format !== undefined) {
        const message = formatError(model.format, value);
        if (message !== undefined) errors[path] = message;
      }
      return;
    }
    case 'number': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        errors[path] = model.integer ? 'must be an integer' : 'must be a number';
        return;
      }
      if (model.integer && !Number.isInteger(value)) errors[path] = 'must be an integer';
      return;
    }
    case 'boolean':
      if (typeof value !== 'boolean') errors[path] = 'must be true or false';
      return;
    case 'array': {
      if (!Array.isArray(value)) {
        errors[path] = 'must be an array';
        return;
      }
      value.forEach((item, index) => {
        walk(model.items, item, `${path}[${String(index)}]`, root, errors, maxUploadBytes);
      });
      return;
    }
    case 'object': {
      if (!isPlainObject(value)) {
        errors[path] = 'must be an object';
        return;
      }
      const propMap = new Map(model.properties);
      for (const [name, propSchema] of model.properties) {
        const childPath = joinPath(path, name);
        const childValue = value[name];
        if (childValue === undefined) {
          if (model.required.has(name)) errors[childPath] = `"${name}" is required`;
          continue;
        }
        walk(propSchema, childValue, childPath, root, errors, maxUploadBytes);
      }
      // Required keys naming a property that somehow isn't declared still count.
      for (const name of model.required) {
        if (!propMap.has(name) && value[name] === undefined) {
          errors[joinPath(path, name)] = `"${name}" is required`;
        }
      }
      return;
    }
    case 'record': {
      if (!isPlainObject(value)) {
        errors[path] = 'must be an object';
        return;
      }
      for (const [key, entryValue] of Object.entries(value)) {
        walk(model.values, entryValue, joinPath(path, key), root, errors, maxUploadBytes);
      }
      return;
    }
    case 'union': {
      const index = activeVariantIndex(value, model.variants, model.discriminator, root);
      const variant = index === -1 ? undefined : model.variants[index];
      if (variant === undefined) {
        errors[path] = 'does not match any allowed variant';
        return;
      }
      walk(variant.schema, value, path, root, errors, maxUploadBytes);
      return;
    }
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
  walk(schema, value, '', schema, errors, options?.maxUploadBytes);
  return errors;
}
