/**
 * TanStack Query key factory for the states surface. Centralising the keys keeps
 * the query definitions and the post-mutation invalidations referring to the exact
 * same tuples — no drift.
 *
 * The management list is keyed `['states', 'list']`; a single state's composite read
 * (declaration + mounts + regimes) `['states', 'detail', name]`, its stats
 * `['states', 'stats', name]`, and its consumers `['states', 'consumers', name]`. A
 * per-subject record and its audit trail carry the subject's four-part identity in the
 * key so two subjects of the same state never share a cache slot. The module-document
 * catalog and the conversation-target list are SIBLINGS of the state list, so
 * invalidating one state never refetches them.
 */
/** The root segment every states query key shares. */
export const STATES_KEY_ROOT = 'states';

/** The structural four-part subject identity both `StateSubject` and `StateSubjectRef` satisfy. */
interface SubjectLike {
  readonly target_kind: string;
  readonly target_name: string;
  readonly kind: string;
  readonly key: string;
}

/** Key for the state management list. */
export const statesListKey = [STATES_KEY_ROOT, 'list'] as const;

/** Key for one state's composite read (declaration + mounts + regimes), by name. */
export function stateDetailKey(name: string): readonly [typeof STATES_KEY_ROOT, 'detail', string] {
  return [STATES_KEY_ROOT, 'detail', name];
}

/** Key for one state's record/subject stats, by name. */
export function stateStatsKey(name: string): readonly [typeof STATES_KEY_ROOT, 'stats', string] {
  return [STATES_KEY_ROOT, 'stats', name];
}

/** Key for one state's consumers (the union of registered listers), by name. */
export function stateConsumersKey(
  name: string,
): readonly [typeof STATES_KEY_ROOT, 'consumers', string] {
  return [STATES_KEY_ROOT, 'consumers', name];
}

/** Key for the state-module document catalog (`GET /api/state-modules`). */
export const stateModulesKey = [STATES_KEY_ROOT, 'modules'] as const;

/** Key for a keyset page of a state's subjects of one kind. */
export function stateSubjectsKey(
  name: string,
  kind: string,
): readonly [typeof STATES_KEY_ROOT, 'subjects', string, string] {
  return [STATES_KEY_ROOT, 'subjects', name, kind];
}

/** Key for a content search over a state's records. */
export function stateSearchKey(
  name: string,
  query: string,
): readonly [typeof STATES_KEY_ROOT, 'search', string, string] {
  return [STATES_KEY_ROOT, 'search', name, query];
}

/**
 * A stable, collision-free string identity for one subject — its four fields joined
 * so the query cache and the URL search agree on the same subject. Never split on it
 * to recover the parts (a key may itself contain the separators); it is an opaque tag.
 */
export function subjectIdentity(subject: SubjectLike): string {
  return JSON.stringify([subject.target_kind, subject.target_name, subject.kind, subject.key]);
}

/** Key for one subject's record document, by state name + subject identity. */
export function stateRecordKey(
  name: string,
  subject: SubjectLike,
): readonly [typeof STATES_KEY_ROOT, 'record', string, string] {
  return [STATES_KEY_ROOT, 'record', name, subjectIdentity(subject)];
}

/** Key for one subject's audit trail (the writes ledger), by state name + subject. */
export function stateWritesKey(
  name: string,
  subject: SubjectLike,
): readonly [typeof STATES_KEY_ROOT, 'writes', string, string] {
  return [STATES_KEY_ROOT, 'writes', name, subjectIdentity(subject)];
}

/** Key for the conversation-target list feeding the record-lookup target picker. */
export const conversationTargetsKey = [STATES_KEY_ROOT, 'targets'] as const;
