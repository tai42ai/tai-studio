/**
 * Transport-level tests for the topic-verifier hooks client methods:
 * `listHookVerifiers`, `setTopicVerifier`, `deleteTopicVerifier` — URL (+ topic
 * encoding), HTTP method, request-body shaping, the `{ data }` envelope unwrap, and
 * the loud failure mappings (an unknown verifier name is a 400, an unbind with no
 * binding is a 404). `listHooks` (list + topic filter) is exercised in
 * `http.test.ts`; its listed-record contract is pinned here. A fake `fetch`
 * records each request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiError, ApiSchemaError, type ApiConfig } from './index';

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

describe('hooks topic-verifier client transport', () => {
  it('listHookVerifiers GETs the verifiers route and parses the sorted name list', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: ['github_hmac', 'stripe_sig'] }),
    );
    const out = await client.listHookVerifiers();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/hooks/verifiers');
    expect(out).toEqual(['github_hmac', 'stripe_sig']);
  });

  it('listHookVerifiers accepts an empty registry', async () => {
    const { client } = harness(() => jsonResponse({ data: [] }));
    expect(await client.listHookVerifiers()).toEqual([]);
  });

  it('setTopicVerifier PUTs the verifier binding to the topic-encoded route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { topic: 'orders/new', verifier: 'github_hmac' } }),
    );
    const out = await client.setTopicVerifier('orders/new', {
      verifier: 'github_hmac',
      config: { secret_env: 'GH_HOOK_SECRET' },
    });
    expect(captured[0]?.method).toBe('PUT');
    expect(captured[0]?.url).toBe('/api/hooks/topics/orders%2Fnew/verifier');
    expect(captured[0]?.body).toEqual({
      verifier: 'github_hmac',
      config: { secret_env: 'GH_HOOK_SECRET' },
    });
    expect(out).toEqual({ topic: 'orders/new', verifier: 'github_hmac' });
  });

  it('setTopicVerifier omits config from the body when none is provided', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { topic: 'orders', verifier: 'github_hmac' } }),
    );
    await client.setTopicVerifier('orders', { verifier: 'github_hmac' });
    expect(captured[0]?.body).toEqual({ verifier: 'github_hmac' });
  });

  it('maps an unknown verifier name to a LOUD 400 ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: "unknown verifier 'ghost'" }, 400));
    await expect(client.setTopicVerifier('orders', { verifier: 'ghost' })).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('deleteTopicVerifier DELETEs the topic-encoded route and parses the unbind', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { removed: true, topic: 'orders' } }),
    );
    const out = await client.deleteTopicVerifier('orders');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/hooks/topics/orders/verifier');
    expect(out.removed).toBe(true);
  });

  it('maps an unbind with no binding to a LOUD 404 ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'no verifier bound' }, 404));
    await expect(client.deleteTopicVerifier('orders')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiSchemaError LOUDLY on a drifting verifier list (non-string member)', async () => {
    const { client } = harness(() => jsonResponse({ data: [1] }));
    await expect(client.listHookVerifiers()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  // A `.`/`..`/absolute/empty hook name or topic would be collapsed by the browser
  // URL parser and silently retarget the request, so the id→path encoder rejects it
  // at the client boundary before any request leaves.
  it('rejects an unsafe hook name / topic before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() =>
      jsonResponse({ data: { removed: true, topic: 'a b' } }),
    );
    expect(() => client.unregisterHook('..')).toThrow(rule);
    expect(() => client.setTopicVerifier('..', { verifier: 'x' })).toThrow(rule);
    expect(() => client.deleteTopicVerifier('.')).toThrow(rule);
    expect(() => client.deleteTopicVerifier('')).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.deleteTopicVerifier('a b');
    expect(captured[0]?.url).toBe('/api/hooks/topics/a%20b/verifier');
  });
});

/** A listed hook with the fields every registered hook carries (no door — that is topic-level). */
function hookRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'notify-on-order',
    topic: 'orders.created',
    tool: 'slack.post_message',
    execution_key: 'svc-orders',
    ...overrides,
  };
}

describe('hook listed-record contract', () => {
  it('parses a listed hook and the top-level topic → door map', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: { items: [hookRecord()], total: 1, trigger_auth: { 'orders.created': 'verifier' } },
      }),
    );
    const out = await client.listHooks();
    expect(out.items[0]?.execution_key).toBe('svc-orders');
    expect(out.trigger_auth).toEqual({ 'orders.created': 'verifier' });
  });

  it('defaults the door map to {} when the server omits it (older response)', async () => {
    const { client } = harness(() => jsonResponse({ data: { items: [hookRecord()], total: 1 } }));
    const out = await client.listHooks();
    expect(out.trigger_auth).toEqual({});
  });

  it('throws ApiSchemaError LOUDLY on a listed hook with no execution_key', async () => {
    const { execution_key: _dropped, ...keyless } = hookRecord();
    const { client } = harness(() => jsonResponse({ data: { items: [keyless], total: 1 } }));
    await expect(client.listHooks()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('throws ApiSchemaError LOUDLY on a listed hook with an EMPTY execution_key', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { items: [hookRecord({ execution_key: '' })], total: 1 } }),
    );
    await expect(client.listHooks()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('throws ApiSchemaError LOUDLY on an unknown door in the topic → door map', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: { items: [hookRecord()], total: 1, trigger_auth: { 'orders.created': 'sso' } },
      }),
    );
    await expect(client.listHooks()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
