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

  const fleet = (op: string) => ({
    op,
    reachable: true,
    local_only: false,
    results: [{ name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null }],
    error: null,
  });

  it('reloadTool POSTs { kind, name, targets } to /api/tools/reload and parses the fleet report', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: fleet('reload_tool') }));
    const out = await client.reloadTool({ kind: 'example_tool', name: 'echo' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/tools/reload');
    // An omitted `targets` rides the wire as a null all-workers fan-out.
    expect(captured[0]?.body).toEqual({ kind: 'example_tool', name: 'echo', targets: null });
    expect(out.op).toBe('reload_tool');
    expect(out.results[0]?.outcome).toBe('applied');
  });

  it('reloadTool carries an explicit targets fan-out when given', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: fleet('reload_tool') }));
    await client.reloadTool({ kind: 'example_tool', name: 'echo', targets: ['serve-a'] });
    expect(captured[0]?.body).toEqual({
      kind: 'example_tool',
      name: 'echo',
      targets: ['serve-a'],
    });
  });

  it('removeTool POSTs { kind, name, targets } to /api/tools/remove', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: fleet('remove_tool') }));
    await client.removeTool({ kind: 'example_tool', name: 'echo' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/tools/remove');
    expect(captured[0]?.body).toEqual({ kind: 'example_tool', name: 'echo', targets: null });
  });

  it('surfaces a 4xx { error } from a rejected tool reload as a LOUD ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'no tool reloader for kind' }, 400));
    await expect(client.reloadTool({ kind: 'nope', name: 'echo' })).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
