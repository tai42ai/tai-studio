/**
 * Payload-shape guards and schema derivation for the answer renderers: the props
 * every submittable renderer takes, the untrusted-payload coercions, and the
 * per-send schema the form answer validates against.
 */
import type { FormOption, Interaction } from '@tai42/api-client';
import { defaultValueForSchema } from '@tai42/studio-sdk';
import type { JsonSchema } from '@tai42/studio-sdk';

/** Props every submittable renderer takes. `onSubmit` emits the format's answer. */
export interface AnswerRendererProps {
  readonly interaction: Interaction;
  readonly onSubmit: (answer: unknown) => void;
  readonly disabled: boolean;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `value` as a `string[]`, or `null` when it is not an array of only strings. */
export function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length === value.length ? strings : null;
}

/** Whether a property node is array-shaped (`type: "array"`, alone or in a union). */
function isArraySchema(schema: JsonSchema): boolean {
  const { type } = schema;
  return Array.isArray(type) ? type.includes('array') : type === 'array';
}

/**
 * The schema the operator actually answers against. For every top-level property the
 * send re-optioned, its `enum` becomes that send's option VALUES — so the control
 * renders as a choice of exactly the valid values instead of a free control that only
 * fails at the answer door. This REPLACES any enum the published schema carried for
 * that property, for this send only. The served payload is never mutated: a fresh
 * derived schema is built, sharing untouched nodes. A property named in `options`
 * always exists and is string- or array-of-strings-typed (the ask door rejects any
 * other), so the enum lands on the property itself, or on an array's `items`.
 */
export function schemaWithSendOptions(
  schema: JsonSchema,
  options: Record<string, readonly FormOption[]>,
): JsonSchema {
  const active = Object.entries(options).filter(([, list]) => list.length > 0);
  const properties = schema.properties;
  if (active.length === 0 || properties === undefined) return schema;
  const nextProperties: Record<string, JsonSchema> = { ...properties };
  for (const [field, list] of active) {
    const prop = properties[field];
    if (prop === undefined) continue;
    const values = list.map((option) => option.value);
    nextProperties[field] = isArraySchema(prop)
      ? { ...prop, items: { ...prop.items, enum: values } }
      : { ...prop, enum: values };
  }
  return { ...schema, properties: nextProperties };
}

/**
 * The initial form value: the schema's defaults with any per-send `values` laid over
 * the top-level properties. A form schema is object-shaped, so the overlay is a
 * shallow merge; a non-object seed (no valid property to key onto) keeps the default.
 */
export function initialFormValue(schema: JsonSchema, values: Record<string, unknown>): unknown {
  const base = defaultValueForSchema(schema);
  if (Object.keys(values).length === 0) return base;
  return isPlainObject(base) ? { ...base, ...values } : base;
}
