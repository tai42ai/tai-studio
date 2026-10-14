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
 * and carries no new input fields; it defaults to `input`. `button_label` is the text of
 * the page's primary button — the one that advances from an input page, or submits from
 * the last — in the sender's words and the end-user's language; absent (`null`), the
 * surface shows its own generic word ("Next"/"Submit"/"Confirm"). All additive: an older
 * payload ({title, fields}) parses unchanged.
 */
export const formPage = openapi.formPage.extend({
  button_label: z.string().nullable().default(null),
});
export type FormPage = z.infer<typeof formPage>;

/** The `form` pages list (`format_payload.pages`), safeParsed as a whole by the preview. */
export const formPages = z.array(formPage);
export type FormPages = z.infer<typeof formPages>;

// The one catalogue of a send's platform-drawn texts (`format_payload.wording`): a
// question's or a notification's buttons, headings, input hints, message lines,
// answer-page sentences, refusal sentences, settled-card badges and screen-reader labels,
// grouped into six chapters. Every leaf is the sender's own words in the end-user's
// language; absent (or `null`), the surface shows its own generic word. Mirrors the
// skeleton's `Wording` model member-for-member. A renderer safeParses this off the loose
// `format_payload`, so a malformed shape falls back to the default words rather than
// crashing the card (the labels are chrome, never an answer). The Studio inbox draws only
// the subset of members it has a control for; the rest parse and are ignored.

/**
 * One form field's platform-drawn words (`wording.form.fields[name]`): `choice_label` is
 * the placeholder of the field's picker (its empty-state prompt).
 */
export const fieldWording = z.object({
  choice_label: z.string().nullish(),
});
export type FieldWording = z.infer<typeof fieldWording>;

/**
 * A form's platform-drawn chrome (`wording.form`): `title` heads the form surface;
 * `open`/`cancel` label the buttons that open and close it; `back` the button that returns
 * to the previous step; `submit` the terminal button of a form with no pages;
 * `review_empty` the review step's line before anything is filled; `fields` carries
 * per-field words keyed by property name. The inbox draws the form inline, so it reads
 * `back`, `submit` and `fields`; `title`/`open`/`cancel`/`review_empty` parse unused.
 */
export const formWording = z.object({
  title: z.string().nullish(),
  open: z.string().nullish(),
  cancel: z.string().nullish(),
  back: z.string().nullish(),
  submit: z.string().nullish(),
  review_empty: z.string().nullish(),
  fields: z.record(z.string(), fieldWording).nullish(),
});
export type FormWording = z.infer<typeof formWording>;

/**
 * A choice list's platform-drawn words (`wording.choice`): `label` is the word on the
 * control that presents the list, `reply_hint` the line under a numbered-text list, and
 * `group_label` the accessible name of a flat group of option buttons. The inbox reads
 * `label` (the select field's label and picker placeholder); the rest parse unused.
 */
export const choiceWording = z.object({
  label: z.string().nullish(),
  reply_hint: z.string().nullish(),
  group_label: z.string().nullish(),
});
export type ChoiceWording = z.infer<typeof choiceWording>;

/**
 * A non-form question's answer controls and refusal sentences (`wording.answer`): `open`
 * labels the control that opens a `confirm`/`external` question's answer page, `confirm`
 * its affirmative control, `decline` its negative control, `submit` the button that sends a
 * typed or picked answer, `reply_hint` the hint in an empty reply input. `rejected` /
 * `rejected_final` are the sentences the end user reads when an answer is refused; the
 * inbox draws neither (web-only). The inbox reads `open`, `confirm`, `decline`, `submit`
 * and `reply_hint` where it draws the matching control.
 */
export const answerWording = z.object({
  open: z.string().nullish(),
  confirm: z.string().nullish(),
  decline: z.string().nullish(),
  submit: z.string().nullish(),
  reply_hint: z.string().nullish(),
  rejected: z.string().nullish(),
  rejected_final: z.string().nullish(),
});
export type AnswerWording = z.infer<typeof answerWording>;

/**
 * The lines of a delivery message (`wording.lines`): `answer_link` carries the tappable
 * answer link, `deadline` names the deadline, `reply` tells the end user how to reply, and
 * `options` lists the choices. Drawn by the chat channels; the inbox draws none of them.
 */
export const lineWording = z.object({
  answer_link: z.string().nullish(),
  deadline: z.string().nullish(),
  reply: z.string().nullish(),
  options: z.string().nullish(),
});
export type LineWording = z.infer<typeof lineWording>;

/** The heading and sentence of one platform-drawn answer page (`wording.answer_page.*`). */
export const pageCopy = z.object({
  heading: z.string().nullish(),
  text: z.string().nullish(),
});
export type PageCopy = z.infer<typeof pageCopy>;

/**
 * The form page's own sentences (`wording.answer_page.form`): `failed` when a send did not
 * land, `network_error` when the browser could not reach the server, `update_failed` when a
 * reacting form could not refresh, `choose_one` for an empty required multi-choice, and
 * `date_unavailable` for a blocked date. Drawn by the callback form page; the inbox draws
 * none of them.
 */
export const formPageWording = z.object({
  failed: z.string().nullish(),
  network_error: z.string().nullish(),
  update_failed: z.string().nullish(),
  choose_one: z.string().nullish(),
  date_unavailable: z.string().nullish(),
});
export type FormPageWording = z.infer<typeof formPageWording>;

/**
 * The pages a question's link opens (`wording.answer_page`): `confirm` the confirm page's
 * copy, `done` the already-answered page's, `awaiting` the reply-on-the-channel page's,
 * `submitted` the form page's post-submit copy, and `form` the form page's own
 * validation/error sentences. Drawn by the callback pages; the inbox draws none of them.
 */
export const answerPageWording = z.object({
  confirm: pageCopy.nullish(),
  done: pageCopy.nullish(),
  awaiting: pageCopy.nullish(),
  submitted: pageCopy.nullish(),
  form: formPageWording.nullish(),
});
export type AnswerPageWording = z.infer<typeof answerPageWording>;

/**
 * A live question card's countdown words (`wording.status.countdown`): `seconds_left` the
 * visible plural line, `one_second_left` the visible singular, and `under_minute` /
 * `under_half_minute` / `under_ten_seconds` the spoken lines at the three thresholds. Drawn
 * by the web widget; the inbox draws no countdown.
 */
export const countdownWording = z.object({
  seconds_left: z.string().nullish(),
  one_second_left: z.string().nullish(),
  under_minute: z.string().nullish(),
  under_half_minute: z.string().nullish(),
  under_ten_seconds: z.string().nullish(),
});
export type CountdownWording = z.infer<typeof countdownWording>;

/**
 * In-flight and settled status copy (`wording.status`): `sending` the screen-reader label
 * while a send is in flight, `answered` / `expired` / `closed` the badges once a question
 * settles, `sent` the badge after an ask-less form is submitted, `unavailable` the line
 * when a form's door no longer resolves, and `countdown` the live-countdown words. Drawn by
 * the web widget; the inbox draws none of them.
 */
export const statusWording = z.object({
  sending: z.string().nullish(),
  answered: z.string().nullish(),
  expired: z.string().nullish(),
  closed: z.string().nullish(),
  sent: z.string().nullish(),
  unavailable: z.string().nullish(),
  countdown: countdownWording.nullish(),
});
export type StatusWording = z.infer<typeof statusWording>;

/**
 * The one catalogue of a send's platform-drawn texts (`format_payload.wording`), grouped
 * by what each word decorates: the form (`form`), the choice list (`choice`), a question's
 * answer controls and refusal sentences (`answer`), the lines of the delivery message
 * (`lines`), the pages a question's link opens (`answer_page`), and in-flight and settled
 * status (`status`). A page's primary button is the one text not here — it is on the page
 * (`pages[].button_label`). Every leaf is the sender's own words in the end-user's
 * language; absent (or `null`), the surface shows its own word.
 */
export const wording = z.object({
  form: formWording.nullish(),
  choice: choiceWording.nullish(),
  answer: answerWording.nullish(),
  lines: lineWording.nullish(),
  answer_page: answerPageWording.nullish(),
  status: statusWording.nullish(),
});
export type Wording = z.infer<typeof wording>;

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
