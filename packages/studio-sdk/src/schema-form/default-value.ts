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
          const seeded = defaultValueForSchema(propSchema, root);
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
    case 'enum':
    case 'string':
    case 'number':
    case 'boolean':
    case 'union':
    case 'unsupported':
      return undefined;
  }
}
