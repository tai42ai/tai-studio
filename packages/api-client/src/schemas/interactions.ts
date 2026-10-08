/** Interaction question, answer and media response schemas. */
import { z } from 'zod';

import { pageWindow } from './shared';

// Shapes match the skeleton's interactions SSE contract: the SSE
// `interaction.add` frame carries the question and its answer format; the answer
// door returns { interaction_id, status }. `answered` is not a wire field — it
// is a client-side flag the stream hook flips on an `interaction.answered` event.

export const answerFormat = z.enum(['text', 'confirm', 'select', 'form', 'external']);
export type AnswerFormat = z.infer<typeof answerFormat>;

/** The kind of a question's display-only media item: a remote/inline image, or a link. */
export const mediaKind = z.enum(['image', 'link']);
export type MediaKind = z.infer<typeof mediaKind>;

/**
 * One item of a question's display-only media. Applied PER ITEM by the renderer
 * (never as a strict array on the frame): the frame's `media` field is a loose
 * `z.array(z.unknown())`, and the renderer `safeParse`s each item with this schema
 * so one malformed/hostile item is a loud per-item notice, not a whole-frame parse
 * failure that would silently vanish an answerable question.
 *
 * `caption` is `.nullish()` (absent OR `null` both parse to a caption-less item):
 * a caption-less item may arrive with the key omitted OR with an explicit `null`, so
 * `.optional()` here would false-fail the explicit `null` and render a good image as
 * malformed. `url` and `kind` are the only load-bearing fields; the image
 * src scheme gate and the link neutralization are enforced by the renderer.
 */
export const interactionMediaItem = z.object({
  kind: mediaKind,
  url: z.string(),
  caption: z.string().nullish(),
});
export type InteractionMediaItem = z.infer<typeof interactionMediaItem>;

/**
 * The kind of a byte-backed inbound attachment carried on a transcript record. A
 * fetchable file — `image`/`document`/`audio`/`video` — never a `link`: a labelled
 * anchor is question CONTEXT (see {@link mediaKind}), not a participant's sent file.
 */
export const attachmentMediaKind = z.enum(['image', 'document', 'audio', 'video']);
export type AttachmentMediaKind = z.infer<typeof attachmentMediaKind>;

/**
 * One inbound attachment a participant sent, projected onto a transcript record's
 * `inbound_attachments`. Applied PER ITEM by the renderer (the record's array is a
 * loose `z.array(z.unknown())`, `safeParse`d per member) so one malformed/hostile
 * item is a loud per-item notice, never a whole-record parse failure that would
 * vanish the transcript.
 *
 * `url` is the served-media reference the renderer resolves to the API origin (the
 * same served-url discipline the ask-media renderer uses); the image src scheme gate
 * and the per-item load-failure notice are enforced there. `caption` and `filename`
 * are `.nullish()` (absent OR explicit `null` both parse to absent): the projection
 * may omit the key OR emit `null`, so `.optional()` alone would false-fail an explicit
 * `null`. `filename` is meaningful only for a `document`; the renderer shows it as the
 * download label.
 */
export const attachmentMediaItem = z.object({
  kind: attachmentMediaKind,
  url: z.string(),
  caption: z.string().nullish(),
  filename: z.string().nullish(),
});
export type AttachmentMediaItem = z.infer<typeof attachmentMediaItem>;

/**
 * One per-send choice for a `form` property whose schema is a string (or array of
 * strings). `value` is what the answer carries; `label` (absent OR null both parse
 * to no label) is the human text shown in its place; `description` (absent OR null
 * both parse to none) is the option's second line of supporting text. A send may
 * replace a property's `enum` this way for one ask without republishing the form.
 * Applied per property by the form preview (safeParsed), so a malformed entry is a
 * loud notice, never silent.
 */
export const formOption = z.object({
  value: z.string(),
  label: z.string().nullish(),
  description: z.string().nullish(),
});
export type FormOption = z.infer<typeof formOption>;

/**
 * Per-send `form` data: `values` prefills top-level properties (keyed by property
 * name), `options` supplies per-send choice lists (keyed by property name). Both
 * default to empty. The form preview safeParses this off `format_payload.data`, so a
 * malformed block is a loud notice rather than a whole-frame parse failure.
 */
export const formData = z.object({
  values: z.record(z.string(), z.unknown()).default({}),
  options: z.record(z.string(), z.array(formOption)).default({}),
});
export type FormData = z.infer<typeof formData>;

/** The kind of an ordered display block a page may carry alongside its input fields. */
export const displayBlockKind = z.enum(['heading', 'body', 'image']);
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
export const displayBlock = z.object({
  kind: displayBlockKind,
  text: z.string().nullish(),
  src: z.string().nullish(),
  alt: z.string().nullish(),
  slot: z.string().nullish(),
});
export type DisplayBlock = z.infer<typeof displayBlock>;

/** A page's role: an ordinary `input` page (default) or a terminal `review` summary. */
export const formPageKind = z.enum(['input', 'review']);
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
export const formPage = z.object({
  title: z.string(),
  fields: z.array(z.string()),
  display: z.array(displayBlock).default([]),
  kind: formPageKind.default('input'),
});
export type FormPage = z.infer<typeof formPage>;

/** The `form` pages list (`format_payload.pages`), safeParsed as a whole by the preview. */
export const formPages = z.array(formPage);
export type FormPages = z.infer<typeof formPages>;

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
 * The form update a reaction door returns (`POST /api/interactions/{id}/react`): the
 * same kind of data a form is sent with, applied to the open form. `values` sets field
 * values; `options` replaces the per-send choice list of option-bearing fields; `errors`
 * shows per-field messages (keyed by field name); `display` fills display slots (keyed by
 * slot name) — a computed total among them. Every member defaults to empty, so a reaction
 * that touches only one of them returns only that one. The door response is safeParsed, so
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
 * The event a reaction round-trip reports to the door: `kind` is which of the three
 * declared events fired, `field` names the changed field for a `field_changed` event, and
 * `page` names the advanced-from page (by title) for a `page_advanced` event. A
 * `submitted` event carries neither. The body also carries the partial `values` filled so
 * far (see {@link interactionsClient}'s `reactInteraction`).
 */
export const reactionEventKind = z.enum(['field_changed', 'page_advanced', 'submitted']);
export type ReactionEventKind = z.infer<typeof reactionEventKind>;

export const reactionEvent = z.object({
  kind: reactionEventKind,
  field: z.string().optional(),
  page: z.string().optional(),
});
export type ReactionEvent = z.infer<typeof reactionEvent>;

export const interaction = z.object({
  interaction_id: z.string(),
  group_id: z.string(),
  question: z.string().default(''),
  answer_format: answerFormat,
  // Format-specific payload: select options, form JSON schema (with optional per-send
  // `data` and `pages`), external url. The wire sends `null` for formats that carry
  // none (text/confirm); it is normalized to `{}` so consumers always see an object.
  format_payload: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((value) => value ?? {}),
  created_at: z.string(),
  timeout_at: z.string(),
  // Whether the answer body is sensitive and never persisted server-side. Rides
  // every add frame; an absent value (older frame) normalizes to false.
  sensitive: z.boolean().default(false),
  // True only for an external question answered by a signed server-to-server
  // callback (never by a human); the frame never carries the verifier object.
  // Absent/undefined for every other question.
  server_verified: z.boolean().optional(),
  // Name of the channel plugin the question was also delivered through (e.g.
  // "telegram"); absent when the question lives only in this inbox.
  channel: z.string().optional(),
  // Interaction attribution, each additive and absent when unset. `recipient` is
  // the channel delivery address the question went to; `origin` is the run id of
  // the background tool run that asked; `audience` is the user_id the question is
  // addressed to. Display/binding data only, never an authorization axis; a
  // present non-string is malformed.
  recipient: z.string().optional(),
  origin: z.string().optional(),
  audience: z.string().optional(),
  // Display-only media shown WITH the question (images and/or links). Absent when
  // the question carries none. Deliberately LOOSE (`z.array(z.unknown())`): each
  // item is `safeParse`d per item by the renderer against `interactionMediaItem`,
  // so one malformed/hostile item can never fail the whole frame parse and hide an
  // answerable question. A present non-array value is still malformed.
  media: z.array(z.unknown()).optional(),
});
export type Interaction = z.infer<typeof interaction>;

/** The answer door's response — the blocked caller was woken. */
export const interactionAnswered = z.object({
  interaction_id: z.string(),
  status: z.string(),
});
export type InteractionAnswered = z.infer<typeof interactionAnswered>;

/**
 * The cancel door's response — a pending ask was WITHDRAWN without an answer (the
 * asking flow does not resume). `status` is `"cancelled"`; the shape mirrors the
 * answer door's terminal reply, but the door is distinct so it carries its own
 * schema.
 */
export const interactionCancelled = z.object({
  interaction_id: z.string(),
  status: z.string(),
});
export type InteractionCancelled = z.infer<typeof interactionCancelled>;

/**
 * A page of pending interactions from `GET /api/interactions?page=&pageSize=`. Each
 * item is the same record the stream's `interaction.add` frame carries. The pending
 * set is the paged base the tail-only stream applies live deltas over.
 */
export const interactionsPage = z.object({
  items: z.array(interaction),
  ...pageWindow,
});
export type InteractionsPage = z.infer<typeof interactionsPage>;
