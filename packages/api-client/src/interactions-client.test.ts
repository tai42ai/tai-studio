/**
 * Transport-level tests for the interactions client methods:
 * `listInteractions` — URL + page-window query params (`page`/`pageSize`) and the
 * `{ data }` envelope unwrap — and `answerInteraction` — URL (+ id encoding), HTTP
 * method, request-body shaping, the envelope unwrap, and the two loud failure
 * mappings the answer door emits: a 409 (already answered elsewhere →
 * `ApiConflictError`) and a 404 (the interaction expired → `ApiError`). A fake
 * `fetch` records each request.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiConflictError, ApiError, type ApiConfig } from './index';

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

describe('interactions client transport', () => {
  it('listInteractions GETs the page window and unwraps the envelope', async () => {
    const window = {
      items: [],
      total: 0,
      page: 2,
      page_size: 50,
      next_page: null,
      truncated: false,
    };
    const { client, captured } = harness(() => jsonResponse({ data: window }));
    const out = await client.listInteractions(2, 50);
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toContain('/api/interactions?');
    expect(captured[0]?.url).toContain('page=2');
    expect(captured[0]?.url).toContain('pageSize=50');
    expect(out).toEqual(window);
  });

  it('answerInteraction POSTs { answer } to the id-encoded answer route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { interaction_id: 'q 1', status: 'answered' } }),
    );
    const out = await client.answerInteraction('q 1', { choice: 'yes' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/interactions/q%201/answer');
    expect(captured[0]?.body).toEqual({ answer: { choice: 'yes' } });
    expect(out).toEqual({ interaction_id: 'q 1', status: 'answered' });
  });

  it('maps a 409 (already answered elsewhere) to ApiConflictError with the server message', async () => {
    const { client } = harness(() => jsonResponse({ error: 'interaction already answered' }, 409));
    const err = await client.answerInteraction('q1', 'yes').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiConflictError);
    expect((err as ApiConflictError).message).toBe('interaction already answered');
  });

  it('maps a 404 (interaction expired / unknown) to a LOUD ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: "interaction 'q1' not found" }, 404));
    await expect(client.answerInteraction('q1', 'yes')).rejects.toBeInstanceOf(ApiError);
  });

  // A `.`/`..`/absolute/empty interaction id would be collapsed by the browser URL
  // parser and silently retarget the request, so the id→path encoder rejects it at
  // the client boundary before any request leaves.
  it('rejects an unsafe interaction id before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() =>
      jsonResponse({ data: { interaction_id: 'q 1', status: 'answered' } }),
    );
    expect(() => client.answerInteraction('..', 'yes')).toThrow(rule);
    expect(() => client.answerInteraction('.', 'yes')).toThrow(rule);
    expect(() => client.answerInteraction('', 'yes')).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.answerInteraction('q 1', { choice: 'yes' });
    expect(captured[0]?.url).toBe('/api/interactions/q%201/answer');
  });
});
