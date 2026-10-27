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
 * union variant switch): same walk, but every required field with a known empty
 * value is minted, so the committed seed has no missing required field. A minted
 * empty value may still fail its own value check (see the sibling's docstring).
 */
import { classifySchema } from './classify';
import type { FieldModel } from './field-model';
import type { JsonSchema } from './types';

type ModelOf<K extends FieldModel['kind']> = Extract<FieldModel, { kind: K }>;

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
  return finiteSeed(seedValue(schema, root, false, new Set()));
}

/**
 * A SELF-CONSISTENT skeleton for a schema — the seed a variant switch (or any
 * other programmatic reseed) commits as the field's new value. Where
 * {@link defaultValueForSchema} deliberately leaves a required scalar absent so
 * a fresh form flags it, a committed skeleton carries no missing required field,
 * so here EVERY required field with a known empty value is minted: required
 * strings seed `''`, numbers `0`, booleans `false`, a templated text an empty
 * inline source `{ content: '' }` — consistently with the `[]` / `{}` /
 * nested-object seeds the default path already mints. A minted empty value is
 * not promised to pass its own value check: an empty templated text fails it
 * ("needs inline content or a stored template"), as does `''` under a
 * `minLength` or a `pattern`, and validation reports that error like any
 * other. Kinds with no empty value to name (enum,
 * union, free-form JSON) stay absent either way: inventing a choice would be a
 * lie the user never made.
 */
export function skeletonValueForSchema(schema: JsonSchema, root: JsonSchema = schema): unknown {
  return finiteSeed(seedValue(schema, root, true, new Set()));
}

/**
 * The walk's answer when an object's required structure leads back into an object
 * shape it is already inside with no `null` accepted anywhere on the way: that
 * nesting never ends, so the object has no finite value.
 */
const NO_FINITE_VALUE: unique symbol = Symbol('no finite value');

/**
 * Thrown by {@link defaultValueForSchema} and {@link skeletonValueForSchema} when the
 * schema admits no finite value: a chain of required properties refers back to its
 * own definition with no `null` accepted on the way. A caller that seeds on a user
 * action catches exactly this type to show the failure on its field; any other error
 * is not a seeding outcome and propagates.
 */
export class NoFiniteValueError extends Error {
  constructor() {
    super(
      'SchemaForm: the schema admits no finite value: its required properties refer back to their own definition with no null accepted on the way',
    );
    this.name = 'NoFiniteValueError';
  }
}

/** The entry points' result: the seeded value, or {@link NoFiniteValueError} when none is finite. */
function finiteSeed(seed: unknown): unknown {
  if (seed === NO_FINITE_VALUE) throw new NoFiniteValueError();
  return seed;
}

/**
 * Seed an object's required nested structure and any optional property that
 * carries an explicit default. A required property recurses; an optional one is
 * materialized only when it declares a `default`, so its own required children
 * never raise errors on a field the user did not opt into.
 *
 * `expanding` holds the object shapes being seeded on the way down. Reaching one of
 * them again (a self-referencing definition) answers {@link NO_FINITE_VALUE}, and
 * so does an object with any required property that answers it. A `nullable` object
 * turns that answer into `null`, the value that ends the nesting there. So the
 * answer climbs to the nearest nullable object above the point where the cycle
 * closes, and reaches the entry point only when no object on the way accepts
 * `null`: then no finite value exists.
 */
function seedObject(
  model: ModelOf<'object'>,
  nullable: boolean,
  root: JsonSchema,
  mintScalars: boolean,
  expanding: ReadonlySet<object>,
): unknown {
  const seeded = seedProperties(model, root, mintScalars, expanding);
  return seeded === NO_FINITE_VALUE && nullable ? null : seeded;
}

/**
 * An object's own seed (see {@link seedObject}): its properties' seeds, or
 * {@link NO_FINITE_VALUE} when its shape is already being seeded above or a required
 * property has no finite value.
 */
function seedProperties(
  model: ModelOf<'object'>,
  root: JsonSchema,
  mintScalars: boolean,
  expanding: ReadonlySet<object>,
): unknown {
  if (expanding.has(model.shape)) return NO_FINITE_VALUE;
  const inside = new Set(expanding).add(model.shape);
  const entries: [string, unknown][] = [];
  for (const [name, propSchema] of model.properties) {
    if (model.required.has(name)) {
      const seeded = seedValue(propSchema, root, mintScalars, inside);
      if (seeded === NO_FINITE_VALUE) return NO_FINITE_VALUE;
      if (seeded !== undefined) entries.push([name, seeded]);
      continue;
    }
    const propClassified = classifySchema(propSchema, root);
    const propDefault = explicitDefault(propSchema, propClassified.schema);
    if (propDefault.present) entries.push([name, propDefault.value]);
  }
  // Built from entries so every property name, `__proto__` included, lands as an own key.
  return Object.fromEntries(entries);
}

/**
 * The empty value a required scalar mints in a committed skeleton: strings `''`,
 * numbers `0`, booleans `false`. Absent (left value-less) on the default path,
 * where a fresh form should flag the missing required scalar instead.
 */
function seedScalar(kind: 'string' | 'number' | 'boolean', mintScalars: boolean): unknown {
  if (!mintScalars) return undefined;
  switch (kind) {
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
  }
}

/**
 * The shared seeding walk. `mintScalars` distinguishes the two entry points
 * above: `false` leaves value-less required scalars absent; `true` mints their
 * type's empty value. `expanding` holds the object shapes being seeded on the way
 * down; a nullable object whose own seed has no finite value seeds `null` (see
 * {@link seedObject}).
 */
function seedValue(
  schema: JsonSchema,
  root: JsonSchema,
  mintScalars: boolean,
  expanding: ReadonlySet<object>,
): unknown {
  const classified = classifySchema(schema, root);
  const explicit = explicitDefault(schema, classified.schema);
  if (explicit.present) return explicit.value;

  const { model } = classified;
  switch (model.kind) {
    case 'const':
      return model.value;
    case 'object':
      return seedObject(model, classified.nullable, root, mintScalars, expanding);
    case 'array':
    case 'multiselect':
      return [];
    case 'record':
      return {};
    case 'string':
    case 'number':
    case 'boolean':
      return seedScalar(model.kind, mintScalars);
    case 'templated-text':
      // Inline is the templated text's own starting mode, so its empty value is an
      // empty inline source; the default path leaves it absent like a scalar.
      return mintScalars ? { content: '' } : undefined;
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
