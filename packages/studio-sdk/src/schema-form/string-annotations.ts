/**
 * Detect the vendor and media annotations that opt a property out of its plain
 * editor: the media-upload annotations (`contentEncoding`/`contentMediaType`/
 * `format: "data-url"`) on a string, the `x-tai42-expression` expression-editor
 * annotation on a string or templated-text property (or on a union of them, where
 * it governs every member), and the `x-tai42-templated-text` mark the platform's
 * templated-text type carries. The first two degrade to
 * `undefined` on anything malformed, so an annotated field never renders differently
 * from the plain field it falls back to.
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
const TEMPLATED_TEXT_KEYWORD = 'x-tai42-templated-text';

/**
 * Is this (ref-resolved) schema the platform's templated-text type? The type stamps
 * `x-tai42-templated-text` on its own schema, so every property of the type is
 * recognised by the mark, never by a field name or a property layout.
 */
export function isTemplatedText(schema: JsonSchema): boolean {
  return isRecord(schema[TEMPLATED_TEXT_KEYWORD]);
}

/**
 * A schema node as its property site declares it: the `x-tai42-expression`
 * annotation sits on the property site (a union wrapper, or the node holding a
 * `$ref`), and it governs the node the value is checked against (the union member
 * the value takes, or the referenced definition), so a node that carries none of its
 * own gets the site's. The node is returned unchanged when there is nothing to carry.
 */
export function withSiteExpression(member: JsonSchema, site: JsonSchema): JsonSchema {
  const annotation: unknown = site[EXPRESSION_KEYWORD];
  if (annotation === undefined || member[EXPRESSION_KEYWORD] !== undefined) return member;
  return { ...member, [EXPRESSION_KEYWORD]: annotation };
}

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
 * Detect the `x-tai42-expression` annotation on a property schema (a string, or the
 * property site of a templated-text field), mirroring {@link mediaUpload}: a
 * well-formed annotation opts the field into the jq expression editor; anything
 * else — absent, non-object, unknown language, or any wrongly-typed member — yields
 * `undefined`, so the field renders EXACTLY as its unannotated editor. Malformed
 * payloads NEVER throw: a bad annotation is a server-side authoring bug, and
 * degrading to the ordinary editor keeps the form usable while staying
 * byte-identical to the unannotated rendering.
 */
export function expressionAnnotation(schema: JsonSchema): ExpressionAnnotation | undefined {
  const raw: unknown = schema[EXPRESSION_KEYWORD];
  if (!isRecord(raw)) return undefined;
  // The language gate doubles as the forward-compatibility valve: a future
  // language this client does not understand degrades to the unannotated field.
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
