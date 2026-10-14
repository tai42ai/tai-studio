/**
 * Structural types for the JSON-Schema subset the auto-form supports. The shape
 * is deliberately PERMISSIVE — every field is optional and an open index
 * signature admits unknown keywords — because the schemas come from Pydantic v2
 * and may carry constructs the renderer does not consume. Unknown keys never
 * break typing; the renderer classifies a node and, for a shape it has no
 * structured control for, offers a free-form JSON editor rather than dropping it.
 */

/** The JSON-Schema `type` keyword values Pydantic emits. */
export type JsonSchemaType =
  'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null';

/**
 * The input KIND a `string` field collects, drawn as the matching keyboard or
 * native control. The vocabulary is the HTML `inputmode`/control naming of the
 * concept: `numeric`/`decimal` set a text box's keyboard hint; `tel`/`email`/`url`
 * select the matching native control. It draws, it does not validate.
 */
export type FormInputMode = 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url';

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
  readonly pattern?: string;
  /**
   * The input KIND a `string` field collects — a platform keyword (see {@link
   * FormInputMode}). The renderer draws the matching keyboard or native control:
   * `numeric`/`decimal` a text box with that keyboard hint (the value stays the
   * typed string, so `"007"` keeps its leading zeros), `tel`/`email`/`url` the
   * matching native control, `text` or absent a plain text box. It DRAWS, it does
   * not validate — the answer door still enforces `type`, `pattern` and `format`.
   * When present it OUTRANKS `format` for the control. A value outside the set is
   * read as absent (the server ask door is the authority that refuses it).
   */
  readonly inputMode?: FormInputMode;
  /**
   * Platform date-constraint keys on a `string`/`date` (or `date-time`) property. They
   * are NOT the JSON-Schema numeric keywords (which are inert on a string): `minDate`/
   * `maxDate` are inclusive `YYYY-MM-DD` bounds, `unavailableDates` is a list of
   * `YYYY-MM-DD` days to exclude. A date RANGE is TWO ordinary date fields: the END field
   * names its start field with `rangeStart` and carries the inclusive span in
   * `minDays`/`maxDays`; nothing is recombined. All optional; absent = an unconstrained
   * date. The native control enforces what it can (min/max) and the validator enforces the
   * rest, mirroring the server.
   */
  readonly minDate?: string;
  readonly maxDate?: string;
  readonly unavailableDates?: readonly string[];
  readonly rangeStart?: string;
  readonly minDays?: number;
  readonly maxDays?: number;
  /**
   * A declarative visibility predicate on a property: the field shows only when the
   * predicate holds against the current form values. Static form description evaluated by
   * the renderer (never a consumer reaction); a hidden field is not rendered and not
   * validated. Absent = always visible. See {@link VisibleWhen}.
   */
  readonly visibleWhen?: VisibleWhen;
  readonly [key: string]: unknown;
}

/**
 * A field-visibility predicate ({@link JsonSchema.visibleWhen}): the field is visible
 * only when the referenced sibling `field` satisfies exactly one operator — `equals` a
 * value, `in` a list of values, or `notEmpty` (a non-blank scalar / a non-empty array).
 * A malformed predicate (none or several operators) degrades to VISIBLE: the send-time
 * server validation rejects a malformed predicate loudly, so one never reaches a well-
 * formed render, and showing a field is the safe non-hiding default.
 */
export interface VisibleWhen {
  readonly field: string;
  readonly equals?: unknown;
  readonly in?: readonly unknown[];
  readonly notEmpty?: boolean;
}

/**
 * A structured, per-path bag of validation problems. Keys are dotted/bracketed
 * paths from the form root (`""` = the root value, `"user.name"`, `"tags[0]"`);
 * each entry is a loud, human-readable message. Empty object = valid.
 */
export type SchemaFormErrors = Readonly<Record<string, string>>;
