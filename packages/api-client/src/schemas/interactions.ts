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
 * One per-send choice for a `form` property whose schema is a string (or array of
 * strings). `value` is what the answer carries; `label` (absent OR null both parse
 * to no label) is the human text shown in its place. A send may replace a property's
 * `enum` this way for one ask without republishing the form. Applied per property by
 * the form preview (safeParsed), so a malformed entry is a loud notice, never silent.
 */
export const formOption = z.object({
  value: z.string(),
  label: z.string().nullish(),
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

/**
 * One page of a stepped `form`: a `title` and the ordered top-level property names it
 * groups. `format_payload.pages` is the ordered list of these; absent = one page. The
 * form preview safeParses the list, so a malformed page is a loud notice, never silent.
 */
export const formPage = z.object({
  title: z.string(),
  fields: z.array(z.string()),
});
export type FormPage = z.infer<typeof formPage>;

/** The `form` pages list (`format_payload.pages`), safeParsed as a whole by the preview. */
export const formPages = z.array(formPage);
export type FormPages = z.infer<typeof formPages>;

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
