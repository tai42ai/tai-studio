/**
 * Transport-level tests for the channels catalog method: URL/method building, the
 * `{ data }` envelope unwrap, and a LOUD `ApiSchemaError` on a drifting response
 * (never a silent coerce). A fake `fetch` records each request and returns a
 * canned body.
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
}

function urlString(url: RequestInfo | URL): string {
  if (typeof url === 'string') return url;
  if (url instanceof URL) return url.href;
  return url.url;
}

function harness(responder: () => Response) {
  const captured: Captured[] = [];
  const fetchImpl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: urlString(url), method: init?.method ?? 'GET' });
    return Promise.resolve(responder());
  });
  const config: ApiConfig = { getToken: () => 'k', fetch: fetchImpl };
  return { client: createApiClient(config), captured };
}

describe('channels client transport', () => {
  it('listChannels() GETs /api/channels and unwraps the catalog', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { channels: ['telegram', 'slack'] } }),
    );
    const out = await client.listChannels();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/channels');
    expect(out.channels).toEqual(['telegram', 'slack']);
  });

  it('listChannels() accepts an empty catalog', async () => {
    const { client } = harness(() => jsonResponse({ data: { channels: [] } }));
    const out = await client.listChannels();
    expect(out.channels).toEqual([]);
  });

  it('throws ApiSchemaError LOUDLY on a drifting body (non-string member)', async () => {
    const { client } = harness(() => jsonResponse({ data: { channels: [1] } }));
    await expect(client.listChannels()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
