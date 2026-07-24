import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createApiClient } from './client';
import { ApiError, ApiSchemaError, ApiUnauthorizedError } from './errors';
import { apiRequest, apiText, encodeSegment, type ApiConfig } from './http';

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain' } });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A 200 response whose body is a live ReadableStream carrying one SSE frame. */
function sseResponse(frameText: string): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(frameText));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

function config(fetchImpl: typeof fetch, token: string | null = 'k'): ApiConfig {
  return { getToken: () => token, fetch: fetchImpl };
}

describe('apiRequest', () => {
  it('unwraps the { data } envelope and validates it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: ['a', 'b'] }));
    const out = await apiRequest(config(fetchImpl), '/api/tools', z.array(z.string()));
    expect(out).toEqual(['a', 'b']);
  });

  it('attaches the x-api-key header when a token exists', async () => {
    let captured: Record<string, string> = {};
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse({ data: 1 });
    });
    await apiRequest(config(fetchImpl as unknown as typeof fetch), '/api/x', z.number());
    expect(captured['x-api-key']).toBe('k');
  });

  it('omits the auth header when unauthenticated', async () => {
    let captured: Record<string, string> = {};
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = (init?.headers ?? {}) as Record<string, string>;
      return jsonResponse({ data: 1 });
    });
    await apiRequest(config(fetchImpl as unknown as typeof fetch, null), '/api/x', z.number());
    expect(captured['x-api-key']).toBeUndefined();
  });

  it('throws ApiUnauthorizedError on 401', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'nope' }, 401));
    await expect(apiRequest(config(fetchImpl), '/api/x', z.unknown())).rejects.toBeInstanceOf(
      ApiUnauthorizedError,
    );
  });

  it('throws ApiConflictError on 409 with the server message', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'already answered elsewhere' }, 409));
    await expect(apiRequest(config(fetchImpl), '/api/x', z.unknown())).rejects.toMatchObject({
      name: 'ApiConflictError',
      message: 'already answered elsewhere',
    });
  });

  it('throws ApiError with the { error } message on other non-2xx', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'boom' }, 500));
    await expect(apiRequest(config(fetchImpl), '/api/x', z.unknown())).rejects.toMatchObject({
      name: 'ApiError',
      message: 'boom',
    });
  });

  it('captures the optional error `code` from the failure envelope onto ApiError', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'reads unavailable', code: 'monitoring-read-not-supported' }, 501),
    );
    await expect(apiRequest(config(fetchImpl), '/api/x', z.unknown())).rejects.toMatchObject({
      name: 'ApiError',
      message: 'reads unavailable',
      code: 'monitoring-read-not-supported',
    });
  });

  it('leaves ApiError.code undefined when the envelope carries no code', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: 'boom' }, 500));
    const caught = await apiRequest(config(fetchImpl), '/api/x', z.unknown()).catch(
      (e: unknown) => e,
    );
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBeUndefined();
  });

  it('throws ApiSchemaError when the payload fails its zod schema', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { wrong: true } }));
    await expect(
      apiRequest(config(fetchImpl), '/api/x', z.array(z.string())),
    ).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('throws ApiSchemaError when the body is not a { data } envelope', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ notData: 1 }));
    await expect(apiRequest(config(fetchImpl), '/api/x', z.unknown())).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });
});

describe('apiText', () => {
  it('returns the raw body verbatim (no envelope, no zod)', async () => {
    const fetchImpl = vi.fn(async () => textResponse('OK'));
    const out = await apiText(config(fetchImpl), '/health');
    expect(out).toBe('OK');
  });

  it('throws ApiUnauthorizedError on 401', async () => {
    const fetchImpl = vi.fn(async () => textResponse('', 401));
    await expect(apiText(config(fetchImpl), '/health')).rejects.toBeInstanceOf(
      ApiUnauthorizedError,
    );
  });

  it('throws ApiError on other non-2xx', async () => {
    const fetchImpl = vi.fn(async () => textResponse('nope', 503));
    await expect(apiText(config(fetchImpl), '/metrics')).rejects.toBeInstanceOf(ApiError);
  });

  it('the client exposes getHealth / getMetrics over apiText', async () => {
    const fetchImpl = vi.fn((url: string) =>
      Promise.resolve(textResponse(url.endsWith('/metrics') ? 'tai_up 1' : 'OK')),
    );
    const client = createApiClient(config(fetchImpl as unknown as typeof fetch));
    expect(await client.getHealth()).toBe('OK');
    expect(await client.getMetrics()).toBe('tai_up 1');
  });
});

describe('createApiClient', () => {
  it('runs a tool via POST and returns the raw result', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      expect((init as RequestInit).method).toBe('POST');
      return jsonResponse({ data: { ok: 1 } });
    });
    const client = createApiClient(config(fetchImpl));
    const result = await client.runTool({ tool: 'echo', kwargs: { x: 1 } });
    expect(result).toEqual({ ok: 1 });
  });

  it('maps the SPA tool/kwargs args onto the { tool_name, arguments } wire body', async () => {
    let capturedUrl = '';
    let capturedBody: unknown;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      expect(init?.method).toBe('POST');
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ data: { ok: 1 } });
    });
    const client = createApiClient(config(fetchImpl as unknown as typeof fetch));
    await client.runTool({ tool: 'echo', kwargs: { x: 1 } });
    expect(capturedUrl).toContain('/api/run-tool');
    expect(capturedBody).toEqual({ tool_name: 'echo', arguments: { x: 1 } });
  });

  it('defaults the wire arguments to {} when kwargs is omitted', async () => {
    let capturedBody: unknown;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ data: { ok: 1 } });
    });
    const client = createApiClient(config(fetchImpl as unknown as typeof fetch));
    await client.runTool({ tool: 'echo' });
    expect(capturedBody).toEqual({ tool_name: 'echo', arguments: {} });
  });

  it('validates the oauth/complete discriminated union', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: { kind: 'success', connection_id: 'c', return_url: '/x', fanout: null },
      }),
    );
    const client = createApiClient(config(fetchImpl));
    const out = await client.completeOAuth('state', 'code');
    expect(out.kind).toBe('success');
  });

  it('lists hooks and applies default kwargs, without a topic query', async () => {
    let capturedUrl = '';
    const fetchImpl = vi.fn(async (url: string) => {
      capturedUrl = url;
      return jsonResponse({
        data: {
          items: [
            {
              name: 'h',
              topic: 't',
              tool: 'notify',
              execution_key: 'svc-notify',
            },
          ],
          total: 1,
          trigger_auth: { t: 'public' },
        },
      });
    });
    const client = createApiClient(config(fetchImpl as unknown as typeof fetch));
    const out = await client.listHooks();
    expect(capturedUrl).toContain('/api/hooks');
    expect(capturedUrl).not.toContain('topic=');
    // Optional fields default; `execution_key` does not. The door is a top-level map.
    expect(out.items[0]).toMatchObject({
      name: 'h',
      tool_kwargs: {},
      condition: null,
      expr: null,
      execution_key: 'svc-notify',
    });
    expect(out.trigger_auth).toEqual({ t: 'public' });
  });

  it('encodes the topic filter as a query param', async () => {
    let capturedUrl = '';
    const fetchImpl = vi.fn(async (url: string) => {
      capturedUrl = url;
      return jsonResponse({ data: { items: [], total: 0 } });
    });
    const client = createApiClient(config(fetchImpl as unknown as typeof fetch));
    await client.listHooks('orders');
    expect(capturedUrl).toContain('topic=orders');
  });

  it('registers a hook via POST with the params as the body', async () => {
    let capturedBody: unknown;
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ data: { registered: true, name: 'h' } });
    });
    const client = createApiClient(config(fetchImpl as unknown as typeof fetch));
    const out = await client.registerHook({
      name: 'h',
      topic: 't',
      tool: 'notify',
      execution_key: 'svc-notify',
      tool_kwargs: { to: '#ops' },
      condition: null,
      condition_id: null,
      condition_kwargs: {},
      expr: null,
      expr_id: null,
      expr_kwargs: {},
    });
    expect(out).toEqual({ registered: true, name: 'h' });
    expect(capturedBody).toMatchObject({
      name: 'h',
      tool: 'notify',
      execution_key: 'svc-notify',
    });
  });

  it('unregisters a hook via DELETE on the name-scoped path', async () => {
    let capturedUrl = '';
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      expect(init?.method).toBe('DELETE');
      return jsonResponse({ data: { removed: true, name: 'a b' } });
    });
    const client = createApiClient(config(fetchImpl as unknown as typeof fetch));
    const out = await client.unregisterHook('a b');
    expect(capturedUrl).toContain('/api/hooks/a%20b');
    expect(out).toEqual({ removed: true, name: 'a b' });
  });

  it('opens the interactions stream with the SSE accept + auth headers', async () => {
    let capturedUrl = '';
    let captured: Record<string, string> = {};
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      captured = (init?.headers ?? {}) as Record<string, string>;
      return sseResponse('event: interaction.add\ndata: {"interaction_id":"x"}\n\n');
    });
    const client = createApiClient(config(fetchImpl as unknown as typeof fetch));
    await client.streamInteractions();
    expect(capturedUrl).toContain('/api/interactions/stream');
    expect(captured.accept).toBe('text/event-stream');
    expect(captured['x-api-key']).toBe('k');
  });

  it('omits the auth header on the stream when unauthenticated', async () => {
    let captured: Record<string, string> = {};
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      captured = (init?.headers ?? {}) as Record<string, string>;
      return sseResponse('event: interaction.add\ndata: {"interaction_id":"x"}\n\n');
    });
    const client = createApiClient(config(fetchImpl as unknown as typeof fetch, null));
    await client.streamInteractions();
    expect(captured['x-api-key']).toBeUndefined();
  });

  it('throws ApiUnauthorizedError when the stream opens with 401', async () => {
    const fetchImpl = vi.fn(async () => textResponse('', 401));
    const client = createApiClient(config(fetchImpl));
    await expect(client.streamInteractions()).rejects.toBeInstanceOf(ApiUnauthorizedError);
  });

  it('throws ApiError when the stream opens with a non-ok status', async () => {
    const fetchImpl = vi.fn(async () => textResponse('nope', 500));
    const client = createApiClient(config(fetchImpl));
    await expect(client.streamInteractions()).rejects.toBeInstanceOf(ApiError);
  });

  it('returns an iterator of parsed frames for a 200 SSE body', async () => {
    const fetchImpl = vi.fn(async () =>
      sseResponse('event: interaction.add\ndata: {"interaction_id":"q1"}\n\n'),
    );
    const client = createApiClient(config(fetchImpl));
    const frames = await client.streamInteractions();
    const collected = [];
    for await (const frame of frames) collected.push(frame);
    expect(collected).toEqual([{ event: 'interaction.add', data: '{"interaction_id":"q1"}' }]);
  });
});

describe('baseUrl prefixing', () => {
  it('prefixes every request path with a non-root baseUrl', async () => {
    let capturedUrl = '';
    const fetchImpl = vi.fn(async (url: string) => {
      capturedUrl = url;
      return jsonResponse({ data: ['echo'] });
    });
    const client = createApiClient({
      getToken: () => 'k',
      baseUrl: 'https://api.example.test',
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await client.listTools();
    expect(capturedUrl).toBe('https://api.example.test/api/tools');
  });

  it('prefixes a query-bearing request under a non-root baseUrl', async () => {
    let capturedUrl = '';
    const fetchImpl = vi.fn(async (url: string) => {
      capturedUrl = url;
      return jsonResponse({ data: { items: [], total: 0 } });
    });
    const client = createApiClient({
      getToken: () => 'k',
      baseUrl: 'https://api.example.test',
      fetch: fetchImpl as unknown as typeof fetch,
    });
    await client.listHooks('orders');
    expect(capturedUrl).toBe('https://api.example.test/api/hooks?topic=orders');
  });
});

describe('network errors propagate loudly', () => {
  it('propagates a fetch rejection from a unary method (never swallowed or mislabeled)', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    const client = createApiClient(config(fetchImpl));
    // http.ts does not wrap a transport-layer failure — the typed rejection
    // propagates verbatim so the caller sees the real network error.
    await expect(client.listTools()).rejects.toBeInstanceOf(TypeError);
    await expect(client.listTools()).rejects.toThrow('fetch failed');
  });

  it('propagates a fetch rejection from opening the interactions stream', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    const client = createApiClient(config(fetchImpl));
    await expect(client.streamInteractions()).rejects.toThrow('fetch failed');
  });
});

describe('stream cancellation (AbortSignal)', () => {
  it('terminates streamInteractions with an AbortError when the signal aborts mid-stream', async () => {
    const controller = new AbortController();
    // One frame is buffered, then the body stays open (the pull never settles) so
    // the only way the iterator ends is the loop's abort guard.
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(new TextEncoder().encode('data: {"interaction_id":"x"}\n\n'));
            },
            pull() {
              return new Promise<void>(() => {
                /* never settles; only the caller's abort ends the stream */
              });
            },
          }),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
    );
    const client = createApiClient(config(fetchImpl));
    const frames = await client.streamInteractions(controller.signal);
    const iter = frames[Symbol.asyncIterator]();
    const first = await iter.next();
    expect(first.value).toEqual({ event: 'message', data: '{"interaction_id":"x"}' });
    controller.abort();
    // A cancelled stream must raise a typed AbortError, never end silently.
    await expect(iter.next()).rejects.toMatchObject({ name: 'AbortError' });
  });
});

// A representative endpoint asserting ApiError surfaces for a drifted response.
describe('contract drift', () => {
  it('surfaces a drifted providers response as ApiSchemaError', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ id: 'x' }] })); // missing required fields
    const client = createApiClient(config(fetchImpl));
    await expect(client.listProviders()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  it('surfaces a drifted hook list (missing total) as ApiSchemaError', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: { items: [] } }));
    const client = createApiClient(config(fetchImpl));
    await expect(client.listHooks()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});

describe('encodeSegment (single-segment id guard)', () => {
  it('rejects an empty, dot, dot-dot, or absolute id LOUDLY', () => {
    const rule = /path segment must not be/;
    expect(() => encodeSegment('')).toThrow(rule);
    expect(() => encodeSegment('.')).toThrow(rule);
    expect(() => encodeSegment('..')).toThrow(rule);
    expect(() => encodeSegment('/etc/passwd')).toThrow(rule);
  });

  it('percent-encodes a legit id, keeping any interior slash inside one segment', () => {
    expect(encodeSegment('paris weather')).toBe('paris%20weather');
    // `encodeURIComponent` escapes an interior `/`, so the value stays a single
    // segment rather than splitting into a nested path.
    expect(encodeSegment('a/b')).toBe('a%2Fb');
    expect(encodeSegment('plain')).toBe('plain');
  });

  it('encodes a numeric id to its digits (a version can never be unsafe)', () => {
    expect(encodeSegment(2)).toBe('2');
    expect(encodeSegment(0)).toBe('0');
  });
});
