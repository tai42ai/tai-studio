/**
 * The renderer-facing result types produced by `classifySchema`: the discriminated
 * `FieldModel`, the `ClassifiedField` envelope, and the annotation/variant shapes
 * they carry. Kept apart from the classifier logic so both the renderer and the
 * validator import the vocabulary without pulling in classification code.
 */
import type { EnumOption } from './resolve';
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

/** One top-level key of the expression's input document, with a one-line gloss. */
export interface ExpressionAnnotationKey {
  readonly name: string;
  readonly gloss: string;
}

/**
 * One named jq variable the expression may read as `$name` beside its `.` input:
 * its blurb and a representative sample the editor's Test panel binds it to. The
 * `x-tai42-expression` annotation carries these under `variables`; a field whose
 * `.` is its only input carries none.
 */
export interface ExpressionAnnotationVariable {
  readonly name: string;
  readonly blurb: string;
  /** True when the annotation carries a `sample` for this variable — tracked
   *  separately because a legitimate sample may be JSON `null`. */
  readonly hasSample: boolean;
  /** The sample value the Test panel binds `$name` to. Meaningful only when
   *  {@link hasSample} is true. */
  readonly sample: unknown;
}

/**
 * The `x-tai42-expression` annotation on a string schema: the server declares
 * that the field's value is authored in a pipeline expression language (only jq
 * today) and optionally describes what `.` is for that expression. The renderer
 * uses it to open the visual-editor door instead of a plain text box. The shape
 * mirrors jq-studio's input-shape descriptor WITHOUT importing it — classification
 * stays a pure schema concern; the renderer maps this onto a jq field declaration.
 */
export interface ExpressionAnnotation {
  /** The declared language. An unknown language never reaches here — it classifies
   *  as a plain string, so an older client renders a newer server's field as the
   *  ordinary text input it always was. */
  readonly language: 'jq';
  /** Short chip label for what `.` is (e.g. "node envelope"). */
  readonly label: string | undefined;
  /** One sentence describing what `.` is in this field. */
  readonly blurb: string | undefined;
  /** The top-level keys of `.`, each with a one-liner. */
  readonly keys: readonly ExpressionAnnotationKey[] | undefined;
  /** The named variables the expression reads as `$name` beside `.`. Absent when
   *  the annotation declares none (the field's `.` is its only input). */
  readonly variables: readonly ExpressionAnnotationVariable[] | undefined;
  /** What the expression must return (e.g. "true or false"). */
  readonly returns: string | undefined;
  /** Per-field caveats. */
  readonly caveats: readonly string[] | undefined;
  /** True when the annotation carries a `sample` — tracked separately because a
   *  legitimate sample may be JSON `null`. */
  readonly hasSample: boolean;
  /** A static skeleton of `.` for the Test panel. Meaningful only when
   *  {@link hasSample} is true. */
  readonly sample: unknown;
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
      /** Present when a well-formed `x-tai42-expression` annotation opts the
       *  field into the jq expression editor (see {@link ExpressionAnnotation}). */
      readonly expression: ExpressionAnnotation | undefined;
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
