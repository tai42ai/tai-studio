/**
 * Detect the annotations that opt a (ref-resolved) string schema out of the plain
 * text box: the media-upload annotations (`contentEncoding`/`contentMediaType`/
 * `format: "data-url"`) and the `x-tai42-expression` expression-editor annotation.
 * Both degrade to `undefined` on anything malformed, so an annotated field never
 * renders differently from the plain string it falls back to.
 */
import { isRecord } from '../guards';
import type {
  ExpressionAnnotation,
  ExpressionAnnotationKey,
  ExpressionAnnotationVariable,
  MediaUpload,
} from './field-model';
import type { JsonSchema } from './types';

const EXPRESSION_KEYWORD = 'x-tai42-expression';

/**
 * Detect the media-upload annotations on a (ref-resolved) string schema. A field
 * opts into the upload control when it carries `contentEncoding: "base64"` plus a
 * `contentMediaType`, OR `format: "data-url"`. Anything else is a plain string.
 */
export function mediaUpload(schema: JsonSchema): MediaUpload | undefined {
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

/** An optional string member: absent is fine, a non-string is a malformed annotation. */
type StringOrInvalid =
  { readonly ok: true; readonly value: string | undefined } | { readonly ok: false };

function optionalString(value: unknown): StringOrInvalid {
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value === 'string') return { ok: true, value };
  return { ok: false };
}

/** Parse the optional `keys` array: absent → `undefined`, malformed → `null` (reject). */
function parseAnnotationKeys(
  value: unknown,
): readonly ExpressionAnnotationKey[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const keys: ExpressionAnnotationKey[] = [];
  for (const entry of value as readonly unknown[]) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.gloss !== 'string') {
      return null;
    }
    keys.push({ name: entry.name, gloss: entry.gloss });
  }
  return keys;
}

/** Parse the optional `variables` array: absent → `undefined`, malformed → `null`
 *  (reject). Each entry needs a string `name` and `blurb`; `sample` is any JSON
 *  (including `null`), so its presence is tracked rather than typed. */
function parseAnnotationVariables(
  value: unknown,
): readonly ExpressionAnnotationVariable[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const variables: ExpressionAnnotationVariable[] = [];
  for (const entry of value as readonly unknown[]) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.blurb !== 'string') {
      return null;
    }
    variables.push({
      name: entry.name,
      blurb: entry.blurb,
      hasSample: 'sample' in entry,
      sample: entry.sample,
    });
  }
  return variables;
}

/** Parse the optional `caveats` array: absent → `undefined`, malformed → `null` (reject). */
function parseCaveatList(value: unknown): readonly string[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  const caveats: string[] = [];
  for (const entry of value as readonly unknown[]) {
    if (typeof entry !== 'string') return null;
    caveats.push(entry);
  }
  return caveats;
}

/**
 * Detect the `x-tai42-expression` annotation on a (ref-resolved) string schema,
 * mirroring {@link mediaUpload}: a well-formed annotation opts the field into the
 * jq expression editor; anything else — absent, non-object, unknown language, or
 * any wrongly-typed member — yields `undefined`, so the field renders EXACTLY as
 * the plain string input it is today. Malformed payloads NEVER throw: a bad
 * annotation is a server-side authoring bug, and degrading to the ordinary text
 * box keeps the form usable while staying byte-identical to the unannotated
 * rendering.
 */
export function expressionAnnotation(schema: JsonSchema): ExpressionAnnotation | undefined {
  const raw: unknown = schema[EXPRESSION_KEYWORD];
  if (!isRecord(raw)) return undefined;
  // The language gate doubles as the forward-compatibility valve: a future
  // language this client does not understand degrades to a plain string field.
  if (raw.language !== 'jq') return undefined;

  const label = optionalString(raw.label);
  const blurb = optionalString(raw.blurb);
  const returns = optionalString(raw.returns);
  if (!label.ok || !blurb.ok || !returns.ok) return undefined;

  const keys = parseAnnotationKeys(raw.keys);
  if (keys === null) return undefined;
  const variables = parseAnnotationVariables(raw.variables);
  if (variables === null) return undefined;
  const caveats = parseCaveatList(raw.caveats);
  if (caveats === null) return undefined;

  // `sample` is any JSON — including `null` — so presence is tracked, not typed.
  return {
    language: 'jq',
    label: label.value,
    blurb: blurb.value,
    keys,
    variables,
    returns: returns.value,
    caveats,
    hasSample: 'sample' in raw,
    sample: raw.sample,
  };
}
