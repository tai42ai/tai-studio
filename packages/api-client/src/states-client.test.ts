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
 * a report; attach/patch/detach return acknowledgements; prune returns per-state counts.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import * as schemas from './schemas';
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

  it('getState() composes declaration + attachments', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          ...declaration,
          attachments: [{ template: 'notes', path: ['notes'], parameters: {}, declarations: {} }],
        },
      }),
    );
    const out = await client.getState('profile');
    expect(captured[0]?.url).toBe('/api/states/profile');
    expect(out.attachments[0]?.template).toBe('notes');
  });

  it('putState() PUTs the declaration with no replace query', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { ...declaration, attachments: [] } }),
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

  it('attachStateTemplate() PUTs the attachment and parses the acknowledgement', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { attached: true, state: 'profile', template: 'notes' } }),
    );
    const out = await client.attachStateTemplate('profile', 'notes', {
      path: ['notes'],
      parameters: {},
    });
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/states/profile/attachments/notes');
    expect(out.attached).toBe(true);
  });

  it('patchStateAttachment() PATCHes the declarations and parses the acknowledgement', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { updated: true, state: 'profile', template: 'notes' } }),
    );
    const out = await client.patchStateAttachment('profile', 'notes', {
      declarations: { cap: 5 },
    });
    expect(captured[0]?.method).toBe('PATCH');
    expect(out.updated).toBe(true);
  });

  it('detachStateTemplate() DELETEs the attachment and parses the acknowledgement', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { detached: true, state: 'profile', template: 'notes' } }),
    );
    const out = await client.detachStateTemplate('profile', 'notes');
    expect(captured[0]?.method).toBe('DELETE');
    expect(out.detached).toBe(true);
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

  it('listStateTemplates() reads the template catalog', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          {
            kind: 'state-template',
            name: 'notes',
            schema: { type: 'object' },
            attached_to: 1,
            shipped_default: true,
          },
        ],
      }),
    );
    const out = await client.listStateTemplates();
    expect(captured[0]?.url).toBe('/api/state-templates');
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

  it('listStateAttachments() reads the attachments under the state and parses each row', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [{ template: 'notes', path: ['notes'], parameters: { cap: 5 }, declarations: {} }],
      }),
    );
    const out = await client.listStateAttachments('profile');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/states/profile/attachments');
    expect(out[0]?.template).toBe('notes');
    expect(out[0]?.parameters).toEqual({ cap: 5 });
  });

  it('getStateAttachment() reads the single attachment row under the state', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { template: 'notes', path: ['notes'], parameters: { cap: 5 }, declarations: {} },
      }),
    );
    const out = await client.getStateAttachment('profile', 'notes');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/states/profile/attachments/notes');
    expect(out.template).toBe('notes');
    expect(out.parameters).toEqual({ cap: 5 });
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

  it('evalTemplateJq() JSON-encodes each param into the query and parses {name, purpose, value}', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'active', purpose: 'input', value: [{ id: 'a-1' }] } }),
    );
    const out = await client.evalTemplateJq('profile', subject, 'active', {
      since: 'p-1',
      limit: 5,
    });
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe(
      '/api/states/profile/records/agent/assistant/person/p-1/template-jq/active?since=%22p-1%22&limit=5',
    );
    expect(out.name).toBe('active');
    expect(out.purpose).toBe('input');
    expect(out.value).toEqual([{ id: 'a-1' }]);
  });

  it('evalTemplateJq() sends no query string when no params are given', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'active', purpose: 'input', value: null } }),
    );
    const out = await client.evalTemplateJq('profile', subject, 'active');
    expect(captured[0]?.url).toBe(
      '/api/states/profile/records/agent/assistant/person/p-1/template-jq/active',
    );
    expect(out.value).toBeNull();
  });

  it('applyTemplateJq() POSTs {input, op_id} to the template-jq path and parses the outcome', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          name: 'append',
          applied: true,
          data: { count: 1 },
          seq: 5,
          skipped: [],
        },
      }),
    );
    const out = await client.applyTemplateJq('profile', subject, 'append', {
      input: { note: 'hi' },
      op_id: 'op-1',
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe(
      '/api/states/profile/records/agent/assistant/person/p-1/template-jq/append',
    );
    expect(captured[0]?.body).toEqual({ input: { note: 'hi' }, op_id: 'op-1' });
    expect(out.applied).toBe(true);
    expect(out.seq).toBe(5);
  });

  it('applyTemplateJq() posts an empty body when none is given', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { name: 'active', applied: false, data: null, seq: null, skipped: [] },
      }),
    );
    const out = await client.applyTemplateJq('profile', subject, 'active');
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.body).toEqual({});
    expect(out.applied).toBe(false);
    expect(out.name).toBe('active');
  });

  it('getStateTemplate() reads one template document from the sibling collection', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          kind: 'state-template',
          name: 'notes',
          schema: { type: 'object' },
          declarations: null,
        },
      }),
    );
    const out = await client.getStateTemplate('notes');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/state-templates/notes');
    expect(out.name).toBe('notes');
    expect(out.declarations).toBeNull();
  });

  it('putStateTemplate() PUTs the document, adding replace=true only when asked', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { kind: 'state-template', name: 'notes', schema: { type: 'object' } } }),
    );
    await client.putStateTemplate('notes', { name: 'notes', schema: { type: 'object' } }, true);
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/state-templates/notes?replace=true');
    expect(captured[0]?.body).toEqual({ name: 'notes', schema: { type: 'object' } });
  });

  it('putStateTemplate() omits the replace query when replace is not requested', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { kind: 'state-template', name: 'notes', schema: { type: 'object' } } }),
    );
    await client.putStateTemplate('notes', { name: 'notes', schema: { type: 'object' } });
    expect(captured[0]?.url).toBe('/api/state-templates/notes');
  });

  it('deleteStateTemplate() DELETEs the template document and parses the deleted marker', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'notes', deleted: true } }),
    );
    const out = await client.deleteStateTemplate('notes');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/state-templates/notes');
    expect(out.deleted).toBe(true);
  });

  it('a drifting state row throws ApiSchemaError (never a silent coerce)', async () => {
    const { client } = harness(() => jsonResponse({ data: [{ name: 'profile' }] }));
    await expect(client.listStates()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});

describe('state-template document + record-result schemas', () => {
  it('parses a served document whose reconcile keys orphans and whose bodies are templated text', () => {
    const doc = schemas.stateTemplateDocument.parse({
      kind: 'state-template',
      name: 'notes',
      schema: { type: 'object' },
      declarations: { schema: { type: 'object' }, check: { content: '.ok' } },
      template_jq: {
        active: {
          description: 'open items',
          purpose: 'input',
          params: ['since'],
          jq: { content: '.items' },
        },
        append: {
          description: 'add one',
          purpose: 'update',
          reads: [['items']],
          writes: [['items']],
          jq: { content: '[{op:"set"}]', kwargs: {} },
        },
      },
      reconcile: {
        orphans: { content: '[ .data.items[] ]' },
        close: { content: '[]' },
        resolutions: { content: '.names' },
      },
    });
    expect(doc.template_jq?.active?.jq).toEqual({ content: '.items' });
    expect(doc.template_jq?.active?.purpose).toBe('input');
    expect(doc.template_jq?.active?.params).toEqual(['since']);
    expect(doc.template_jq?.append?.writes).toEqual([['items']]);
    expect(doc.reconcile?.orphans).toEqual({ content: '[ .data.items[] ]' });
    expect(doc.reconcile?.resolutions).toEqual({ content: '.names' });
    expect(doc.declarations?.check).toEqual({ content: '.ok' });
  });

  it('defaults template_jq/reconcile to null when the document omits them', () => {
    const doc = schemas.stateTemplateDocument.parse({ name: 'notes', schema: { type: 'object' } });
    expect(doc.template_jq).toBeNull();
    expect(doc.reconcile).toBeNull();
  });

  it('fills the optional fields of a template jq with their defaults', () => {
    const read = schemas.templateJq.parse({ purpose: 'input', jq: { content: '.x' } });
    expect(read.description).toBe('');
    expect(read.params).toEqual([]);
    const update = schemas.templateJq.parse({ purpose: 'update', jq: { content: '.x' } });
    expect(update.description).toBe('');
    expect(update.reads).toEqual([]);
    expect(update.writes).toEqual([]);
  });

  it('throws on a template jq missing its purpose (never a silent coerce)', () => {
    expect(() => schemas.templateJq.parse({ jq: { content: '.x' } })).toThrow();
  });

  it('parses an eval result and an apply result', () => {
    const evaluated = schemas.templateJqResult.parse({
      name: 'active',
      purpose: 'input',
      value: [1, 2],
    });
    expect(evaluated.value).toEqual([1, 2]);
    const applied = schemas.templateJqApplyResult.parse({
      name: 'append',
      applied: true,
      data: { n: 1 },
      seq: 2,
      skipped: [],
    });
    expect(applied.seq).toBe(2);
    expect(applied.name).toBe('append');
  });

  it('throws on a reconcile missing a required jq program (never a silent coerce)', () => {
    expect(() =>
      schemas.templateReconcile.parse({ orphans: { content: '.open' }, close: { content: '[]' } }),
    ).toThrow();
  });
});

describe('state-binding schema', () => {
  it('round-trips a full binding (states, templates, injections, updates)', () => {
    const binding = schemas.stateBinding.parse({
      states: [
        {
          state: 'counters',
          templates: ['tally'],
          subject_expr: { content: '.counter_id' },
          scope_expr: { content: '.group' },
          input_injections: [{ template_jq: 'tally.current', into: 'baseline' }],
          updates: [
            {
              template_jq: 'tally.bump',
              adapter: { content: '{ total: .output.total }' },
              op_id: { content: '.id' },
            },
          ],
        },
      ],
    });
    expect(binding.states).toHaveLength(1);
    const [attach] = binding.states;
    if (attach === undefined) throw new Error('expected one attached state');
    expect(attach.templates).toEqual(['tally']);
    expect(attach.subject_expr).toEqual({ content: '.counter_id' });
    const [injection] = attach.input_injections;
    const [update] = attach.updates;
    if (injection === undefined || update === undefined) throw new Error('expected rows');
    expect(injection.into).toBe('baseline');
    expect(update.template_jq).toBe('tally.bump');
    expect(update.adapter).toEqual({ content: '{ total: .output.total }' });
  });

  it('fills the optional fields of an attach/injection/update with their defaults', () => {
    const attach = schemas.stateAttach.parse({ state: 'notes', subject_expr: { content: '.id' } });
    expect(attach.templates).toEqual([]);
    expect(attach.scope_expr).toBeNull();
    expect(attach.input_injections).toEqual([]);
    expect(attach.updates).toEqual([]);

    const injection = schemas.stateInjection.parse({ jq: { content: '.x' }, into: 'field' });
    expect(injection.template_jq).toBeNull();
    expect(injection.jq).toEqual({ content: '.x' });

    const update = schemas.stateUpdate.parse({ jq: { content: '[{op:"set"}]' } });
    expect(update.template_jq).toBeNull();
    expect(update.adapter).toBeNull();
    expect(update.op_id).toBeNull();
  });

  it('refuses a zero-state binding — "no binding" is spelled null, never { states: [] }', () => {
    // The platform contract enforces at least one attached state; a binding with none is
    // not a representation the SDK accepts (the definition carries `null` instead).
    expect(() => schemas.stateBinding.parse({})).toThrow();
    expect(() => schemas.stateBinding.parse({ states: [] })).toThrow();
    expect(
      schemas.stateBinding.parse({ states: [{ state: 'notes', subject_expr: { content: '.id' } }] })
        .states,
    ).toHaveLength(1);
  });

  it('throws on an injection missing its `into` target (never a silent coerce)', () => {
    expect(() => schemas.stateInjection.parse({ template_jq: 'balance.current' })).toThrow();
  });

  it('throws on an attach missing its subject expression', () => {
    expect(() => schemas.stateAttach.parse({ state: 'notes' })).toThrow();
  });

  it('throws on an EMPTY subject expression — parity with the contract min_length=1', () => {
    expect(() =>
      schemas.stateAttach.parse({ state: 'notes', subject_expr: { content: '' } }),
    ).toThrow();
    // A required templated-text with a chosen-but-empty stored id is empty too.
    expect(() => schemas.stateAttach.parse({ state: 'notes', subject_expr: { id: '' } })).toThrow();
  });

  it('carries the binding onto the door bodies (preset, route, hook)', () => {
    const preset = schemas.presetBody.parse({
      base_tool: 'echo',
      description: 'd',
      fixed_kwargs: {},
      extensions: [],
      output_schema: null,
      input_schema: null,
      state_binding: { states: [{ state: 'notes', subject_expr: { content: '.id' } }] },
    });
    expect(preset.state_binding?.states[0]?.state).toBe('notes');

    const routeless = schemas.presetBody.parse({
      base_tool: 'echo',
      description: 'd',
      fixed_kwargs: {},
      extensions: [],
      output_schema: null,
      input_schema: null,
    });
    expect(routeless.state_binding).toBeNull();
  });
});
