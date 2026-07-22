/**
 * Transport-level tests for the trigger-link client methods: `createTriggerLink`,
 * `listTriggerLinks`, `deleteTriggerLink` — URL (+ name encoding), HTTP method,
 * request-body shaping, the `{ data }` envelope unwrap + schema round-trip, and the
 * loud failure mappings. Pins the required-nullable contract: `ttl_seconds: null`
 * serializes as an EXPLICIT null in the body (a dropped key would 400 server-side).
 * A fake `fetch` records each request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiConflictError, ApiError, ApiSchemaError, type ApiConfig } from './index';

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

describe('trigger-link client transport', () => {
  it('createTriggerLink POSTs the collection route and parses a permanent-link reply', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: CREATED }));
    const out = await client.createTriggerLink({ topic: 'orders.created', ttl_seconds: null });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/hooks/trigger-links');
    expect(out).toEqual(CREATED);
    // The schema round-trips `expires_at: null` (a permanent link).
    expect(out.expires_at).toBeNull();
  });

  it('sends ttl_seconds: null as an EXPLICIT null and omits an absent name/tool_kwargs', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: CREATED }));
    await client.createTriggerLink({ topic: 'orders.created', ttl_seconds: null });
    // The raw wire body carries the key with a null value — never a dropped key.
    expect(captured[0]?.rawBody).toContain('"ttl_seconds":null');
    expect(captured[0]?.body).toEqual({ topic: 'orders.created', ttl_seconds: null });
    expect(captured[0]?.body).not.toHaveProperty('name');
    expect(captured[0]?.body).not.toHaveProperty('tool_kwargs');
  });

  it('sends a timed ttl, a name, and tool_kwargs verbatim in the body', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { ...CREATED, name: 'timed', expires_at: '2026-07-22T10:00:00Z' } }),
    );
    await client.createTriggerLink({
      topic: 'orders.created',
      name: 'timed',
      ttl_seconds: 3600,
      tool_kwargs: { priority: 'high' },
    });
    expect(captured[0]?.body).toEqual({
      topic: 'orders.created',
      name: 'timed',
      ttl_seconds: 3600,
      tool_kwargs: { priority: 'high' },
    });
  });

  it('listTriggerLinks GETs the collection route and parses the record list', async () => {
    const record = {
      name: 'wall-poster',
      topic: 'orders.created',
      tool_kwargs: { priority: 'high' },
      created_by: 'u-1',
      created_at: '2026-07-22T09:00:00Z',
      expires_at: null,
      token_hash_prefix: 'abc123def456',
    };
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
    const record = {
      name: 'perma',
      topic: 't',
      tool_kwargs: null,
      created_by: null,
      created_at: '2026-07-22T09:00:00Z',
      expires_at: null,
      token_hash_prefix: 'aaaa1111bbbb',
    };
    const { client } = harness(() => jsonResponse({ data: { items: [record], total: 1 } }));
    const out = await client.listTriggerLinks();
    expect(out.items[0]?.tool_kwargs).toBeNull();
    expect(out.items[0]?.created_by).toBeNull();
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
      client.createTriggerLink({ topic: 't', name: 'dup', ttl_seconds: null }),
    ).rejects.toBeInstanceOf(ApiConflictError);
  });

  it('maps an invalid ttl to a LOUD 400 ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'ttl_seconds must be positive' }, 400));
    await expect(client.createTriggerLink({ topic: 't', ttl_seconds: 0 })).rejects.toBeInstanceOf(
      ApiError,
    );
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
    await expect(
      client.createTriggerLink({ topic: 'o', ttl_seconds: null }),
    ).rejects.toBeInstanceOf(ApiSchemaError);
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
