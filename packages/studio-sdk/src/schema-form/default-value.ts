/**
 * `defaultValueForSchema` — the initial form value for a schema, honoring
 * `default`/`const` and seeding required nested structure.
 *
 * Inclusion rules keep the seed honest:
 *  - a REQUIRED property is seeded (objects → a nested seed, arrays → `[]`); a
 *    required scalar with no default is left ABSENT so validation flags it
 *    rather than inventing a value;
 *  - an OPTIONAL property is included only when it carries an explicit
 *    `default` — an optional object/array is NOT auto-materialized, so its own
 *    required children can't raise spurious errors on a field the user never
 *    opted into.
 *
 * `skeletonValueForSchema` is the sibling entry for programmatic reseeds (a
 * union variant switch): same walk, but required scalars mint their type's
 * empty value so the committed seed validates against its own schema.
 */
import { classifySchema } from './classify';
import type { JsonSchema } from './types';

/** The explicit `default` (wrapper takes precedence over the resolved node), if any. */
function explicitDefault(
  raw: JsonSchema,
  resolved: JsonSchema,
): { present: boolean; value: unknown } {
  if ('default' in raw) return { present: true, value: raw.default };
  if ('default' in resolved) return { present: true, value: resolved.default };
  return { present: false, value: undefined };
}

/**
 * The initial value for a schema. `root` carries the `$defs` document for
 * `$ref` resolution and defaults to the schema itself (the common
 * whole-tool-schema call).
 */
export function defaultValueForSchema(schema: JsonSchema, root: JsonSchema = schema): unknown {
  return seedValue(schema, root, false);
}

/**
 * A SELF-CONSISTENT skeleton for a schema — the seed a variant switch (or any
 * other programmatic reseed) commits as the field's new value. Where
 * {@link defaultValueForSchema} deliberately leaves a required scalar absent so
 * a fresh form flags it, a committed skeleton must validate against its own
 * schema, so here EVERY required field with a known empty value is minted:
 * required strings seed `''`, numbers `0`, booleans `false` — consistently with
 * the `[]` / `{}` / nested-object seeds the default path already mints. Kinds
 * with no empty value to name (enum, union, free-form JSON) stay absent either
 * way: inventing a choice would be a lie the user never made.
 */
export function skeletonValueForSchema(schema: JsonSchema, root: JsonSchema = schema): unknown {
  return seedValue(schema, root, true);
}

/**
 * The shared seeding walk. `mintScalars` distinguishes the two entry points
 * above: `false` leaves value-less required scalars absent; `true` mints their
 * type's empty value.
 */
function seedValue(schema: JsonSchema, root: JsonSchema, mintScalars: boolean): unknown {
  const classified = classifySchema(schema, root);
  const explicit = explicitDefault(schema, classified.schema);
  if (explicit.present) return explicit.value;

  const { model } = classified;
  switch (model.kind) {
    case 'const':
      return model.value;
    case 'object': {
      const result: Record<string, unknown> = {};
      for (const [name, propSchema] of model.properties) {
        if (model.required.has(name)) {
          const seeded = seedValue(propSchema, root, mintScalars);
          if (seeded !== undefined) result[name] = seeded;
          continue;
        }
        const propClassified = classifySchema(propSchema, root);
        const propDefault = explicitDefault(propSchema, propClassified.schema);
        if (propDefault.present) result[name] = propDefault.value;
      }
      return result;
    }
    case 'array':
      return [];
    case 'record':
      return {};
    case 'string':
      return mintScalars ? '' : undefined;
    case 'number':
      return mintScalars ? 0 : undefined;
    case 'boolean':
      return mintScalars ? false : undefined;
    case 'enum':
    case 'union':
    case 'json':
      // A free-form JSON field starts ABSENT (its editor seeds an empty buffer),
      // like the other value-less kinds: an optional one never invents a value,
      // and a required one is left absent so validation flags it. These kinds
      // have no honest empty value even for a minted skeleton — an enum or a
      // union would need a CHOICE invented on the user's behalf.
      return undefined;
  }
}
