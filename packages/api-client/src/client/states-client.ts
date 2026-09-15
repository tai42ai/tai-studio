/** State declaration, record, template and consumer sub-client. */
import { encodeSegment } from '../http';
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

/**
 * The subject-addressed record path: `/api/states/{name}/records/{target_kind}/
 * {target_name}/{kind}/{key}` — four path segments, each percent-encoded, so a key
 * carrying a slash or a colon never escapes its segment.
 */
function stateRecordPath(name: string, subject: StateSubjectRef): string {
  return (
    `/api/states/${encodeSegment(name)}/records/` +
    `${encodeSegment(subject.target_kind)}/${encodeSegment(subject.target_name)}/` +
    `${encodeSegment(subject.kind)}/${encodeSegment(subject.key)}`
  );
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
    listStates: (signal?: AbortSignal) => req('/api/states', s.stateList, { signal }),
    getState: (name: string, signal?: AbortSignal) =>
      req(`/api/states/${encodeSegment(name)}`, s.stateDetail, { signal }),
    // A plain declaration upsert — no `replace` flag. With records present the server
    // accepts additive schema changes and refuses with a 409 any change that removes or
    // alters an existing field, or a subject-kind removal that would strand records.
    putState: (name: string, body: StateDeclarationBody) =>
      req(`/api/states/${encodeSegment(name)}`, s.stateDetail, {
        method: 'PUT',
        body,
      }),
    deleteState: (name: string) =>
      req(`/api/states/${encodeSegment(name)}`, s.stateDeleted, { method: 'DELETE' }),
    getStateStats: (name: string, signal?: AbortSignal) =>
      req(`/api/states/${encodeSegment(name)}/stats`, s.stateStats, { signal }),
  };
}

/** Template attachments on a state: list, read, attach, re-attach and detach. */
function stateAttachmentMethods(t: Transport) {
  const { req } = t;
  return {
    listStateAttachments: (name: string, signal?: AbortSignal) =>
      req(`/api/states/${encodeSegment(name)}/attachments`, s.stateAttachmentList, { signal }),
    getStateAttachment: (name: string, template: string, signal?: AbortSignal) =>
      req(
        `/api/states/${encodeSegment(name)}/attachments/${encodeSegment(template)}`,
        s.stateAttachment,
        { signal },
      ),
    attachStateTemplate: (name: string, template: string, body: StateAttachmentBody) =>
      req(
        `/api/states/${encodeSegment(name)}/attachments/${encodeSegment(template)}`,
        s.stateAttached,
        { method: 'PUT', body },
      ),
    patchStateAttachment: (name: string, template: string, body: StateAttachmentBody) =>
      req(
        `/api/states/${encodeSegment(name)}/attachments/${encodeSegment(template)}`,
        s.stateAttachmentUpdated,
        { method: 'PATCH', body },
      ),
    detachStateTemplate: (name: string, template: string) =>
      req(
        `/api/states/${encodeSegment(name)}/attachments/${encodeSegment(template)}`,
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
      req(`/api/states/${encodeSegment(name)}/subjects`, s.subjectPage, {
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
      req(`/api/states/${encodeSegment(name)}/records/search`, s.recordSearchPage, {
        method: 'POST',
        body,
        signal,
      }),
    // A subject with no document yet reads as `null` (a 200 `{data: null}`, the record
    // page's Create path) — never an error, so the schema is nullable.
    getStateRecord: (name: string, subject: StateSubjectRef, signal?: AbortSignal) =>
      req(stateRecordPath(name, subject), s.stateRecord.nullable(), { signal }),
    putStateRecord: (name: string, subject: StateSubjectRef, data: Record<string, unknown>) =>
      req(stateRecordPath(name, subject), s.stateRecord, { method: 'PUT', body: data }),
    patchStateRecord: (name: string, subject: StateSubjectRef, data: Record<string, unknown>) =>
      req(stateRecordPath(name, subject), s.stateRecord, { method: 'PATCH', body: data }),
    applyStateRecord: (
      name: string,
      subject: StateSubjectRef,
      ops: readonly Record<string, unknown>[],
    ) =>
      req(`${stateRecordPath(name, subject)}/deltas`, s.applyResult, {
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
        `${stateRecordPath(name, subject)}/template-jq/${encodeSegment(jqName)}`,
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
        `${stateRecordPath(name, subject)}/template-jq/${encodeSegment(jqName)}`,
        s.templateJqApplyResult,
        { method: 'POST', body: body ?? {} },
      ),
    deleteStateRecord: (name: string, subject: StateSubjectRef) =>
      req(stateRecordPath(name, subject), s.recordErased, { method: 'DELETE' }),
    // `mode` is required server-side (`switch` drops, `merge` combines); the fold returns
    // a report, not the surviving record.
    foldStateRecord: (
      name: string,
      subject: StateSubjectRef,
      into: StateSubjectRef,
      mode: 'switch' | 'merge',
    ) =>
      req(`${stateRecordPath(name, subject)}/fold`, s.stateFoldReport, {
        method: 'POST',
        body: { into, mode },
      }),
    listStateWrites: (
      name: string,
      subject: StateSubjectRef,
      params?: StatePageQuery,
      signal?: AbortSignal,
    ) =>
      req(`${stateRecordPath(name, subject)}/writes`, s.writesPage, {
        signal,
        query: { limit: params?.limit, cursor: params?.cursor },
      }),
    stateConsumers: (name: string, signal?: AbortSignal) =>
      req(`/api/states/${encodeSegment(name)}/consumers`, s.stateConsumers, { signal }),
  };
}

/** State-template documents and retention: list, read, upsert, delete, prune. */
function stateTemplateMethods(t: Transport) {
  const { req } = t;
  return {
    listStateTemplates: (signal?: AbortSignal) =>
      req('/api/state-templates', s.stateTemplateList, { signal }),
    getStateTemplate: (name: string, signal?: AbortSignal) =>
      req(`/api/state-templates/${encodeSegment(name)}`, s.stateTemplateDocument, { signal }),
    putStateTemplate: (name: string, body: StateTemplateBody, replace?: boolean) =>
      req(`/api/state-templates/${encodeSegment(name)}`, s.stateTemplateDocument, {
        method: 'PUT',
        body,
        query: replace === true ? { replace: 'true' } : undefined,
      }),
    deleteStateTemplate: (name: string) =>
      req(`/api/state-templates/${encodeSegment(name)}`, s.stateTemplateDeleted, {
        method: 'DELETE',
      }),
    pruneStateRetention: () =>
      req('/api/state-retention/prune', s.stateRetentionPruned, { method: 'POST', body: {} }),
  };
}

export function statesClient(t: Transport) {
  // Declaration emit prepends each spread group's members, so the groups are
  // spread in reverse of their public order to keep the surface declaration →
  // attachments → records → record-ops → templates.
  return {
    ...stateTemplateMethods(t),
    ...stateRecordOpMethods(t),
    ...stateRecordMethods(t),
    ...stateAttachmentMethods(t),
    ...stateDeclarationMethods(t),
  };
}
