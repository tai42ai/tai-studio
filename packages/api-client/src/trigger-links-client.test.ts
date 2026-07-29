/**
 * Transport-level tests for the trigger-link client methods: `createTriggerLink`,
 * `listTriggerLinks`, `deleteTriggerLink` — URL (+ name encoding), HTTP method,
 * request-body shaping, the `{ data }` envelope unwrap + schema round-trip, and the
 * loud failure mappings. Pins the required-nullable contract: `ttl_seconds: null`
 * serializes as an EXPLICIT null in the body (a dropped key would 400 server-side).
 * The create body carries `require_api_key` (not a door object); each record carries
 * the required `execution_key` and the `trigger_auth` door as a string enum.
 * A fake `fetch` records each request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import {
  ApiConflictError,
  ApiError,
  ApiSchemaError,
  type ApiConfig,
  type TriggerLinkCreateBody,
} from './index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

interface Captured {
  url: string;
  method: string;
  rawBody: string | undefined;
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
    const rawBody = typeof init?.body === 'string' ? init.body : undefined;
    captured.push({
      url: urlString(url),
      method: init?.method ?? 'GET',
      rawBody,
      body: rawBody === undefined ? undefined : JSON.parse(rawBody),
    });
    return responder();
  });
  const config: ApiConfig = { getToken: () => 'k', fetch: fetchImpl };
  return { client: createApiClient(config), captured };
}

const CREATED = {
  name: 'wall-poster',
  trigger_path: '/trigger/trg-abc123',
  token: 'trg-abc123',
  topic: 'orders.created',
  expires_at: null,
};

/** A create body with the required authorization fields filled in. */
function createBody(overrides: Partial<TriggerLinkCreateBody> = {}): TriggerLinkCreateBody {
  return {
    topic: 'orders.created',
    execution_key: 'svc-orders',
    require_api_key: false,
    ttl_seconds: null,
    ...overrides,
  };
}

/** A listed record with the fields every live link carries (door is a string enum). */
function linkRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'wall-poster',
    topic: 'orders.created',
    execution_key: 'svc-orders',
    trigger_auth: 'token',
    tool_kwargs: { priority: 'high' },
    created_by: 'u-1',
    created_at: '2026-07-22T09:00:00Z',
    expires_at: null,
    token_hash_prefix: 'abc123def456',
    ...overrides,
  };
}

describe('trigger-link client transport', () => {
  it('createTriggerLink POSTs the collection route and parses a permanent-link reply', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: CREATED }));
    const out = await client.createTriggerLink(createBody());
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/hooks/trigger-links');
    expect(out).toEqual(CREATED);
    // The schema round-trips `expires_at: null` (a permanent link).
    expect(out.expires_at).toBeNull();
  });

  it('sends ttl_seconds: null as an EXPLICIT null and omits an absent name/tool_kwargs', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: CREATED }));
    await client.createTriggerLink(createBody());
    // The raw wire body carries the key with a null value — never a dropped key.
    expect(captured[0]?.rawBody).toContain('"ttl_seconds":null');
    expect(captured[0]?.body).toEqual({
      topic: 'orders.created',
      execution_key: 'svc-orders',
      require_api_key: false,
      ttl_seconds: null,
    });
    expect(captured[0]?.body).not.toHaveProperty('name');
    expect(captured[0]?.body).not.toHaveProperty('tool_kwargs');
  });

  it('sends the bound execution_key and require_api_key verbatim (never a trigger_auth object)', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: CREATED }));
    await client.createTriggerLink(
      createBody({ execution_key: 'svc-least-privilege', require_api_key: true }),
    );
    expect(captured[0]?.body).toHaveProperty('execution_key', 'svc-least-privilege');
    expect(captured[0]?.body).toHaveProperty('require_api_key', true);
    expect(captured[0]?.body).not.toHaveProperty('trigger_auth');
  });

  it('sends a timed ttl, a name, and tool_kwargs verbatim in the body', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { ...CREATED, name: 'timed', expires_at: '2026-07-22T10:00:00Z' } }),
    );
    await client.createTriggerLink(
      createBody({ name: 'timed', ttl_seconds: 3600, tool_kwargs: { priority: 'high' } }),
    );
    expect(captured[0]?.body).toEqual({
      topic: 'orders.created',
      name: 'timed',
      execution_key: 'svc-orders',
      require_api_key: false,
      ttl_seconds: 3600,
      tool_kwargs: { priority: 'high' },
    });
  });

  it('listTriggerLinks GETs the collection route and parses the record list', async () => {
    const record = linkRecord();
    const { client, captured } = harness(() =>
      jsonResponse({ data: { items: [record], total: 1 } }),
    );
    const out = await client.listTriggerLinks();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/hooks/trigger-links');
    expect(out.total).toBe(1);
    expect(out.items[0]).toEqual(record);
  });

  it('listTriggerLinks accepts a null tool_kwargs and null created_by/expires_at', async () => {
    const record = linkRecord({
      name: 'perma',
      topic: 't',
      tool_kwargs: null,
      created_by: null,
      token_hash_prefix: 'aaaa1111bbbb',
    });
    const { client } = harness(() => jsonResponse({ data: { items: [record], total: 1 } }));
    const out = await client.listTriggerLinks();
    expect(out.items[0]?.tool_kwargs).toBeNull();
    expect(out.items[0]?.created_by).toBeNull();
  });

  it('parses a listed record whose door carries the api-key requirement (token+api_key)', async () => {
    const record = linkRecord({ trigger_auth: 'token+api_key' });
    const { client } = harness(() => jsonResponse({ data: { items: [record], total: 1 } }));
    const out = await client.listTriggerLinks();
    expect(out.items[0]?.trigger_auth).toBe('token+api_key');
  });

  it('throws ApiSchemaError LOUDLY on a listed record with no execution_key', async () => {
    const { execution_key: _dropped, ...keyless } = linkRecord();
    const { client } = harness(() => jsonResponse({ data: { items: [keyless], total: 1 } }));
    await expect(client.listTriggerLinks()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('throws ApiSchemaError LOUDLY on an unknown trigger_auth door', async () => {
    const record = linkRecord({ trigger_auth: 'sso' });
    const { client } = harness(() => jsonResponse({ data: { items: [record], total: 1 } }));
    await expect(client.listTriggerLinks()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('throws ApiSchemaError LOUDLY on an EMPTY execution_key (never a blank Runs-as)', async () => {
    const record = linkRecord({ execution_key: '' });
    const { client } = harness(() => jsonResponse({ data: { items: [record], total: 1 } }));
    await expect(client.listTriggerLinks()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('throws ApiSchemaError LOUDLY on a listed record with no trigger_auth', async () => {
    const { trigger_auth: _dropped, ...doorless } = linkRecord();
    const { client } = harness(() => jsonResponse({ data: { items: [doorless], total: 1 } }));
    await expect(client.listTriggerLinks()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('deleteTriggerLink DELETEs the name-encoded route and parses the reply', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { removed: true, name: 'a b' } }),
    );
    const out = await client.deleteTriggerLink('a b');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/hooks/trigger-links/a%20b');
    expect(out).toEqual({ removed: true, name: 'a b' });
  });

  it('maps a taken name to a LOUD 409 ApiConflictError', async () => {
    const { client } = harness(() =>
      jsonResponse({ error: 'trigger link name already exists' }, 409),
    );
    await expect(
      client.createTriggerLink(createBody({ topic: 't', name: 'dup' })),
    ).rejects.toBeInstanceOf(ApiConflictError);
  });

  it('maps an invalid ttl to a LOUD 400 ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'ttl_seconds must be positive' }, 400));
    await expect(
      client.createTriggerLink(createBody({ topic: 't', ttl_seconds: 0 })),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('maps the in-memory 501 refusal to a LOUD ApiError', async () => {
    const { client } = harness(() =>
      jsonResponse({ error: 'trigger links require the redis hooks backend' }, 501),
    );
    await expect(client.listTriggerLinks()).rejects.toBeInstanceOf(ApiError);
  });

  it('maps a revoke of an unknown name to a LOUD 404 ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'unknown trigger link' }, 404));
    await expect(client.deleteTriggerLink('ghost')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiSchemaError LOUDLY on a drifting create reply (missing trigger_path)', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { name: 'x', token: 't', topic: 'o', expires_at: null } }),
    );
    await expect(client.createTriggerLink(createBody({ topic: 'o' }))).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });

  // A `.`/`..`/absolute/empty name would be collapsed by the browser URL parser and
  // silently retarget the request, so the id→path encoder rejects it at the client
  // boundary before any request leaves.
  it('rejects an unsafe link name before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() =>
      jsonResponse({ data: { removed: true, name: 'ok' } }),
    );
    expect(() => client.deleteTriggerLink('..')).toThrow(rule);
    expect(() => client.deleteTriggerLink('')).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.deleteTriggerLink('ok');
    expect(captured[0]?.url).toBe('/api/hooks/trigger-links/ok');
  });
});
