/**
 * Payload-shape guards for the answer renderers: the props every submittable renderer
 * takes, the untrusted-payload coercions, the caller's per-field words, and the form's
 * initial value.
 */
import type { FormWording, Interaction, Wording } from '@tai42/api-client';
import { schemas } from '@tai42/api-client';
import type { FieldWords, JsonSchema } from '@tai42/studio-sdk';
import { defaultValueForSchema } from '@tai42/studio-sdk';

/** Props every submittable renderer takes. `onSubmit` emits the format's answer. */
export interface AnswerRendererProps {
  readonly interaction: Interaction;
  readonly onSubmit: (answer: unknown) => void;
  readonly disabled: boolean;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A non-blank trimmed string off the loose payload, else `undefined` (shows the default). */
export function nonBlankString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : value;
}

/**
 * The caller's one `wording` catalogue off the loose `format_payload`, or `undefined` when
 * absent or malformed — safeParsed so a bad shape falls back to the default words rather
 * than crashing the card (the labels are chrome, never an answer).
 */
export function wordingOf(payload: Record<string, unknown>): Wording | undefined {
  const parsed = schemas.wording.safeParse(payload.wording);
  return parsed.success ? parsed.data : undefined;
}

/**
 * One field's caller words: the SDK's `FieldWords` the `SchemaForm` and
 * `validateAgainstSchema` read, plus the boolean words the review readback reads.
 */
export interface FormFieldWords extends FieldWords {
  /** The readback's word for a boolean field's true value; absent reads "Yes". */
  readonly trueLabel?: string;
  /** The readback's word for a boolean field's false value; absent reads "No". */
  readonly falseLabel?: string;
}

/** The camel-cased word each `wording.form.fields` entry member maps to. */
const FIELD_WORD_MEMBERS = [
  ['choice_label', 'choiceLabel'],
  ['invalid', 'invalid'],
  ['required', 'required'],
  ['add_item', 'addItem'],
  ['remove_item', 'removeItem'],
  ['item_label', 'itemLabel'],
  ['no_items', 'noItems'],
  ['true_label', 'trueLabel'],
  ['false_label', 'falseLabel'],
] as const;

/**
 * The per-field words of `wording.form.fields`, keyed by property name, in the SDK's
 * `FieldWords` shape plus the readback's boolean words: `choiceLabel` the field picker's
 * placeholder, `invalid` the sentence shown in place of the field's shape errors,
 * `required` the sentence shown for its missing required value, `addItem` / `removeItem`
 * / `itemLabel` / `noItems` a list field's words, and `trueLabel` / `falseLabel` the
 * readback's words for a boolean value. Only non-blank words are carried, and only a
 * field with at least one is listed; `undefined` when none apply, so the form draws its
 * own default words. `length_hint` has no control here and is not carried.
 */
export function formFieldWording(
  fields: FormWording['fields'],
): Readonly<Record<string, FormFieldWords>> | undefined {
  if (fields == null) return undefined;
  const entries = Object.entries(fields).flatMap(([name, entry]) => {
    const words = Object.fromEntries(
      FIELD_WORD_MEMBERS.flatMap(([member, word]) => {
        const text = nonBlankString(entry[member]);
        return text === undefined ? [] : [[word, text] as const];
      }),
    ) as FormFieldWords;
    return Object.keys(words).length > 0 ? [[name, words] as const] : [];
  });
  // Built from entries so every field name, `__proto__` included, lands as an own key.
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** `value` as a `string[]`, or `null` when it is not an array of only strings. */
export function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === 'string');
  return strings.length === value.length ? strings : null;
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
