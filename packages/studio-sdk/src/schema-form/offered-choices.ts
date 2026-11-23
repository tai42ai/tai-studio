/**
 * The rules of a form whose fields' choice lists are set per send and replaced by an
 * update while the form is open: the schema the answer is judged against (each listed
 * field's choices stamped as its `enum`), and the form value an update leaves (each
 * field kept within its new list, then the update's own values laid over it).
 */
import { isRecord, ownValue } from '../guards';
import type { JsonSchema } from './types';

/** One choice a field offers: the value an answer carries when it is picked. */
export interface FormChoice {
  readonly value: unknown;
}

/** The choice lists of a form's fields, keyed by top-level property name. */
export type FormChoiceLists = Readonly<Record<string, readonly FormChoice[]>>;

/** An update to an open form: fields given a new choice list, and fields given a new
 * value (`null` clears the field). */
export interface FormValueUpdate {
  readonly options: FormChoiceLists;
  readonly values: Readonly<Record<string, unknown>>;
}

/** Whether a property node is array-shaped (`type: "array"`, alone or in a union). */
export function isArraySchema(schema: JsonSchema): boolean {
  const { type } = schema;
  return Array.isArray(type) ? type.includes('array') : type === 'array';
}

/**
 * The schema the answer is judged against: for every top-level property with a non-empty
 * choice list, its `enum` becomes those choices' values — on the property itself, or on an
 * array's `items` — replacing any `enum` the published schema carried. A property the
 * schema does not declare is skipped. The given schema is never mutated: a fresh schema is
 * built, sharing untouched nodes.
 */
export function schemaWithSendOptions(schema: JsonSchema, options: FormChoiceLists): JsonSchema {
  const active = Object.entries(options).filter(([, list]) => list.length > 0);
  const properties = schema.properties;
  if (active.length === 0 || !isRecord(properties)) return schema;
  const nextProperties: Record<string, JsonSchema> = { ...properties };
  for (const [field, list] of active) {
    const prop = ownValue(properties, field);
    if (prop === undefined) continue;
    const values = list.map((option) => option.value);
    nextProperties[field] = isArraySchema(prop)
      ? { ...prop, items: { ...prop.items, enum: values } }
      : { ...prop, enum: values };
  }
  return { ...schema, properties: nextProperties };
}

/**
 * The form value with each field that `options` gives a new choice list keeping only what
 * that list offers: an array-shaped field keeps the entries it offers, a single-choice field
 * whose value it does not offer is removed (unfilled). Every other field, a field the schema
 * does not declare, and a field not yet filled, is returned as it is.
 */
export function withinOfferedChoices(
  schema: JsonSchema,
  value: unknown,
  options: FormChoiceLists,
): unknown {
  const properties = schema.properties;
  if (!isRecord(value) || !isRecord(properties)) return value;
  // Built from entries so every field name, `__proto__` included, lands as an own key.
  return Object.fromEntries(
    Object.entries(value).flatMap(([field, current]): [string, unknown][] => {
      const list = ownValue(options, field);
      const prop = ownValue(properties, field);
      if (list === undefined || prop === undefined || current === undefined || current === null)
        return [[field, current]];
      const offered = new Set<unknown>(list.map((option) => option.value));
      if (!isArraySchema(prop)) return offered.has(current) ? [[field, current]] : [];
      return [
        [field, Array.isArray(current) ? current.filter((entry) => offered.has(entry)) : current],
      ];
    }),
  );
}

/**
 * The form value an update leaves: each field the update gives a new choice list keeps only
 * what that list offers (`withinOfferedChoices`), then the update's own `values` are laid
 * over the result, never filtered. A `null` member clears its field: the key is removed, the
 * state of an unfilled field, so the required check and the answer read it as unanswered.
 */
export function withFoldedUpdate(
  schema: JsonSchema,
  value: unknown,
  update: FormValueUpdate,
): Record<string, unknown> {
  const kept = withinOfferedChoices(schema, value, update.options);
  const merged = { ...(isRecord(kept) ? kept : {}), ...update.values };
  // Built from entries so every field name, `__proto__` included, lands as an own key.
  return Object.fromEntries(
    Object.entries(merged).filter(
      ([name]) => !(Object.hasOwn(update.values, name) && update.values[name] === null),
    ),
  );
}
