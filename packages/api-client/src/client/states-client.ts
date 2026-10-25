/** State declaration, record, template and consumer sub-client. */
import { apiRoutes, buildPath } from '../generated/api-routes';
import * as s from '../schemas';
import type { Transport } from './transport';

/**
 * The client-facing write body for a state declaration (`PUT /api/states/{name}`), the
 * wire shape of `tai42_contract.states.StateDeclaration` minus the platform-computed
 * `effective_schema`/`regimes` (those are read-only, refused on a write). `schema` is the
 * `TemplatedText | dict` union: an inline JSON-schema object, or a stored template reference
 * (`id` + render `kwargs`) the platform renders to the schema. `retention_days` is `null` to
 * keep records forever.
 */
export interface StateDeclarationBody {
  readonly name: string;
  readonly description?: string;
  readonly schema: s.TemplatedText | Record<string, unknown>;
  readonly subject_kinds: readonly string[];
  readonly default_subject_kind: string;
  readonly retention_days?: number | null;
}

/**
 * A state-template document write body (`PUT /api/state-templates/{name}`, the platform half).
 * `schema` is the `TemplatedText | dict` union — an inline fragment schema, or a stored
 * template reference the platform renders to the fragment.
 */
export interface StateTemplateBody {
  readonly name: string;
  readonly description?: string;
  readonly parameters?: Record<string, unknown>;
  readonly schema: s.TemplatedText | Record<string, unknown>;
  readonly regimes?: Record<string, unknown>[];
  readonly declarations?: Record<string, unknown> | null;
  readonly trace?: Record<string, unknown>;
}

/** A template attach / re-attach body (`PUT|PATCH /api/states/{name}/attachments/{template}`). */
export interface StateAttachmentBody {
  readonly path?: string[];
  readonly parameters?: Record<string, unknown>;
  readonly declarations?: Record<string, unknown>;
  // Reconcile directive for a re-attach that would orphan open records: retry with
  // `{ orphans: "close", resolution: "<name>" }` to close them (the server refuses
  // without it). Omitted on a first attach.
  readonly options?: Record<string, unknown>;
}

/** The four-part subject a record route addresses in its path. */
export interface StateSubjectRef {
  readonly target_kind: string;
  readonly target_name: string;
  readonly kind: string;
  readonly key: string;
}

/** A keyset page request: an optional size and the opaque cursor a prior page returned. */
export interface StatePageQuery {
  readonly limit?: number;
  readonly cursor?: string;
}

/** The subject-addressed record routes, by what each does to the record. */
const RECORD_ROUTES = {
  read: apiRoutes.get_api_states_name_records_target_kind_target_name_kind_key.path,
  put: apiRoutes.put_api_states_name_records_target_kind_target_name_kind_key.path,
  patch: apiRoutes.patch_api_states_name_records_target_kind_target_name_kind_key.path,
  erase: apiRoutes.delete_api_states_name_records_target_kind_target_name_kind_key.path,
  deltas: apiRoutes.post_api_states_name_records_target_kind_target_name_kind_key_deltas.path,
  evalJq:
    apiRoutes.get_api_states_name_records_target_kind_target_name_kind_key_template_jq_program.path,
  applyJq:
    apiRoutes.post_api_states_name_records_target_kind_target_name_kind_key_template_jq_program
      .path,
  fold: apiRoutes.post_api_states_name_records_target_kind_target_name_kind_key_fold.path,
  writes: apiRoutes.get_api_states_name_records_target_kind_target_name_kind_key_writes.path,
} as const;

/**
 * The path parameters of a subject-addressed record route (`/api/states/{name}/records/
 * {target_kind}/{target_name}/{kind}/{key}`): four path segments, each percent-encoded by
 * `buildPath`, so a key carrying a slash or a colon never escapes its segment.
 */
function stateRecordParams(name: string, subject: StateSubjectRef) {
  return {
    name,
    target_kind: subject.target_kind,
    target_name: subject.target_name,
    kind: subject.kind,
    key: subject.key,
  };
}

/**
 * Encode a template jq's declared params as JSON query values: the record `template-jq`
 * route reads each `?<param>=<json>` as a JSON-decoded argument, so a string, number,
 * array or object round-trips faithfully. An `undefined` value is dropped (an
 * omitted optional param).
 */
function encodeJqParams(params?: Record<string, unknown>): Record<string, string> | undefined {
  if (params === undefined) return undefined;
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    query[key] = JSON.stringify(value);
  }
  return query;
}

/** State declaration CRUD: list, read, upsert, delete and stats of a state document. */
function stateDeclarationMethods(t: Transport) {
  const { req } = t;
  return {
    // A state is a declared JSON document, one per subject. The list is the
    // management population; a single state read composes the declaration with its
    // effective schema, regimes and attachments. Every record route addresses its subject
    // as four percent-encoded path segments (see `stateRecordPath`).
    listStates: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_states.path, s.stateList, { signal }),
    getState: (name: string, signal?: AbortSignal) =>
      req(buildPath(apiRoutes.get_api_states_name.path, { name }), s.stateDetail, { signal }),
    // A plain declaration upsert — no `replace` flag. With records present the server
    // accepts additive schema changes and refuses with a 409 any change that removes or
    // alters an existing field, or a subject-kind removal that would strand records. The
    // answer is the stored declaration plus the held pending saves it was accepted beside.
    putState: (name: string, body: StateDeclarationBody) =>
      req(buildPath(apiRoutes.put_api_states_name.path, { name }), s.stateDeclarationSaved, {
        method: 'PUT',
        body,
      }),
    deleteState: (name: string) =>
      req(buildPath(apiRoutes.delete_api_states_name.path, { name }), s.stateDeleted, {
        method: 'DELETE',
      }),
    getStateStats: (name: string, signal?: AbortSignal) =>
      req(buildPath(apiRoutes.get_api_states_name_stats.path, { name }), s.stateStats, { signal }),
  };
}

/** Template attachments on a state: list, read, attach, re-attach and detach. */
function stateAttachmentMethods(t: Transport) {
  const { req } = t;
  return {
    listStateAttachments: (name: string, signal?: AbortSignal) =>
      req(
        buildPath(apiRoutes.get_api_states_name_attachments.path, { name }),
        s.stateAttachmentList,
        { signal },
      ),
    getStateAttachment: (name: string, template: string, signal?: AbortSignal) =>
      req(
        buildPath(apiRoutes.get_api_states_name_attachments_template.path, { name, template }),
        s.stateAttachment,
        { signal },
      ),
    attachStateTemplate: (name: string, template: string, body: StateAttachmentBody) =>
      req(
        buildPath(apiRoutes.put_api_states_name_attachments_template.path, { name, template }),
        s.stateAttached,
        { method: 'PUT', body },
      ),
    patchStateAttachment: (name: string, template: string, body: StateAttachmentBody) =>
      req(
        buildPath(apiRoutes.patch_api_states_name_attachments_template.path, { name, template }),
        s.stateAttachmentUpdated,
        { method: 'PATCH', body },
      ),
    // Every holder that would refuse detaching `template` from the state.
    getStateTemplateReferees: (name: string, template: string, signal?: AbortSignal) =>
      req(
        buildPath(apiRoutes.get_api_states_name_attachments_template_referees.path, {
          name,
          template,
        }),
        s.holdersPreview,
        { signal },
      ),
    detachStateTemplate: (name: string, template: string) =>
      req(
        buildPath(apiRoutes.delete_api_states_name_attachments_template.path, { name, template }),
        s.stateDetached,
        { method: 'DELETE' },
      ),
  };
}

/** Record reads and writes: subject listing, content search, and per-subject CRUD. */
function stateRecordMethods(t: Transport) {
  const { req } = t;
  return {
    listStateSubjects: (
      name: string,
      params: { kind?: string } & StatePageQuery,
      signal?: AbortSignal,
    ) =>
      req(buildPath(apiRoutes.get_api_states_name_subjects.path, { name }), s.subjectPage, {
        signal,
        query: { kind: params.kind, limit: params.limit, cursor: params.cursor },
      }),
    // The content search body is a single JSONB containment document (`filters`); the
    // server refuses an empty one, so the UI validates a non-empty object first.
    searchStateRecords: (
      name: string,
      body: { filters: Record<string, unknown> } & StatePageQuery,
      signal?: AbortSignal,
    ) =>
      req(
        buildPath(apiRoutes.post_api_states_name_records_search.path, { name }),
        s.recordSearchPage,
        {
          method: 'POST',
          body,
          signal,
        },
      ),
    // Validate a candidate document against the state's effective schema. The request body
    // IS the candidate document (not an envelope); the answer says whether it `fits` and,
    // when it does not, every reason. A misfit is a 200 whose body says `fits:false`; only a
    // non-object body or a broken `$ref` is the route's 422.
    validateStateRecord: (name: string, doc: Record<string, unknown>, signal?: AbortSignal) =>
      req(
        buildPath(apiRoutes.post_api_states_name_records_validate.path, { name }),
        s.recordValidation,
        { method: 'POST', body: doc, signal },
      ),
    // One keyset page of the state's stored records checked against its effective schema.
    // `items` are the MISFITS ONLY; a caller walks `next_cursor` (null at the end) to cover
    // every record. Optionally scoped to one subject `kind`.
    checkStateRecords: (
      name: string,
      params: { kind?: string } & StatePageQuery,
      signal?: AbortSignal,
    ) =>
      req(
        buildPath(apiRoutes.get_api_states_name_records_check.path, { name }),
        s.recordCheckPage,
        {
          signal,
          query: { kind: params.kind, limit: params.limit, cursor: params.cursor },
        },
      ),
    // A subject with no document yet reads as `null` (a 200 `{data: null}`, the record
    // page's Create path) — never an error, so the schema is nullable.
    getStateRecord: (name: string, subject: StateSubjectRef, signal?: AbortSignal) =>
      req(
        buildPath(RECORD_ROUTES.read, stateRecordParams(name, subject)),
        s.stateRecord.nullable(),
        { signal },
      ),
    putStateRecord: (name: string, subject: StateSubjectRef, data: Record<string, unknown>) =>
      req(buildPath(RECORD_ROUTES.put, stateRecordParams(name, subject)), s.stateRecord, {
        method: 'PUT',
        body: data,
      }),
    patchStateRecord: (name: string, subject: StateSubjectRef, data: Record<string, unknown>) =>
      req(buildPath(RECORD_ROUTES.patch, stateRecordParams(name, subject)), s.stateRecord, {
        method: 'PATCH',
        body: data,
      }),
    applyStateRecord: (
      name: string,
      subject: StateSubjectRef,
      ops: readonly Record<string, unknown>[],
    ) =>
      req(buildPath(RECORD_ROUTES.deltas, stateRecordParams(name, subject)), s.applyResult, {
        method: 'POST',
        body: { ops },
      }),
  };
}

/** Record operations on a subject: template-jq eval/apply, delete, fold, write log, consumers. */
function stateRecordOpMethods(t: Transport) {
  const { req } = t;
  return {
    // Evaluate a template jq over the subject: each declared param is JSON-encoded into
    // the query string (`?<param>=<json>`); the response is `{name, purpose, value}`. An
    // `attachment.name` jq is percent-encoded as one path segment.
    evalTemplateJq: (
      name: string,
      subject: StateSubjectRef,
      jqName: string,
      params?: Record<string, unknown>,
      signal?: AbortSignal,
    ) =>
      req(
        buildPath(RECORD_ROUTES.evalJq, {
          ...stateRecordParams(name, subject),
          program: jqName,
        }),
        s.templateJqResult,
        { signal, query: encodeJqParams(params) },
      ),
    // Apply an `update`-purpose template jq to the subject: `input` is the jq's argument,
    // `op_id` its idempotency key (a replay is a no-op). The jq lands its op batch through
    // the apply chokepoint. An `attachment.name` jq is percent-encoded as one path segment.
    applyTemplateJq: (
      name: string,
      subject: StateSubjectRef,
      jqName: string,
      body?: { input?: unknown; op_id?: string },
    ) =>
      req(
        buildPath(RECORD_ROUTES.applyJq, {
          ...stateRecordParams(name, subject),
          program: jqName,
        }),
        s.templateJqApplyResult,
        { method: 'POST', body: body ?? {} },
      ),
    deleteStateRecord: (name: string, subject: StateSubjectRef) =>
      req(buildPath(RECORD_ROUTES.erase, stateRecordParams(name, subject)), s.recordErased, {
        method: 'DELETE',
      }),
    // `mode` is required server-side (`switch` drops, `merge` combines); the fold returns
    // a report, not the surviving record.
    foldStateRecord: (
      name: string,
      subject: StateSubjectRef,
      into: StateSubjectRef,
      mode: 'switch' | 'merge',
    ) =>
      req(buildPath(RECORD_ROUTES.fold, stateRecordParams(name, subject)), s.stateFoldReport, {
        method: 'POST',
        body: { into, mode },
      }),
    listStateWrites: (
      name: string,
      subject: StateSubjectRef,
      params?: StatePageQuery,
      signal?: AbortSignal,
    ) =>
      req(buildPath(RECORD_ROUTES.writes, stateRecordParams(name, subject)), s.writesPage, {
        signal,
        query: { limit: params?.limit, cursor: params?.cursor },
      }),
    stateConsumers: (name: string, signal?: AbortSignal) =>
      req(buildPath(apiRoutes.get_api_states_name_consumers.path, { name }), s.stateConsumers, {
        signal,
      }),
  };
}

/** State-template documents and retention: list, read, upsert, delete, prune. */
function stateTemplateMethods(t: Transport) {
  const { req } = t;
  return {
    listStateTemplates: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_state_templates.path, s.stateTemplateList, { signal }),
    getStateTemplate: (name: string, signal?: AbortSignal) =>
      req(
        buildPath(apiRoutes.get_api_state_templates_name.path, { name }),
        s.stateTemplateDocument,
        { signal },
      ),
    putStateTemplate: (name: string, body: StateTemplateBody, replace?: boolean) =>
      req(
        buildPath(apiRoutes.put_api_state_templates_name.path, { name }),
        s.stateTemplateDocument,
        {
          method: 'PUT',
          body,
          query: replace === true ? { replace: 'true' } : undefined,
        },
      ),
    deleteStateTemplate: (name: string) =>
      req(
        buildPath(apiRoutes.delete_api_state_templates_name.path, { name }),
        s.stateTemplateDeleted,
        {
          method: 'DELETE',
        },
      ),
    pruneStateRetention: () =>
      req(apiRoutes.post_api_state_retention_prune.path, s.stateRetentionPruned, {
        method: 'POST',
        body: {},
      }),
  };
}

/**
 * Pending saves: the writes and deferred calls a run saved before its reply and that apply after
 * it. A failed one holds its subjects until it is retried (after its cause is repaired) or
 * discarded. `status` `failed` lists the failed ones only; `outstanding` (or none) every one.
 */
function statePendingSaveMethods(t: Transport) {
  const { req } = t;
  return {
    listPendingSaves: (
      params: { status?: 'outstanding' | 'failed' } & StatePageQuery,
      signal?: AbortSignal,
    ) =>
      req(apiRoutes.get_api_state_pending_saves.path, s.pendingSavesPage, {
        signal,
        query: { status: params.status, limit: params.limit, cursor: params.cursor },
      }),
    retryPendingSave: (id: string) =>
      req(
        buildPath(apiRoutes.post_api_state_pending_saves_id_retry.path, { id }),
        s.pendingSaveRetried,
        {
          method: 'POST',
          body: {},
        },
      ),
    discardPendingSave: (id: string) =>
      req(
        buildPath(apiRoutes.delete_api_state_pending_saves_id.path, { id }),
        s.pendingSaveDiscarded,
        {
          method: 'DELETE',
        },
      ),
  };
}

export function statesClient(t: Transport) {
  // Declaration emit prepends each spread group's members, so the groups are
  // spread in reverse of their public order to keep the surface declaration →
  // attachments → records → record-ops → templates → pending saves.
  return {
    ...statePendingSaveMethods(t),
    ...stateTemplateMethods(t),
    ...stateRecordOpMethods(t),
    ...stateRecordMethods(t),
    ...stateAttachmentMethods(t),
    ...stateDeclarationMethods(t),
  };
}
