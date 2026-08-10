/**
 * Structural types for the JSON-Schema subset the auto-form supports. The shape
 * is deliberately PERMISSIVE — every field is optional and an open index
 * signature admits unknown keywords — because the schemas come from Pydantic v2
 * and may carry constructs the renderer does not consume. Unknown keys never
 * break typing; the renderer classifies a node and surfaces anything it cannot
 * render as a LOUD "unsupported field" notice rather than dropping it.
 */

/** The JSON-Schema `type` keyword values Pydantic emits. */
export type JsonSchemaType =
  'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

/** A Pydantic-style discriminated-union tag: which property selects the variant. */
export interface Discriminator {
  readonly propertyName: string;
  readonly mapping?: Readonly<Record<string, string>>;
}

/**
 * A structural JSON Schema node. All keys optional; the index signature keeps
 * the type permissive so an unrecognized keyword is never a type error — it is a
 * runtime classification concern the renderer handles.
 */
export interface JsonSchema {
  readonly $ref?: string;
  readonly $defs?: Readonly<Record<string, JsonSchema>>;
  readonly definitions?: Readonly<Record<string, JsonSchema>>;
  readonly type?: JsonSchemaType | readonly JsonSchemaType[];
  readonly title?: string;
  readonly description?: string;
  readonly default?: unknown;
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly format?: string;
  /**
   * Media annotations (see the `SchemaForm` module). `contentEncoding: "base64"`
   * together with `contentMediaType` (or `format: "data-url"`) opts a string
   * field into the upload control; `contentMaxBytes` pins a per-field size cap.
   *
   * `contentMaxBytes` is a NONSTANDARD JSON-Schema extension keyword — a standard
   * JSON-Schema validator ignores it. The client-side caps it drives (see the
   * `media` module) are UX guards, NOT a security boundary: the SERVER MUST
   * independently validate the decoded size of any uploaded content.
   */
  readonly contentEncoding?: string;
  readonly contentMediaType?: string;
  readonly contentMaxBytes?: number;
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly items?: JsonSchema;
  readonly anyOf?: readonly JsonSchema[];
  readonly oneOf?: readonly JsonSchema[];
  readonly allOf?: readonly JsonSchema[];
  readonly discriminator?: Discriminator;
  readonly additionalProperties?: boolean | JsonSchema;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly [key: string]: unknown;
}

/**
 * A structured, per-path bag of validation problems. Keys are dotted/bracketed
 * paths from the form root (`""` = the root value, `"user.name"`, `"tags[0]"`);
 * each entry is a loud, human-readable message. Empty object = valid.
 */
export type SchemaFormErrors = Readonly<Record<string, string>>;
