/** State declaration, record, template and consumer response schemas. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';
import * as served from '../generated/served-schemas';
import { stateDeclaration, stateTemplateDocument } from './served';

// The state response schemas — list rows and detail, attachments, per-subject records and
// subjects, stats and consumers. The served DOCUMENT schemas (`stateDeclaration`/
// `stateTemplateDocument` and the template sub-shapes) are re-exported from `./served`.

/** One addressed subject: the conversation-target scope plus the (kind, key) within it. */
export const stateSubject = openapi.stateSubject;
export type StateSubject = z.infer<typeof stateSubject>;

/** One absolute write-regime rule composed over the attachments: `{path, regime}`. */
export const stateRegime = served.stateRegimeRule;

/**
 * One row of `GET /api/states` — a served declaration (`list_states` dumps every
 * `StateDeclaration`) plus `updated_at` (the row's last-write timestamp, ISO or
 * `null`). The list carries no record count; the `Records` column reads
 * `getStateStats` lazily per row.
 */
export const stateListItem = stateDeclaration;
export type StateListItem = z.infer<typeof stateListItem>;
export const stateList = openapi.stateDeclarationList;

/**
 * One save held by a failed pending save: `save_id` names it, `held_by` the failed save holding it
 * (equal to `save_id` for the failed save itself), `subjects` the subjects it writes. A scan or
 * a re-declare that read past it names it in its `held` list.
 */
export const heldPendingSave = openapi.heldPendingSave;
export type HeldPendingSave = z.infer<typeof heldPendingSave>;

/** One template attachment on a state: where the fragment lands + its param/declaration values. */
export const stateAttachment = openapi.stateAttachmentView;
export type StateAttachment = z.infer<typeof stateAttachment>;
export const stateAttachmentList = openapi.stateAttachmentList;

/** `GET /api/states/{name}` — the declaration (with effective schema + regimes) plus attachments. */
// Built on the declaration document: the spec publishes the served view's `schema` and
// `regimes` as open objects, the document types them.
export const stateDetail = stateDeclaration.extend({ attachments: z.array(stateAttachment) });
export type StateDetail = z.infer<typeof stateDetail>;

/**
 * `PUT /api/states/{name}` — a create or re-declare's answer: the stored declaration's fields
 * plus `held`, the held pending saves an accepted re-declare names (absent when none). The
 * answer carries no attachments; a caller that needs them reads `getState`.
 */
export const stateDeclarationSaved = openapi.stateDeclarationPutResponse;
export type StateDeclarationSaved = z.infer<typeof stateDeclarationSaved>;

/**
 * `GET /api/states/{name}/stats` — `records` (total documents), `per_field` (the count
 * of records carrying each base-schema property), `per_kind` (records per subject kind)
 * and `consumers` (the count of listable consumers). The Records tab shows `records`;
 * the states list reads it lazily for its Records column.
 */
export const stateStats = openapi.stateStats;
export type StateStats = z.infer<typeof stateStats>;

/**
 * One row of `GET /api/state-templates`. The template document plus the two derived columns
 * the Templates tab shows: `attached_to` (how many states attach it — a delete is refused
 * while > 0) and `shipped_default` (a platform-shipped template). Both are server-derived
 * columns; the document fields are verbatim.
 */
// Built on the template document: the spec publishes a served template's jq programs as open
// objects, the document types them.
export const stateTemplateListItem = stateTemplateDocument.extend({
  attached_to: openapi.stateTemplateCatalogEntry.shape.attached_to,
  shipped_default: openapi.stateTemplateCatalogEntry.shape.shipped_default,
});
export type StateTemplateListItem = z.infer<typeof stateTemplateListItem>;
export const stateTemplateList = z.array(stateTemplateListItem);

/** A read record: the state, its subject, the document + monotonic seq, and any fold. */
export const stateRecord = openapi.stateRecord;
export type StateRecord = z.infer<typeof stateRecord>;

/** The outcome of an `apply` (a delta batch): whether it applied + the resulting doc. */
export const applyResult = openapi.applyResult;
export type ApplyResult = z.infer<typeof applyResult>;

/**
 * `GET …/template-jq/{name}` — the evaluated template jq's `name`, its `purpose`, and
 * its `value` (the `input` jq's read). GET evaluates ONLY an `input`-purpose jq; a GET
 * on an `update`-purpose name is refused with 422, so the result's purpose is always
 * `input`.
 */
export const templateJqResult = openapi.templateJqResult;
export type TemplateJqResult = z.infer<typeof templateJqResult>;

/**
 * `POST …/template-jq/{name}` — the applied template jq's outcome. The jq lands an op
 * batch through the same `apply` chokepoint as a delta, so `applied`/`data`/`seq`/`skipped`
 * carry that outcome.
 */
export const templateJqApplyResult = openapi.templateJqApplyResult;
export type TemplateJqApplyResult = z.infer<typeof templateJqApplyResult>;

/**
 * One paged subject row: the addressed `subject` plus its record's last-write
 * `updated_at` — epoch seconds (the store's `extract(epoch FROM updated_at)`), served
 * raw (no `mode="json"` dump), and `NOT NULL` on every record, so a plain number.
 */
export const subjectRow = openapi.stateSubjectEntry;
export type SubjectRow = z.infer<typeof subjectRow>;

/**
 * `GET /api/states/{name}/subjects` — a keyset page of subject rows (optionally of one
 * `kind`): the matched `subjects` plus the `next_cursor` a "Load more" carries back
 * (`null` at the end).
 */
export const subjectPage = openapi.stateSubjectsPage;
export type SubjectPage = z.infer<typeof subjectPage>;

/**
 * `POST /api/states/{name}/records/search` — a keyset page of the subject rows whose
 * document contains the filters (a JSONB containment match). Each hit's `subject` opens
 * the record page; `next_cursor` pages the rest.
 */
export const recordSearchPage = openapi.stateSearchPage;
export type RecordSearchPage = z.infer<typeof recordSearchPage>;

/**
 * One way a candidate document does not fit a state's effective schema (mirrors
 * ValidationReason): the JSON `path` of the offending node (`$` for the document root)
 * and the validator's `message`. A document that fits has none.
 */
export const validationReason = openapi.validationReason;
export type ValidationReason = z.infer<typeof validationReason>;

/**
 * `POST /api/states/{name}/records/validate` — whether a candidate document `fits` the
 * state's effective schema, with every `reasons` entry it fails on (ordered by JSON
 * path). A misfit is a 200 whose body says `fits:false`; a non-object body or a broken
 * `$ref` is the route's 422.
 */
export const recordValidation = openapi.recordValidation;
export type RecordValidation = z.infer<typeof recordValidation>;

/**
 * One stored record that does not fit its state's current effective schema (mirrors
 * RecordCheckItem): the `subject` it belongs to, its last-write `updated_at` (epoch
 * seconds) and every `reasons` entry it fails on.
 */
export const recordCheckItem = openapi.recordCheckItem;
export type RecordCheckItem = z.infer<typeof recordCheckItem>;

/**
 * `GET /api/states/{name}/records/check` — one keyset page of the state's records checked
 * against its effective schema: `checked` (records read this page), `items` (the MISFITS
 * ONLY), `next_cursor` (the cursor the next page reads from, `null` at the end) and `held`
 * (the saves held by a failed pending save whose subjects the page skipped).
 */
export const recordCheckPage = openapi.recordCheckPage;
export type RecordCheckPage = z.infer<typeof recordCheckPage>;

/** A WriteEntry's origin completed by the platform chokepoint (mirrors CompletedOrigin). */
export const completedOrigin = openapi.completedOrigin;
export type CompletedOrigin = z.infer<typeof completedOrigin>;

/** One row of a subject's audit trail (mirrors WriteEntry). `paths` are absolute. */
export const writeEntry = openapi.writeEntry;
export type WriteEntry = z.infer<typeof writeEntry>;

/** `GET /api/states/{name}/records/.../writes` — a keyset page of the audit trail. */
export const writesPage = openapi.writesPage;
export type WritesPage = z.infer<typeof writesPage>;

/** Where the Studio opens a consumer (mirrors ConsumerLink): a token+search OR plugin path. */
export const consumerLink = openapi.consumerLink;
export type ConsumerLink = z.infer<typeof consumerLink>;

/**
 * One thing that binds a state (mirrors ConsumerRow): its `kind` (hook / schedule / agent
 * / preset / a consumer plugin's own kind), `name`, human `detail` and optional `link`.
 * `unavailable` marks a consumer family that cannot be listed on this deployment (e.g.
 * no scheduling backend), surfaced as a muted line — never swallowed.
 */
export const consumerRow = openapi.consumerRow;
export type ConsumerRow = z.infer<typeof consumerRow>;

/** `GET /api/states/{name}/consumers` — the union of every registered lister's rows. */
export const stateConsumers = openapi.stateConsumerList;
export type StateConsumers = z.infer<typeof stateConsumers>;

/** `DELETE /api/states/{name}` — the removed state. */
export const stateDeleted = openapi.stateDeleteResult;

/** `PUT /api/states/{name}/attachments/{template}` — the template now attached to the state. */
export const stateAttached = openapi.attachAck;
export type StateAttached = z.infer<typeof stateAttached>;

/** `PATCH /api/states/{name}/attachments/{template}` — the attachment whose declarations were rewritten. */
export const stateAttachmentUpdated = openapi.attachUpdateAck;
export type StateAttachmentUpdated = z.infer<typeof stateAttachmentUpdated>;

/** `DELETE /api/states/{name}/attachments/{template}` — the template detached from the state. */
export const stateDetached = openapi.detachAck;
export type StateDetached = z.infer<typeof stateDetached>;

/**
 * `POST /api/states/{name}/records/.../fold` — the fold report: the `mode`, the
 * `{kind, key}` of the folded `from` and surviving `into` subjects, whether the fold
 * was `already` in place, how many records were `flattened` into the survivor, and
 * (a `merge` fold only) the survivor's newly-filled `merged_members`.
 */
export const stateFoldReport = openapi.foldReport;
export type StateFoldReport = z.infer<typeof stateFoldReport>;

/** `DELETE /api/state-templates/{name}` — the removed template document. */
export const stateTemplateDeleted = openapi.stateDeleteResult;

/** `DELETE /api/states/{name}/records/...` — the erased record marker. */
export const recordErased = openapi.eraseAck;

/**
 * `POST /api/state-retention/prune` — the retention sweep's per-state deleted counts
 * (`{}` when nothing expired); the UI sums the values for its total.
 */
export const stateRetentionPruned = openapi.pruneResult;
export type StateRetentionPruned = z.infer<typeof stateRetentionPruned>;

/** A pending save's lifecycle: records waiting, calls queued, a call running, or failed (held). */
export const pendingSaveStatus = openapi.statePendingSave.shape.status;
export type PendingSaveStatus = z.infer<typeof pendingSaveStatus>;

/**
 * One outstanding pending state save (`GET /api/state-pending-saves`): what it writes and calls,
 * never the record data or call arguments. `failed_phase` says which part failed.
 */
export const pendingSave = openapi.statePendingSave;
export type PendingSave = z.infer<typeof pendingSave>;

/**
 * A page of pending saves, newest first, with the totals of every `outstanding` and every
 * `failed` save; `next_cursor` continues the page (`null` at the end).
 */
export const pendingSavesPage = openapi.statePendingSavesPage;
export type PendingSavesPage = z.infer<typeof pendingSavesPage>;

/**
 * `POST /api/state-pending-saves/{id}/retry` — the save's status after its records phase:
 * `applied` (it landed whole), `pending`/`calls`/`running` (queued again), or `failed` again
 * with its `last_error`.
 */
export const pendingSaveRetried = openapi.statePendingSaveRetried;
export type PendingSaveRetried = z.infer<typeof pendingSaveRetried>;

/** `DELETE /api/state-pending-saves/{id}` — the discarded save's id. */
export const pendingSaveDiscarded = openapi.statePendingSaveDiscarded;
