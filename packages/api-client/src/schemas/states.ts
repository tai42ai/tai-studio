/** State declaration, record, template and consumer response schemas. */
import { z } from 'zod';

import { conversationTargetKind } from './conversations';
import { stateDeclaration, stateTemplateDocument } from './served';

// The hand-written state response DTOs — list rows and detail (built on the generated
// `stateDeclaration`), attachments, per-subject records and subjects, stats and consumers.
// The served DOCUMENT schemas (`stateDeclaration`/`stateTemplateDocument` and the template
// sub-shapes) are generated from the contract bundle and re-exported at the top of this
// file. The composed `effective_schema` and write `regimes` stay permissive JSON records
// (the auto-form and JsonTree interpret them at runtime) and are server-computed, so they
// are modelled optional and a response that omits them still parses.

/** One addressed subject: the conversation-target scope plus the (kind, key) within it. */
export const stateSubject = z.object({
  target_kind: conversationTargetKind,
  target_name: z.string(),
  kind: z.string(),
  key: z.string(),
});
export type StateSubject = z.infer<typeof stateSubject>;

/** One absolute write-regime rule composed over the attachments: `{path, regime}`, permissive. */
export const stateRegime = z.record(z.string(), z.unknown());

/**
 * One row of `GET /api/states` — a served declaration (`list_states` dumps every
 * `StateDeclaration`) plus `updated_at` (the row's last-write timestamp, ISO or
 * `null`). The list carries no record count; the `Records` column reads
 * `getStateStats` lazily per row.
 */
export const stateListItem = stateDeclaration.extend({
  updated_at: z.string().nullable().default(null),
});
export type StateListItem = z.infer<typeof stateListItem>;
export const stateList = z.array(stateListItem);

/** One template attachment on a state: where the fragment lands + its param/declaration values. */
export const stateAttachment = z.object({
  template: z.string(),
  path: z.array(z.string()),
  parameters: z.record(z.string(), z.unknown()).default({}),
  declarations: z.record(z.string(), z.unknown()).default({}),
});
export type StateAttachment = z.infer<typeof stateAttachment>;
export const stateAttachmentList = z.array(stateAttachment);

/** `GET /api/states/{name}` — the declaration (with effective schema + regimes) plus attachments. */
export const stateDetail = stateDeclaration.extend({
  attachments: z.array(stateAttachment).default([]),
});
export type StateDetail = z.infer<typeof stateDetail>;

/**
 * `GET /api/states/{name}/stats` — `records` (total documents), `per_field` (the count
 * of records carrying each base-schema property), `per_kind` (records per subject kind)
 * and `consumers` (the count of listable consumers). The Records tab shows `records`;
 * the states list reads it lazily for its Records column.
 */
export const stateStats = z.object({
  records: z.number(),
  per_field: z.record(z.string(), z.number()).default({}),
  per_kind: z.record(z.string(), z.number()).default({}),
  consumers: z.number().default(0),
});
export type StateStats = z.infer<typeof stateStats>;

/**
 * One row of `GET /api/state-templates`. The template document plus the two derived columns
 * the Templates tab shows: `attached_to` (how many states attach it — a delete is refused
 * while > 0) and `shipped_default` (a platform-shipped template). Both are server-derived
 * columns; the document fields are verbatim.
 */
export const stateTemplateListItem = stateTemplateDocument.extend({
  attached_to: z.number().default(0),
  shipped_default: z.boolean().default(false),
});
export type StateTemplateListItem = z.infer<typeof stateTemplateListItem>;
export const stateTemplateList = z.array(stateTemplateListItem);

/** A read record: the state, its subject, the document + monotonic seq, and any fold. */
export const stateRecord = z.object({
  state: z.string(),
  subject: stateSubject,
  data: z.record(z.string(), z.unknown()).default({}),
  seq: z.number(),
  canonical_subject: stateSubject,
  folded_from: z.array(stateSubject).default([]),
});
export type StateRecord = z.infer<typeof stateRecord>;

/** The outcome of an `apply` (a delta batch): whether it applied + the resulting doc. */
export const applyResult = z.object({
  applied: z.boolean(),
  data: z.record(z.string(), z.unknown()).nullable().default(null),
  seq: z.number().nullable().default(null),
  skipped: z.array(z.record(z.string(), z.unknown())).default([]),
});
export type ApplyResult = z.infer<typeof applyResult>;

/**
 * `GET …/template-jq/{name}` — the evaluated template jq's `name`, its `purpose`, and
 * its `value` (the `input` jq's read). GET evaluates ONLY an `input`-purpose jq; a GET
 * on an `update`-purpose name is refused with 422, so the result's purpose is always
 * `input`.
 */
export const templateJqResult = z.object({
  name: z.string(),
  purpose: z.literal('input'),
  value: z.unknown(),
});
export type TemplateJqResult = z.infer<typeof templateJqResult>;

/**
 * `POST …/template-jq/{name}` — the applied template jq's outcome. The jq lands an op
 * batch through the same `apply` chokepoint as a delta, so `applied`/`data`/`seq`/`skipped`
 * carry that outcome.
 */
export const templateJqApplyResult = z.object({
  name: z.string(),
  applied: z.boolean(),
  data: z.record(z.string(), z.unknown()).nullable().default(null),
  seq: z.number().nullable().default(null),
  skipped: z.array(z.record(z.string(), z.unknown())).default([]),
});
export type TemplateJqApplyResult = z.infer<typeof templateJqApplyResult>;

/**
 * One paged subject row: the addressed `subject` plus its record's last-write
 * `updated_at` — epoch seconds (the store's `extract(epoch FROM updated_at)`), served
 * raw (no `mode="json"` dump), and `NOT NULL` on every record, so a plain number.
 */
export const subjectRow = z.object({
  subject: stateSubject,
  updated_at: z.number(),
});
export type SubjectRow = z.infer<typeof subjectRow>;

/**
 * `GET /api/states/{name}/subjects` — a keyset page of subject rows (optionally of one
 * `kind`): the matched `subjects` plus the `next_cursor` a "Load more" carries back
 * (`null` at the end).
 */
export const subjectPage = z.object({
  subjects: z.array(subjectRow),
  next_cursor: z.string().nullable().default(null),
});
export type SubjectPage = z.infer<typeof subjectPage>;

/**
 * `POST /api/states/{name}/records/search` — a keyset page of the subject rows whose
 * document contains the filters (a JSONB containment match). Each hit's `subject` opens
 * the record page; `next_cursor` pages the rest.
 */
export const recordSearchPage = z.object({
  matches: z.array(subjectRow),
  next_cursor: z.string().nullable().default(null),
});
export type RecordSearchPage = z.infer<typeof recordSearchPage>;

/** A WriteEntry's origin completed by the platform chokepoint (mirrors CompletedOrigin). */
export const completedOrigin = z.object({
  consumer: z.string().nullable().default(null),
  // Opaque consumer-supplied provenance JSON the platform stores as is.
  meta: z.record(z.string(), z.unknown()).nullable().default(null),
  run_id: z.string().nullable().default(null),
  op_id: z.string().nullable().default(null),
  door: z.string(),
  actor: z.string().nullable().default(null),
  turn_id: z.string().nullable().default(null),
  inbound_id: z.string().nullable().default(null),
});
export type CompletedOrigin = z.infer<typeof completedOrigin>;

/** One row of a subject's audit trail (mirrors WriteEntry). `paths` are absolute. */
export const writeEntry = z.object({
  seq: z.number(),
  at: z.string(),
  origin: completedOrigin,
  paths: z.array(z.array(z.union([z.string(), z.number()]))).default([]),
});
export type WriteEntry = z.infer<typeof writeEntry>;

/** `GET /api/states/{name}/records/.../writes` — a keyset page of the audit trail. */
export const writesPage = z.object({
  items: z.array(writeEntry),
  next_cursor: z.string().nullable().default(null),
});
export type WritesPage = z.infer<typeof writesPage>;

/** Where the Studio opens a consumer (mirrors ConsumerLink): a token+search OR plugin path. */
export const consumerLink = z.object({
  token: z.string().nullable().default(null),
  plugin_path: z.string().nullable().default(null),
  search: z.record(z.string(), z.unknown()).nullable().default(null),
});
export type ConsumerLink = z.infer<typeof consumerLink>;

/**
 * One thing that binds a state (mirrors ConsumerRow): its `kind` (flow / hook / schedule
 * / agent), `name`, human `detail` and optional `link`. `unavailable` marks a consumer
 * family that cannot be listed on this deployment (e.g. no scheduling backend), surfaced
 * as a muted line — never swallowed.
 */
export const consumerRow = z.object({
  kind: z.string(),
  name: z.string().nullable().default(null),
  detail: z.string().nullable().default(null),
  link: consumerLink.nullable().default(null),
  unavailable: z.string().nullable().default(null),
});
export type ConsumerRow = z.infer<typeof consumerRow>;

/** `GET /api/states/{name}/consumers` — the union of every registered lister's rows. */
export const stateConsumers = z.array(consumerRow);
export type StateConsumers = z.infer<typeof stateConsumers>;

/** `DELETE /api/states/{name}` — the removed state. */
export const stateDeleted = z.object({ name: z.string(), deleted: z.literal(true) });

/** `PUT /api/states/{name}/attachments/{template}` — the template now attached to the state. */
export const stateAttached = z.object({
  attached: z.literal(true),
  state: z.string(),
  template: z.string(),
});
export type StateAttached = z.infer<typeof stateAttached>;

/** `PATCH /api/states/{name}/attachments/{template}` — the attachment whose declarations were rewritten. */
export const stateAttachmentUpdated = z.object({
  updated: z.literal(true),
  state: z.string(),
  template: z.string(),
});
export type StateAttachmentUpdated = z.infer<typeof stateAttachmentUpdated>;

/** `DELETE /api/states/{name}/attachments/{template}` — the template detached from the state. */
export const stateDetached = z.object({
  detached: z.literal(true),
  state: z.string(),
  template: z.string(),
});
export type StateDetached = z.infer<typeof stateDetached>;

/**
 * `POST /api/states/{name}/records/.../fold` — the fold report: the `mode`, the
 * `{kind, key}` of the folded `from` and surviving `into` subjects, whether the fold
 * was `already` in place, and how many records were `flattened` into the survivor.
 */
export const stateFoldReport = z.object({
  mode: z.enum(['switch', 'merge']),
  from: z.object({ kind: z.string(), key: z.string() }),
  into: z.object({ kind: z.string(), key: z.string() }),
  already: z.boolean(),
  flattened: z.number().default(0),
});
export type StateFoldReport = z.infer<typeof stateFoldReport>;

/** `DELETE /api/state-templates/{name}` — the removed template document. */
export const stateTemplateDeleted = z.object({ name: z.string(), deleted: z.literal(true) });

/** `DELETE /api/states/{name}/records/...` — the erased record marker. */
export const recordErased = z.object({ erased: z.literal(true) });

/**
 * `POST /api/state-retention/prune` — the retention sweep's per-state deleted counts
 * (`{}` when nothing expired); the UI sums the values for its total.
 */
export const stateRetentionPruned = z.object({
  pruned: z.record(z.string(), z.number()).default({}),
});
export type StateRetentionPruned = z.infer<typeof stateRetentionPruned>;
