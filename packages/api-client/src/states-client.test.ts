/**
 * Transport-level tests for the states client methods: URL/query/method building,
 * the four-segment record-path encoding (a key carrying a colon or a slash stays in
 * its own segment), the `data` envelope unwrap, and a LOUD `ApiSchemaError` on a
 * drifting response (never a silent coerce). A fake `fetch` records each request and
 * returns a canned body.
 *
 * Every canned body mirrors the real skeleton operation's return shape
 * (`core/skeleton/src/tai42_skeleton/operations/states.py` + `states/service.py`): the
 * list rows are dumped declarations + `updated_at`; stats is `{records, per_field,
 * per_kind, consumers}`; the paged reads key on `subjects` / `matches`; a fold returns
 * a report; mount/patch/unmount return acknowledgements; prune returns per-state counts.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiSchemaError, type ApiConfig } from './index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface Captured {
  url: string;
  method: string;
  body: unknown;
}

function urlString(url: RequestInfo | URL): string {
  if (typeof url === 'string') return url;
  if (url instanceof URL) return url.href;
  return url.url;
}

function harness(responder: () => Response) {
  const captured: Captured[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      url: urlString(url),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    return responder();
  });
  const config: ApiConfig = { getToken: () => 'k', fetch: fetchImpl };
  return { client: createApiClient(config), captured };
}

const subject = { target_kind: 'agent', target_name: 'assistant', kind: 'person', key: 'p-1' };

// A paged subject row as `list_subjects` / `search` dump it (`_subject_from_row`): the
// subject plus the record's `updated_at` — epoch seconds (`extract(epoch FROM
// updated_at)::float8`), served raw, so a plain number.
const subjectRow = { subject, updated_at: 1767225600 };

const declaration = {
  name: 'profile',
  description: 'A person profile',
  schema: { type: 'object' },
  subject_kinds: ['person'],
  default_subject_kind: 'person',
  retention_days: null,
  effective_schema: { type: 'object' },
  regimes: [],
};

const recordDoc = {
  state: 'profile',
  subject,
  data: { tone: 'warm' },
  seq: 3,
  canonical_subject: subject,
  folded_from: [],
};

describe('states client transport', () => {
  it('listStates() hits /api/states and parses declaration rows + updated_at', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: [{ ...declaration, updated_at: '2026-01-01T00:00:00Z' }] }),
    );
    const out = await client.listStates();
    expect(captured[0]?.url).toBe('/api/states');
    expect(out[0]?.name).toBe('profile');
    expect(out[0]?.updated_at).toBe('2026-01-01T00:00:00Z');
  });

  it('getState() composes declaration + mounts', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          ...declaration,
          mounts: [{ module: 'notes', path: ['notes'], parameters: {}, declarations: {} }],
        },
      }),
    );
    const out = await client.getState('profile');
    expect(captured[0]?.url).toBe('/api/states/profile');
    expect(out.mounts[0]?.module).toBe('notes');
  });

  it('putState() PUTs the declaration with no replace query', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { ...declaration, mounts: [] } }),
    );
    await client.putState('profile', {
      name: 'profile',
      schema: { type: 'object' },
      subject_kinds: ['person'],
      default_subject_kind: 'person',
    });
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/states/profile');
  });

  it('getStateStats() parses the record/field/kind/consumer counts', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { records: 4, per_field: { tone: 3 }, per_kind: { person: 4 }, consumers: 1 },
      }),
    );
    const stats = await client.getStateStats('profile');
    expect(captured[0]?.url).toBe('/api/states/profile/stats');
    expect(stats.records).toBe(4);
    expect(stats.consumers).toBe(1);
  });

  it('a record route encodes each subject field into its own segment', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: recordDoc }));
    await client.getStateRecord('profile', {
      target_kind: 'agent',
      target_name: 'assistant',
      kind: 'thread',
      // A key with a slash and a colon must NOT escape its path segment.
      key: 'a/b:c',
    });
    expect(captured[0]?.url).toBe('/api/states/profile/records/agent/assistant/thread/a%2Fb%3Ac');
  });

  it('getStateRecord() returns null for a subject with no document yet', async () => {
    const { client } = harness(() => jsonResponse({ data: null }));
    const out = await client.getStateRecord('profile', subject);
    expect(out).toBeNull();
  });

  it('listStateSubjects() sends the kind + keyset query and parses subject rows', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { subjects: [subjectRow], next_cursor: 'c2' } }),
    );
    const page = await client.listStateSubjects('profile', { kind: 'person', limit: 50 });
    expect(captured[0]?.url).toBe('/api/states/profile/subjects?kind=person&limit=50');
    expect(page.subjects[0]?.subject.key).toBe('p-1');
    expect(page.subjects[0]?.updated_at).toBe(1767225600);
    expect(page.next_cursor).toBe('c2');
  });

  it('searchStateRecords() POSTs the filters and parses the matched subject rows', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { matches: [subjectRow], next_cursor: null } }),
    );
    const page = await client.searchStateRecords('profile', { filters: { tone: 'warm' } });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/states/profile/records/search');
    expect(captured[0]?.body).toEqual({ filters: { tone: 'warm' } });
    expect(page.matches[0]?.subject.key).toBe('p-1');
    expect(page.matches[0]?.updated_at).toBe(1767225600);
  });

  it('previewStateMigration() POSTs new_schema and parses the fit/misfit report', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { records: 4, fits: 1, misfits: 3, misfit_fields: { tone: 3 }, examples: [] },
      }),
    );
    const preview = await client.previewStateMigration('profile', {
      new_schema: { type: 'object' },
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/states/profile/migrate/preview');
    expect(captured[0]?.body).toEqual({ new_schema: { type: 'object' } });
    expect(preview.misfits).toBe(3);
  });

  it('migrateState() POSTs new_schema + confirm_drop and parses the outcome', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { migrated: true, name: 'profile' } }),
    );
    const out = await client.migrateState('profile', {
      new_schema: { type: 'object' },
      confirm_drop: true,
    });
    expect(captured[0]?.body).toEqual({ new_schema: { type: 'object' }, confirm_drop: true });
    expect(out.migrated).toBe(true);
  });

  it('mountStateModule() PUTs the mount and parses the acknowledgement', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { mounted: true, state: 'profile', module: 'notes' } }),
    );
    const out = await client.mountStateModule('profile', 'notes', {
      path: ['notes'],
      parameters: {},
    });
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/states/profile/mounts/notes');
    expect(out.mounted).toBe(true);
  });

  it('patchStateMount() PATCHes the declarations and parses the acknowledgement', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { updated: true, state: 'profile', module: 'notes' } }),
    );
    const out = await client.patchStateMount('profile', 'notes', { declarations: { cap: 5 } });
    expect(captured[0]?.method).toBe('PATCH');
    expect(out.updated).toBe(true);
  });

  it('unmountStateModule() DELETEs the mount and parses the acknowledgement', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { unmounted: true, state: 'profile', module: 'notes' } }),
    );
    const out = await client.unmountStateModule('profile', 'notes');
    expect(captured[0]?.method).toBe('DELETE');
    expect(out.unmounted).toBe(true);
  });

  it('foldStateRecord() posts the fold target + mode and parses the report', async () => {
    const into = { target_kind: 'agent', target_name: 'assistant', kind: 'person', key: 'p-2' };
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          mode: 'merge',
          from: { kind: 'person', key: 'p-1' },
          into: { kind: 'person', key: 'p-2' },
          already: false,
          flattened: 1,
        },
      }),
    );
    const out = await client.foldStateRecord('profile', subject, into, 'merge');
    expect(captured[0]?.url).toBe('/api/states/profile/records/agent/assistant/person/p-1/fold');
    expect(captured[0]?.body).toEqual({ into, mode: 'merge' });
    expect(out.flattened).toBe(1);
  });

  it('deleteStateRecord() DELETEs the record and parses the erased marker', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { erased: true } }));
    const out = await client.deleteStateRecord('profile', subject);
    expect(captured[0]?.method).toBe('DELETE');
    expect(out.erased).toBe(true);
  });

  it('listStateWrites() reads the audit page under the record path', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          items: [
            {
              seq: 1,
              at: '2026-01-01T00:00:00Z',
              origin: { door: 'api', consumer: null, actor: 'u-1' },
              paths: [['tone']],
            },
          ],
          next_cursor: null,
        },
      }),
    );
    const page = await client.listStateWrites('profile', subject, { limit: 20 });
    expect(captured[0]?.url).toBe(
      '/api/states/profile/records/agent/assistant/person/p-1/writes?limit=20',
    );
    expect(page.items[0]?.origin.door).toBe('api');
  });

  it('stateConsumers() reads the bare union of listers', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [{ kind: 'schedule', unavailable: 'no scheduling backend' }],
      }),
    );
    const out = await client.stateConsumers('profile');
    expect(captured[0]?.url).toBe('/api/states/profile/consumers');
    expect(out[0]?.unavailable).toBe('no scheduling backend');
  });

  it('listStateModules() reads the module catalog', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          {
            kind: 'state-module',
            name: 'notes',
            schema: { type: 'object' },
            mounted_on: 1,
            shipped_default: true,
          },
        ],
      }),
    );
    const out = await client.listStateModules();
    expect(captured[0]?.url).toBe('/api/state-modules');
    expect(out[0]?.shipped_default).toBe(true);
  });

  it('pruneStateRetention() POSTs the retention sweep and parses per-state counts', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: { pruned: { profile: 7 } } }));
    const out = await client.pruneStateRetention();
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/state-retention/prune');
    expect(out.pruned.profile).toBe(7);
  });

  it('deleteState() DELETEs the declaration and parses the deleted marker', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'profile', deleted: true } }),
    );
    const out = await client.deleteState('profile');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/states/profile');
    expect(out.deleted).toBe(true);
  });

  it('listStateMounts() reads the mounts under the state and parses each row', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [{ module: 'notes', path: ['notes'], parameters: { cap: 5 }, declarations: {} }],
      }),
    );
    const out = await client.listStateMounts('profile');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/states/profile/mounts');
    expect(out[0]?.module).toBe('notes');
    expect(out[0]?.parameters).toEqual({ cap: 5 });
  });

  it('putStateRecord() PUTs the document to the four-segment record path', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: recordDoc }));
    const out = await client.putStateRecord('profile', subject, { tone: 'warm' });
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/states/profile/records/agent/assistant/person/p-1');
    expect(captured[0]?.body).toEqual({ tone: 'warm' });
    expect(out.seq).toBe(3);
  });

  it('patchStateRecord() PATCHes the record path with the partial document', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: recordDoc }));
    const out = await client.patchStateRecord('profile', subject, { tone: 'brisk' });
    expect(captured[0]?.method).toBe('PATCH');
    expect(captured[0]?.url).toBe('/api/states/profile/records/agent/assistant/person/p-1');
    expect(captured[0]?.body).toEqual({ tone: 'brisk' });
    expect(out.state).toBe('profile');
  });

  it('applyStateRecord() POSTs the delta batch under the record path and parses the outcome', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { applied: true, data: { tone: 'warm' }, seq: 4, skipped: [] } }),
    );
    const ops = [{ op: 'set', path: ['tone'], value: 'warm' }];
    const out = await client.applyStateRecord('profile', subject, ops);
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/states/profile/records/agent/assistant/person/p-1/deltas');
    expect(captured[0]?.body).toEqual({ ops });
    expect(out.applied).toBe(true);
    expect(out.seq).toBe(4);
  });

  it('getStateModule() reads one module document from the sibling collection', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          kind: 'state-module',
          name: 'notes',
          schema: { type: 'object' },
          declarations: null,
        },
      }),
    );
    const out = await client.getStateModule('notes');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/state-modules/notes');
    expect(out.name).toBe('notes');
    expect(out.declarations).toBeNull();
  });

  it('putStateModule() PUTs the document, adding replace=true only when asked', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { kind: 'state-module', name: 'notes', schema: { type: 'object' } } }),
    );
    await client.putStateModule('notes', { name: 'notes', schema: { type: 'object' } }, true);
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/state-modules/notes?replace=true');
    expect(captured[0]?.body).toEqual({ name: 'notes', schema: { type: 'object' } });
  });

  it('putStateModule() omits the replace query when replace is not requested', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { kind: 'state-module', name: 'notes', schema: { type: 'object' } } }),
    );
    await client.putStateModule('notes', { name: 'notes', schema: { type: 'object' } });
    expect(captured[0]?.url).toBe('/api/state-modules/notes');
  });

  it('deleteStateModule() DELETEs the module document and parses the deleted marker', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'notes', deleted: true } }),
    );
    const out = await client.deleteStateModule('notes');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/state-modules/notes');
    expect(out.deleted).toBe(true);
  });

  it('a drifting state row throws ApiSchemaError (never a silent coerce)', async () => {
    const { client } = harness(() => jsonResponse({ data: [{ name: 'profile' }] }));
    await expect(client.listStates()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
