/**
 * Transport-level tests for the tool-catalog client methods: `listTools`,
 * `getToolSchema`, `getAllToolSchemas`, `listExtensions` — URL (+ name encoding),
 * HTTP method, the `{ data }` envelope unwrap, and a LOUD error on a 4xx `{error}`
 * plus an `ApiSchemaError` on a drifting response (never a silent coerce). A fake
 * `fetch` records each request and returns a canned body.
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

describe('tools client transport', () => {
  it('listTools() GETs /api/tools and unwraps the name list', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: ['echo', 'weather'] }));
    const out = await client.listTools();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/tools');
    expect(out).toEqual(['echo', 'weather']);
  });

  it('getToolSchema GETs the encoded schema route and parses input/output/description', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          input: { type: 'object', properties: { city: { type: 'string' } } },
          output: { type: 'string' },
          description: 'Weather for a city',
        },
      }),
    );
    const out = await client.getToolSchema('weather report');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/tools/weather%20report/schema');
    expect(out.description).toBe('Weather for a city');
    expect(out.output).toEqual({ type: 'string' });
  });

  it('getToolSchema parses a null output and null description', async () => {
    const { client } = harness(() =>
      jsonResponse({ data: { input: { type: 'object' }, output: null, description: null } }),
    );
    const out = await client.getToolSchema('echo');
    expect(out.output).toBeNull();
    expect(out.description).toBeNull();
  });

  it('getAllToolSchemas GETs /api/tools-schema and parses the per-tool map', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { echo: { input: { type: 'object' }, output: null, description: null } },
      }),
    );
    const out = await client.getAllToolSchemas();
    expect(captured[0]?.url).toBe('/api/tools-schema');
    expect(out.echo?.input).toEqual({ type: 'object' });
  });

  it('listExtensions GETs /api/extensions and parses the flat { name, kind } catalog', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          { name: 'argswrap', kind: 'wrapper' },
          { name: 'backendx', kind: 'backend' },
        ],
      }),
    );
    const out = await client.listExtensions();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/extensions');
    expect(out[1]).toEqual({ name: 'backendx', kind: 'backend' });
  });

  it('surfaces a 4xx { error } as a LOUD ApiError (never a silent empty list)', async () => {
    const { client } = harness(() => jsonResponse({ error: 'tool registry unavailable' }, 503));
    await expect(client.listTools()).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiSchemaError LOUDLY on a drifting extension row (missing kind)', async () => {
    const { client } = harness(() => jsonResponse({ data: [{ name: 'argswrap' }] }));
    await expect(client.listExtensions()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  // A `.`/`..`/absolute/empty tool name would be collapsed by the browser URL
  // parser and silently retarget the request at a different route, so the id→path
  // encoder rejects it at the client boundary before any request leaves.
  it('rejects an unsafe tool name before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() =>
      jsonResponse({ data: { input: { type: 'object' }, output: null, description: null } }),
    );
    expect(() => client.getToolSchema('..')).toThrow(rule);
    expect(() => client.getToolSchema('.')).toThrow(rule);
    expect(() => client.getToolSchema('')).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.getToolSchema('weather report');
    expect(captured[0]?.url).toBe('/api/tools/weather%20report/schema');
  });
});
