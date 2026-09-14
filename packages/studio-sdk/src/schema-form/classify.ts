/**
 * The single source of truth for "what kind of field is this schema?". Both the
 * renderer and the validator classify through here so a construct is treated
 * identically everywhere. Classification resolves `$ref`, normalizes `anyOf`/
 * `oneOf` (null-union → nullable single field; multi-member → variant selector),
 * and lands every shape it has no structured editor for on the explicit `json`
 * kind (a free-form JSON textarea) — a field is never silently dropped, and a
 * shapeless one is edited as the JSON it is rather than dead-ending on a badge.
 */
import {
  isNullSchema,
  resolveRef,
  scalarLabel,
  typeList,
  unionMembers,
  variantLabel,
  variantTag,
  type EnumOption,
} from './resolve';
import type { ClassifiedField, UnionVariant } from './field-model';
import { expressionAnnotation, mediaUpload } from './string-annotations';
import type { JsonSchema } from './types';

function firstString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Land a shape the form has no structured editor for on the free-form JSON
 * fallback (a mono JSON textarea) rather than a dead badge — a field is never
 * silently dropped, and "any JSON" is the honest affordance for a shapeless one.
 * `jsonType` is the container a valid buffer must parse to; `nullable` carries
 * through so a nullable shape still accepts JSON `null`.
 */
function jsonFallback(
  schema: JsonSchema,
  jsonType: 'object' | 'array' | 'any',
  reason: string,
  title: string | undefined,
  description: string | undefined,
  nullable = false,
): ClassifiedField {
  return { model: { kind: 'json', jsonType, reason }, nullable, schema, title, description };
}

// const pins a single value. Null-acceptance is fully decidable here: the one
// permitted value either IS null or it is not. Without this, a `const: null`
// field would seed to null and then fail the validator's upstream "must not be
// null" gate before the equality check ever ran — permanently invalid.
function classifyConst(
  resolved: JsonSchema,
  title: string | undefined,
  description: string | undefined,
): ClassifiedField {
  return {
    model: { kind: 'const', value: resolved.const },
    nullable: resolved.const === null,
    schema: resolved,
    title,
    description,
  };
}

// enum → a fixed choice list.
function classifyEnum(
  resolved: JsonSchema,
  title: string | undefined,
  description: string | undefined,
): ClassifiedField {
  const enumValues = resolved.enum ?? [];
  const options: EnumOption[] = enumValues.map((value) => ({ value, label: scalarLabel(value) }));
  const nullable = enumValues.some((value) => value === null);
  return { model: { kind: 'enum', options }, nullable, schema: resolved, title, description };
}

// anyOf/oneOf union normalization.
function classifyUnion(
  resolved: JsonSchema,
  members: readonly JsonSchema[],
  root: JsonSchema,
  title: string | undefined,
  description: string | undefined,
): ClassifiedField {
  const nonNull = members.filter((member) => !isNullSchema(resolveRef(member, root)));
  const nullable = nonNull.length !== members.length;
  const soleNonNull = nonNull[0];
  if (soleNonNull === undefined) {
    // Every member is `null` — degenerate, but `null` is still valid, so edit
    // it as JSON (nullable) rather than dead-ending on a badge.
    return jsonFallback(
      resolved,
      'any',
      'union with no non-null members',
      title,
      description,
      true,
    );
  }
  if (nonNull.length === 1) {
    return classifySoleUnionMember(soleNonNull, resolved, root, nullable, title, description);
  }
  const discriminator = resolved.discriminator?.propertyName;
  const variants: UnionVariant[] = nonNull.map((member, index) => {
    const tag = discriminator === undefined ? undefined : variantTag(member, discriminator, root);
    return { label: variantLabel(member, index, tag, root), tag, schema: member };
  });
  return {
    model: { kind: 'union', variants, discriminator },
    nullable,
    schema: resolved,
    title,
    description,
  };
}

// A null-union of exactly one non-null member: delegate to that member.
function classifySoleUnionMember(
  soleNonNull: JsonSchema,
  resolved: JsonSchema,
  root: JsonSchema,
  nullable: boolean,
  title: string | undefined,
  description: string | undefined,
): ClassifiedField {
  const inner = classifySchema(soleNonNull, root);
  // Media annotations (`contentEncoding`/`contentMediaType`/`format: data-url`)
  // that land on the OUTER null-union wrapper of an OPTIONAL field would
  // otherwise be lost when delegating to the inner string member, silently
  // degrading an optional upload field to a plain text box. Re-detect them on
  // the wrapper and attach to the inner string model. The expression
  // annotation gets the same treatment for the same reason: an optional
  // annotated field must keep its editor door.
  const model =
    inner.model.kind === 'string'
      ? {
          ...inner.model,
          media: inner.model.media ?? mediaUpload(resolved),
          expression: inner.model.expression ?? expressionAnnotation(resolved),
        }
      : inner.model;
  return {
    model,
    nullable: nullable || inner.nullable,
    schema: inner.schema,
    title: title ?? inner.title,
    description: description ?? inner.description,
  };
}

// allOf: Pydantic wraps a single $ref this way; a multi-member intersection is
// not a form-renderable construct.
function classifyAllOf(
  resolved: JsonSchema,
  root: JsonSchema,
  title: string | undefined,
  description: string | undefined,
): ClassifiedField {
  const allOf = resolved.allOf ?? [];
  const soleAllOf = allOf[0];
  if (allOf.length === 1 && soleAllOf !== undefined) {
    const inner = classifySchema(soleAllOf, root);
    return {
      model: inner.model,
      nullable: inner.nullable,
      schema: inner.schema,
      title: title ?? inner.title,
      description: description ?? inner.description,
    };
  }
  // Whether the intersection accepts `null` is not statically decidable here
  // (it does iff EVERY member does), and the json escape hatch only enforces
  // what it KNOWS — so stay permissive like `jsonType: 'any'` itself and let
  // the server-side contract be the authority, rather than rejecting a null
  // the schema may well permit (e.g. an intersection of open schemas).
  return jsonFallback(
    resolved,
    'any',
    'allOf intersection of multiple schemas',
    title,
    description,
    true,
  );
}

function classifyString(
  resolved: JsonSchema,
  title: string | undefined,
  description: string | undefined,
  nullable: boolean,
): ClassifiedField {
  return {
    model: {
      kind: 'string',
      format: resolved.format,
      media: mediaUpload(resolved),
      expression: expressionAnnotation(resolved),
    },
    nullable,
    schema: resolved,
    title,
    description,
  };
}

function classifyArray(
  resolved: JsonSchema,
  title: string | undefined,
  description: string | undefined,
  nullable: boolean,
): ClassifiedField {
  if (resolved.items === undefined) {
    // A bare array with no item schema: no per-item editor to build, but the
    // value is still a JSON array — edit it whole as free-form JSON.
    return jsonFallback(
      resolved,
      'array',
      'array without an items schema',
      title,
      description,
      nullable,
    );
  }
  return {
    model: { kind: 'array', items: resolved.items },
    nullable,
    schema: resolved,
    title,
    description,
  };
}

function classifyObject(
  resolved: JsonSchema,
  title: string | undefined,
  description: string | undefined,
  nullable: boolean,
): ClassifiedField {
  if (resolved.properties === undefined) {
    // A free-form object typed by a VALUE SCHEMA (`additionalProperties` is a
    // schema, not `false`/`true`/absent) is a string→X map — renderable as
    // key/value rows. A boolean/absent `additionalProperties` carries no value
    // type to build an entry editor from, so it falls through to the free-form
    // JSON editor (constrained to a JSON object).
    // Read as `unknown`: the value is parsed JSON, where `additionalProperties:
    // null` is possible and `typeof null === 'object'` would otherwise classify
    // it as a record with a `null` value schema.
    const additional: unknown = resolved.additionalProperties;
    if (typeof additional === 'object' && additional !== null) {
      return {
        model: { kind: 'record', values: additional as JsonSchema },
        nullable,
        schema: resolved,
        title,
        description,
      };
    }
    return jsonFallback(
      resolved,
      'object',
      'free-form object with no property schema',
      title,
      description,
      nullable,
    );
  }
  const properties: (readonly [string, JsonSchema])[] = Object.entries(resolved.properties);
  const required = new Set(resolved.required ?? []);
  return {
    model: { kind: 'object', properties, required },
    nullable,
    schema: resolved,
    title,
    description,
  };
}

// Type-driven classification: a single non-null JSON type maps to its structured
// editor; no type, several types, or an unrecognized one lands on the JSON fallback.
function classifyByType(
  resolved: JsonSchema,
  title: string | undefined,
  description: string | undefined,
): ClassifiedField {
  const types = typeList(resolved);
  const nonNullTypes = types.filter((type) => type !== 'null');
  const nullableByType = nonNullTypes.length !== types.length;

  const type = nonNullTypes[0];
  if (nonNullTypes.length === 0 || type === undefined) {
    // No `type` at all (an open `{}` schema, or `type: "null"` alone) accepts any
    // JSON — the classic "any" field. Edit it as free-form JSON. Nullable is
    // always true here: `type: "null"` declares it, and an open schema with no
    // type keyword permits null like any other value (`nullableByType` would say
    // false for it only because there is no type list to find "null" in).
    return jsonFallback(
      resolved,
      'any',
      'schema declares no renderable type',
      title,
      description,
      true,
    );
  }
  if (nonNullTypes.length > 1) {
    return jsonFallback(
      resolved,
      'any',
      `multiple JSON types (${nonNullTypes.join(', ')}) without a discriminator`,
      title,
      description,
      nullableByType,
    );
  }
  switch (type) {
    case 'string':
      return classifyString(resolved, title, description, nullableByType);
    case 'number':
      return {
        model: { kind: 'number', integer: false },
        nullable: nullableByType,
        schema: resolved,
        title,
        description,
      };
    case 'integer':
      return {
        model: { kind: 'number', integer: true },
        nullable: nullableByType,
        schema: resolved,
        title,
        description,
      };
    case 'boolean':
      return {
        model: { kind: 'boolean' },
        nullable: nullableByType,
        schema: resolved,
        title,
        description,
      };
    case 'array':
      return classifyArray(resolved, title, description, nullableByType);
    case 'object':
      return classifyObject(resolved, title, description, nullableByType);
    default:
      return jsonFallback(
        resolved,
        'any',
        `unrecognized type "${String(type)}"`,
        title,
        description,
        nullableByType,
      );
  }
}

/**
 * Classify a schema node (resolving `$ref` first). `wrapper` metadata (a
 * ref-site title/description) is threaded down so a `{ $ref, title }` or a
 * null-union wrapper keeps its property-level label.
 */
export function classifySchema(raw: JsonSchema, root: JsonSchema): ClassifiedField {
  const resolved = resolveRef(raw, root);
  const title = firstString(raw.title, resolved.title);
  const description = firstString(raw.description, resolved.description);

  if ('const' in resolved) return classifyConst(resolved, title, description);
  if (resolved.enum !== undefined) return classifyEnum(resolved, title, description);
  const members = unionMembers(resolved);
  if (members !== undefined) return classifyUnion(resolved, members, root, title, description);
  if (resolved.allOf !== undefined) return classifyAllOf(resolved, root, title, description);
  return classifyByType(resolved, title, description);
}
