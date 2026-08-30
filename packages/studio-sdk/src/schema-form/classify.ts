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
import type { JsonSchema } from './types';

/**
 * How a string field accepts binary content as a JSON-serializable string.
 * Derived from a field's JSON-Schema media annotations (see the `SchemaForm` module).
 */
export interface MediaUpload {
  /**
   * `base64` — the emitted value is the raw base64 body (no `data:` prefix),
   * matching `contentEncoding: "base64"`. `data-url` — the emitted value is a
   * full `data:<mime>;base64,<body>` URL, matching `format: "data-url"`.
   */
  readonly encoding: 'base64' | 'data-url';
  /**
   * The `contentMediaType` constraint (e.g. `image/*`, `application/pdf`), used
   * for MIME validation and the file picker's `accept`. `undefined` for a bare
   * `format: "data-url"` field with no declared type.
   */
  readonly mediaType: string | undefined;
  /** A per-field byte cap from `contentMaxBytes`, if the schema pins one. */
  readonly maxBytes: number | undefined;
}

/** One selectable variant of a union field. */
export interface UnionVariant {
  readonly label: string;
  /** The discriminator tag value, or `undefined` for a non-discriminated union. */
  readonly tag: unknown;
  /** The variant schema as written (unresolved — the renderer resolves it). */
  readonly schema: JsonSchema;
}

/** The renderer-facing classification of a schema node. */
export type FieldModel =
  | { readonly kind: 'const'; readonly value: unknown }
  | { readonly kind: 'enum'; readonly options: readonly EnumOption[] }
  | {
      readonly kind: 'string';
      readonly format: string | undefined;
      /** Present when media annotations opt the field into the upload control. */
      readonly media: MediaUpload | undefined;
    }
  | { readonly kind: 'number'; readonly integer: boolean }
  | { readonly kind: 'boolean' }
  | { readonly kind: 'array'; readonly items: JsonSchema }
  | {
      readonly kind: 'object';
      readonly properties: readonly (readonly [string, JsonSchema])[];
      readonly required: ReadonlySet<string>;
    }
  | {
      // A string-keyed map typed by `additionalProperties` (no fixed
      // `properties`), edited as key/value rows. `values` is the entry value
      // schema AS WRITTEN — the entry editor resolves any `$ref` itself, exactly
      // as `array.items` is.
      readonly kind: 'record';
      readonly values: JsonSchema;
    }
  | {
      readonly kind: 'union';
      readonly variants: readonly UnionVariant[];
      readonly discriminator: string | undefined;
    }
  | {
      // A shape with no structured editor to build — a property-less object, a
      // bare `additionalProperties`-open object, an items-less array, an empty/
      // multi-type/`allOf` schema. It is NOT undroppable: every one of these still
      // describes JSON, so the renderer edits it as free-form JSON in a mono
      // textarea rather than dead-ending on a badge. `jsonType` is the container
      // the schema commits to, so a valid buffer must parse to it (`'any'` = no
      // constraint beyond "is JSON"); `reason` records which shape fell through.
      readonly kind: 'json';
      readonly jsonType: 'object' | 'array' | 'any';
      readonly reason: string;
    };

/** A fully classified field: its model plus resolved metadata. */
export interface ClassifiedField {
  readonly model: FieldModel;
  /** True when JSON `null` is an accepted value (a null-union member). */
  readonly nullable: boolean;
  /** The effective (ref-resolved) schema this classification describes. */
  readonly schema: JsonSchema;
  readonly title: string | undefined;
  readonly description: string | undefined;
}

function firstString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

/**
 * Detect the media-upload annotations on a (ref-resolved) string schema. A field
 * opts into the upload control when it carries `contentEncoding: "base64"` plus a
 * `contentMediaType`, OR `format: "data-url"`. Anything else is a plain string.
 */
function mediaUpload(schema: JsonSchema): MediaUpload | undefined {
  const mediaType =
    typeof schema.contentMediaType === 'string' ? schema.contentMediaType : undefined;
  const maxBytes =
    typeof schema.contentMaxBytes === 'number' && schema.contentMaxBytes > 0
      ? schema.contentMaxBytes
      : undefined;
  if (schema.format === 'data-url') {
    return { encoding: 'data-url', mediaType, maxBytes };
  }
  if (schema.contentEncoding === 'base64' && mediaType !== undefined) {
    return { encoding: 'base64', mediaType, maxBytes };
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

/**
 * Classify a schema node (resolving `$ref` first). `wrapper` metadata (a
 * ref-site title/description) is threaded down so a `{ $ref, title }` or a
 * null-union wrapper keeps its property-level label.
 */
export function classifySchema(raw: JsonSchema, root: JsonSchema): ClassifiedField {
  const resolved = resolveRef(raw, root);
  const title = firstString(raw.title, resolved.title);
  const description = firstString(raw.description, resolved.description);

  // const pins a single value.
  if ('const' in resolved) {
    return {
      model: { kind: 'const', value: resolved.const },
      nullable: false,
      schema: resolved,
      title,
      description,
    };
  }

  // enum → a fixed choice list.
  if (resolved.enum !== undefined) {
    const options: EnumOption[] = resolved.enum.map((value) => ({
      value,
      label: scalarLabel(value),
    }));
    const nullable = resolved.enum.some((value) => value === null);
    return { model: { kind: 'enum', options }, nullable, schema: resolved, title, description };
  }

  // anyOf/oneOf union normalization.
  const members = unionMembers(resolved);
  if (members !== undefined) {
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
      const inner = classifySchema(soleNonNull, root);
      // Media annotations (`contentEncoding`/`contentMediaType`/`format: data-url`)
      // that land on the OUTER null-union wrapper of an OPTIONAL field would
      // otherwise be lost when delegating to the inner string member, silently
      // degrading an optional upload field to a plain text box. Re-detect them on
      // the wrapper and attach to the inner string model.
      const model =
        inner.model.kind === 'string' && inner.model.media === undefined
          ? { ...inner.model, media: mediaUpload(resolved) }
          : inner.model;
      return {
        model,
        nullable: nullable || inner.nullable,
        schema: inner.schema,
        title: title ?? inner.title,
        description: description ?? inner.description,
      };
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

  // allOf: Pydantic wraps a single $ref this way; a multi-member intersection is
  // not a form-renderable construct.
  if (resolved.allOf !== undefined) {
    const soleAllOf = resolved.allOf[0];
    if (resolved.allOf.length === 1 && soleAllOf !== undefined) {
      const inner = classifySchema(soleAllOf, root);
      return {
        model: inner.model,
        nullable: inner.nullable,
        schema: inner.schema,
        title: title ?? inner.title,
        description: description ?? inner.description,
      };
    }
    return jsonFallback(
      resolved,
      'any',
      'allOf intersection of multiple schemas',
      title,
      description,
    );
  }

  // Type-driven classification.
  const types = typeList(resolved);
  const nonNullTypes = types.filter((type) => type !== 'null');
  const nullableByType = nonNullTypes.length !== types.length;

  if (nonNullTypes.length === 0) {
    // No `type` at all (an open `{}` schema, or `type: "null"` alone) accepts any
    // JSON — the classic "any" field. Edit it as free-form JSON.
    return jsonFallback(
      resolved,
      'any',
      'schema declares no renderable type',
      title,
      description,
      nullableByType,
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

  const type = nonNullTypes[0];
  if (type === undefined) {
    return jsonFallback(
      resolved,
      'any',
      'schema declares no renderable type',
      title,
      description,
      nullableByType,
    );
  }
  switch (type) {
    case 'string':
      return {
        model: { kind: 'string', format: resolved.format, media: mediaUpload(resolved) },
        nullable: nullableByType,
        schema: resolved,
        title,
        description,
      };
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
    case 'array': {
      if (resolved.items === undefined) {
        // A bare array with no item schema: no per-item editor to build, but the
        // value is still a JSON array — edit it whole as free-form JSON.
        return jsonFallback(
          resolved,
          'array',
          'array without an items schema',
          title,
          description,
          nullableByType,
        );
      }
      return {
        model: { kind: 'array', items: resolved.items },
        nullable: nullableByType,
        schema: resolved,
        title,
        description,
      };
    }
    case 'object': {
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
            nullable: nullableByType,
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
          nullableByType,
        );
      }
      const properties: (readonly [string, JsonSchema])[] = Object.entries(resolved.properties);
      const required = new Set(resolved.required ?? []);
      return {
        model: { kind: 'object', properties, required },
        nullable: nullableByType,
        schema: resolved,
        title,
        description,
      };
    }
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
