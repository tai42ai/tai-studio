/**
 * Transport-level tests for the sub-MCP client methods: `listSubMcp`,
 * `createSubMcp`, `deleteSubMcp` — URL (+ slug encoding), HTTP method,
 * request-body shaping, the `{ data }` envelope unwrap, and a LOUD error on a 4xx
 * `{error}` plus an `ApiSchemaError` on a drifting response. A fake `fetch` records
 * each request and returns a canned body.
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

describe('sub-mcp client transport', () => {
  it('listSubMcp GETs /api/sub-mcp and parses the slug → { tools, transport } map', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { reporting: { tools: ['a', 'b'], transport: 'http' } } }),
    );
    const out = await client.listSubMcp();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/sub-mcp');
    expect(out.reporting).toEqual({ tools: ['a', 'b'], transport: 'http' });
    // `transport` is now typed on the mount value, not an opaque unknown.
    expect(out.reporting?.transport).toBe('http');
  });

  it('listSubMcp accepts an empty registry', async () => {
    const { client } = harness(() => jsonResponse({ data: {} }));
    expect(await client.listSubMcp()).toEqual({});
  });

  it('throws ApiSchemaError LOUDLY on a mount missing transport (the wire always carries it)', async () => {
    const { client } = harness(() => jsonResponse({ data: { reporting: { tools: ['a'] } } }));
    await expect(client.listSubMcp()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('createSubMcp POSTs { slug, tools } (transport omitted) and parses the created mount', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { slug: 'reporting', tools: ['a', 'b'], transport: 'http' } }),
    );
    const out = await client.createSubMcp('reporting', ['a', 'b']);
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/sub-mcp');
    // With transport undefined, JSON.stringify drops the key — the server defaults it.
    expect(captured[0]?.body).toEqual({ slug: 'reporting', tools: ['a', 'b'] });
    expect(out).toEqual({ slug: 'reporting', tools: ['a', 'b'], transport: 'http' });
  });

  it('createSubMcp forwards an explicit transport choice in the body', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { slug: 'reporting', tools: ['a'], transport: 'stdio' } }),
    );
    const out = await client.createSubMcp('reporting', ['a'], 'stdio');
    expect(captured[0]?.body).toEqual({ slug: 'reporting', tools: ['a'], transport: 'stdio' });
    expect(out.transport).toBe('stdio');
  });

  it('deleteSubMcp DELETEs the slug-encoded route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { slug: 'a b', removed: true } }),
    );
    const out = await client.deleteSubMcp('a b');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/sub-mcp/a%20b');
    expect(out.removed).toBe(true);
  });

  it('surfaces a 4xx { error } from a slug collision as a LOUD ApiError', async () => {
    const { client } = harness(() =>
      jsonResponse({ error: "slug 'reporting' already exists" }, 409),
    );
    await expect(client.createSubMcp('reporting', [])).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiSchemaError LOUDLY on a drifting created mount (removed not true)', async () => {
    const { client } = harness(() => jsonResponse({ data: { slug: 'a', removed: false } }));
    await expect(client.deleteSubMcp('a')).rejects.toBeInstanceOf(ApiSchemaError);
  });

  // A `.`/`..`/absolute/empty slug would be collapsed by the browser URL parser and
  // silently retarget the request, so the id→path encoder rejects it at the client
  // boundary before any request leaves.
  it('rejects an unsafe slug before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() =>
      jsonResponse({ data: { slug: 'a b', removed: true } }),
    );
    expect(() => client.deleteSubMcp('..')).toThrow(rule);
    expect(() => client.deleteSubMcp('.')).toThrow(rule);
    expect(() => client.deleteSubMcp('')).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.deleteSubMcp('a b');
    expect(captured[0]?.url).toBe('/api/sub-mcp/a%20b');
  });
});
