/**
 * Pure helpers over the JSON-Schema subset: `$ref`/`$defs` resolution and the
 * small predicates the renderer, defaulting, and validation all share. Kept
 * side-effect-free so they can be unit-tested and reused across the module.
 */
import type { JsonSchema, JsonSchemaType } from './types';

/** Un-escape one JSON-Pointer reference token (`~1`→`/`, `~0`→`~`). */
function unescapePointerToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Resolve an internal `$ref` against the document root, following chained refs
 * (a `$ref` whose target is itself a `$ref`). Only same-document pointers are
 * supported (`#/$defs/Name`, `#/definitions/Name`, `#`); an external or
 * unresolvable ref throws LOUDLY rather than yielding a silent empty schema.
 * A schema with no `$ref` is returned unchanged. A pointer cycle throws.
 */
export function resolveRef(schema: JsonSchema, root: JsonSchema): JsonSchema {
  let current = schema;
  const seen = new Set<string>();
  while (typeof current.$ref === 'string') {
    const ref = current.$ref;
    if (seen.has(ref)) {
      throw new Error(`SchemaForm: circular $ref chain at "${ref}"`);
    }
    seen.add(ref);
    if (!ref.startsWith('#')) {
      throw new Error(`SchemaForm: only same-document $ref is supported, got "${ref}"`);
    }
    const segments = ref.split('/').slice(1).map(unescapePointerToken);
    let node: unknown = root;
    for (const segment of segments) {
      if (node === null || typeof node !== 'object') {
        throw new Error(`SchemaForm: unresolvable $ref "${ref}"`);
      }
      node = (node as Record<string, unknown>)[segment];
    }
    if (node === null || typeof node !== 'object') {
      throw new Error(`SchemaForm: unresolvable $ref "${ref}"`);
    }
    current = node as JsonSchema;
  }
  return current;
}

/** Does this schema describe the JSON `null` type (and nothing else)? */
export function isNullSchema(schema: JsonSchema): boolean {
  return schema.type === 'null';
}

/** The list of type tokens a schema declares, normalized to an array. */
export function typeList(schema: JsonSchema): readonly JsonSchemaType[] {
  const type = schema.type;
  if (type === undefined) return [];
  if (typeof type === 'string') return [type];
  return type;
}

/**
 * The union member list from a schema, if it is a union. Pydantic emits
 * discriminated unions under `oneOf` and plain/null unions under `anyOf`; both
 * are treated as a union here. `allOf` is NOT a union (it is an intersection)
 * and is not returned.
 */
export function unionMembers(schema: JsonSchema): readonly JsonSchema[] | undefined {
  if (schema.anyOf !== undefined) return schema.anyOf;
  if (schema.oneOf !== undefined) return schema.oneOf;
  return undefined;
}

/** An option row derived from an `enum` or a discriminated variant tag. */
export interface EnumOption {
  readonly value: unknown;
  readonly label: string;
}

/** Render-facing label for an arbitrary JSON scalar used as an enum/const value. */
export function scalarLabel(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(value);
}

/**
 * The single tag value a discriminated-union variant pins on the discriminator
 * property (Pydantic emits it as `const`, or a single-entry `enum`), or
 * `undefined` if the variant does not constrain that property to one value.
 */
export function variantTag(variant: JsonSchema, propertyName: string, root: JsonSchema): unknown {
  const resolved = resolveRef(variant, root);
  const prop = resolved.properties?.[propertyName];
  if (prop === undefined) return undefined;
  const propSchema = resolveRef(prop, root);
  if ('const' in propSchema) return propSchema.const;
  const enumValues = propSchema.enum;
  if (enumValues?.length === 1) return enumValues[0];
  return undefined;
}

/** A human label for a union variant: its title, its tag, or a positional fallback. */
export function variantLabel(
  variant: JsonSchema,
  index: number,
  discriminatorTag: unknown,
  root: JsonSchema,
): string {
  if (discriminatorTag !== undefined) return scalarLabel(discriminatorTag);
  const resolved = resolveRef(variant, root);
  if (typeof resolved.title === 'string' && resolved.title.length > 0) return resolved.title;
  return `Option ${String(index + 1)}`;
}
