/**
 * Which variant of a union a given value currently inhabits. Discriminated
 * unions read the tag property directly; plain unions score each object variant
 * by how many of its required properties the value carries (a best-effort match
 * when Pydantic emitted no discriminator). Returns `-1` when no variant is
 * active (an unset/`null` value, or nothing matches).
 */
import { resolveRef } from './resolve';
import type { UnionVariant } from './classify';
import type { JsonSchema } from './types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Whether a resolved scalar schema accepts the runtime type of `value`. */
function scalarSchemaAccepts(schema: JsonSchema, value: unknown): boolean {
  if (schema.const !== undefined) return schema.const === value;
  if (schema.enum !== undefined) return schema.enum.includes(value);
  const types =
    schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  return types.some((type) => {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'integer':
        return typeof value === 'number' && Number.isInteger(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'null':
        return value === null;
      default:
        return false;
    }
  });
}

export function activeVariantIndex(
  value: unknown,
  variants: readonly UnionVariant[],
  discriminator: string | undefined,
  root: JsonSchema,
): number {
  if (value === undefined || value === null) return -1;

  if (discriminator !== undefined) {
    if (!isPlainObject(value)) return -1;
    const tag = value[discriminator];
    const index = variants.findIndex((variant) => variant.tag === tag);
    return index;
  }

  if (!isPlainObject(value)) {
    // A scalar value: match the first variant whose resolved schema accepts the
    // value's runtime type (a non-discriminated `Union[str, int]` and friends).
    return variants.findIndex((variant) =>
      scalarSchemaAccepts(resolveRef(variant.schema, root), value),
    );
  }

  let bestIndex = -1;
  let bestScore = -1;
  variants.forEach((variant, index) => {
    const resolved = resolveRef(variant.schema, root);
    const required = resolved.required ?? [];
    let score = 0;
    for (const key of required) {
      if (key in value) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}
