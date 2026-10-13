/** Interaction question, answer and media response schemas. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';
import * as served from '../generated/served-schemas';

// Shapes match the skeleton's interactions SSE contract: the SSE
// `interaction.add` frame carries the question and its answer format; the answer
// door returns { interaction_id, status }. `answered` is not a wire field — it
// is a client-side flag the stream hook flips on an `interaction.answered` event.

export const answerFormat = openapi.answerFormat;
export type AnswerFormat = z.infer<typeof answerFormat>;

/** The kind of a display-only media item: an image, a link, or a document, video or audio file. */
export const mediaKind = openapi.mediaKind;
export type MediaKind = z.infer<typeof mediaKind>;

/**
 * One item of a question's display-only media. The renderer resolves `url` (the image src
 * scheme gate and the link neutralization are enforced there); `caption` and `filename`
 * are `null` when absent.
 */
export const interactionMediaItem = openapi.mediaItem;
export type InteractionMediaItem = z.infer<typeof interactionMediaItem>;

/** The kind of an inbound attachment carried on a transcript record. */
export const attachmentMediaKind = openapi.mediaKind;
export type AttachmentMediaKind = z.infer<typeof attachmentMediaKind>;

/**
 * One inbound attachment a participant sent, projected onto a transcript record's
 * `inbound_attachments`. `url` is the served-media reference the renderer resolves to the
 * API origin (the same served-url discipline the ask-media renderer uses); the image src
 * scheme gate and the per-item load-failure notice are enforced there. `filename` is
 * meaningful only for a `document`; the renderer shows it as the download label.
 */
export const attachmentMediaItem = openapi.mediaItem;
export type AttachmentMediaItem = z.infer<typeof attachmentMediaItem>;

/**
 * One per-send choice for a `form` property whose schema is a string (or array of
 * strings). `value` is what the answer carries; `label` (absent OR null both parse
 * to no label) is the human text shown in its place. A send may replace a property's
 * `enum` this way for one ask without republishing the form. Applied per property by
 * the form preview (safeParsed), so a malformed entry is a loud notice, never silent.
 */
export const formOption = openapi.formOption;
export type FormOption = z.infer<typeof formOption>;

/**
 * Per-send `form` data: `values` prefills top-level properties (keyed by property
 * name), `options` supplies per-send choice lists (keyed by property name). Both
 * default to empty. The form preview safeParses this off `format_payload.data`, so a
 * malformed block is a loud notice rather than a whole-frame parse failure.
 */
export const formData = openapi.formData;
export type FormData = z.infer<typeof formData>;

/** The kind of an ordered display block a page may carry alongside its input fields. */
export const displayBlockKind = openapi.displayBlock.shape.kind;
export type DisplayBlockKind = z.infer<typeof displayBlockKind>;

/**
 * One ordered, display-only block on a form page (never an input): a `heading` or
 * `body` text block, or an `image`. `text` carries a heading/body's words; `src`/`alt`
 * carry an image's source and alt text. An optional `slot` names a data key whose value
 * the block shows in place of static `text` — filled from `format_payload.data` at send
 * and/or by a reaction's `display` update (so a computed total is a display slot, not a
 * special case). Every text field is `.nullish()` (absent OR explicit `null` both parse
 * to absent) so a block that omits a key — or sends an explicit `null` — is not a
 * whole-page parse failure. Applied per block by the preview (safeParsed via its page),
 * so a malformed block is a loud notice, never silent.
 */
export const displayBlock = openapi.displayBlock;
export type DisplayBlock = z.infer<typeof displayBlock>;

/** A page's role: an ordinary `input` page (default) or a terminal `review` summary. */
export const formPageKind = openapi.formPage.shape.kind.unwrap();
export type FormPageKind = z.infer<typeof formPageKind>;

/**
 * One page of a stepped `form`: a `title` and the ordered top-level property names it
 * groups. `format_payload.pages` is the ordered list of these; absent = one page. The
 * form preview safeParses the list, so a malformed page is a loud notice, never silent.
 *
 * `display` is the ordered list of display-only blocks the page shows alongside (or
 * instead of, for a review page) its input fields; it defaults to empty, so a page that
 * carries none renders exactly as before. `kind` marks a `review` page — a terminal
 * summary step that shows the readback of entered values and the confirm/submit footer
 * and carries no new input fields; it defaults to `input`. Both are additive: an older
 * payload ({title, fields}) parses unchanged.
 */
export const formPage = openapi.formPage;
export type FormPage = z.infer<typeof formPage>;

/** The `form` pages list (`format_payload.pages`), safeParsed as a whole by the preview. */
export const formPages = z.array(formPage);
export type FormPages = z.infer<typeof formPages>;

// The form reactions and the form update are hand-written: the spec carries them inside an
// open `format_payload` and an open reaction `update`.

/**
 * When a `form` reacts while it is open (`format_payload.reactions`): the plain,
 * renderer-readable description of WHEN the form calls its reaction handler. Absent ⇒ a
 * static (non-reacting) form, exactly as before. `field_changed` names the fields whose
 * change triggers a reaction; `page_advanced` names the pages (by title) whose advance
 * triggers one; `submitted` is true when the submission is checked by a reaction before
 * acceptance; `choices` names the fields whose CHOICE LISTS a reaction may replace while
 * the form is open (for such a field the send-time option list is advisory — the consumer
 * owns membership at the `submitted` event). Every member defaults to empty/false so a
 * partial declaration parses; a malformed block is a loud notice via the preview.
 */
export const formReactions = z.object({
  field_changed: z.array(z.string()).default([]),
  page_advanced: z.array(z.string()).default([]),
  submitted: z.boolean().default(false),
  choices: z.array(z.string()).default([]),
});
export type FormReactions = z.infer<typeof formReactions>;

/**
 * The form update a reaction door returns (`POST /api/interactions/{id}/react`, its
 * `update`): the same kind of data a form is sent with, applied to the open form. `values`
 * sets field values; `options` replaces the per-send choice list of option-bearing fields;
 * `errors` shows per-field messages (keyed by field name); `display` fills display slots
 * (keyed by slot name) — a computed total among them. Every member defaults to empty, so a
 * reaction that touches only one of them returns only that one. The door response is safeParsed, so
 * a malformed update surfaces loudly rather than applying a half-understood change.
 */
export const formUpdate = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  options: z.record(z.string(), z.array(formOption)).default({}),
  errors: z.record(z.string(), z.string()).default({}),
  display: z.record(z.string(), z.unknown()).default({}),
});
export type FormUpdate = z.infer<typeof formUpdate>;

/**
 * The event a reaction round-trip reports to the door (the contract's `FormReactionEvent`
 * document): `kind` is which of the three declared events fired, `field` names the changed
 * field for a `field_changed` event, and `page` names the advanced-from page (by title) for a
 * `page_advanced` event. A `submitted` event carries neither. The body also carries the
 * partial `values` filled so far (see {@link interactionsClient}'s `reactInteraction`).
 */
export const reactionEvent = served.formReactionEvent;
export type ReactionEvent = z.infer<typeof reactionEvent>;
export type ReactionEventKind = ReactionEvent['kind'];

/** The reaction door's reply: the interaction id and the form `update` to apply. */
export const interactionReaction = openapi.interactionReactionResult.extend({ update: formUpdate });
export type InteractionReaction = z.infer<typeof interactionReaction>;

export const interaction = openapi.interactionFrame.extend({
  // Hand-written: the format-specific payload (select options, form JSON schema with
  // optional per-send `data` and `pages`, external url) is `null` for formats that carry
  // none (text/confirm); it is normalized to `{}` so consumers always see an object.
  format_payload: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((value) => value ?? {}),
});
export type Interaction = z.infer<typeof interaction>;

/** The answer door's response — the blocked caller was woken. */
export const interactionAnswered = openapi.interactionActionResult;
export type InteractionAnswered = z.infer<typeof interactionAnswered>;

/**
 * The cancel door's response — a pending ask was WITHDRAWN without an answer (the
 * asking flow does not resume). `status` is `"cancelled"`; the shape mirrors the
 * answer door's terminal reply, but the door is distinct so it carries its own
 * schema.
 */
export const interactionCancelled = openapi.interactionActionResult;
export type InteractionCancelled = z.infer<typeof interactionCancelled>;

/**
 * A page of pending interactions from `GET /api/interactions?page=&pageSize=`. Each
 * item is the same record the stream's `interaction.add` frame carries. The pending
 * set is the paged base the tail-only stream applies live deltas over.
 */
export const interactionsPage = openapi.interactionWindow.extend({ items: z.array(interaction) });
export type InteractionsPage = z.infer<typeof interactionsPage>;
