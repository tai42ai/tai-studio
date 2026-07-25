/**
 * Transport-level tests for the pluggable-kind status method: URL/method
 * building, the `{ data }` envelope unwrap into the kind-status row list, and the
 * loud schema-drift failure. A fake `fetch` records each request and returns a
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

const row = (over: Record<string, unknown> = {}) => ({
  kind: 'monitoring',
  state: 'default',
  plugin: null,
  detail: 'NoOpMonitoring — no recorder plugin installed',
  ...over,
});

describe('system-kinds client transport', () => {
  it('getSystemKinds() GETs /api/system/kinds and unwraps the row list', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [
          row(),
          row({ kind: 'backend', state: 'active', plugin: 'plugin.backend.celery', detail: '' }),
          row({ kind: 'storage', state: 'off', plugin: null, detail: 'no provider registered' }),
        ],
      }),
    );
    const out = await client.getSystemKinds();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/system/kinds');
    expect(out).toHaveLength(3);
    expect(out[0]?.kind).toBe('monitoring');
    expect(out[1]?.state).toBe('active');
    expect(out[2]?.plugin).toBeNull();
  });

  it('tolerates an additive server field on a row (non-strict object)', async () => {
    const { client } = harness(() => jsonResponse({ data: [row({ note: 'a future field' })] }));
    const out = await client.getSystemKinds();
    expect(out[0]?.kind).toBe('monitoring');
  });

  it('throws ApiSchemaError LOUDLY on a drifting state value', async () => {
    const { client } = harness(() => jsonResponse({ data: [row({ state: 'sideways' })] }));
    await expect(client.getSystemKinds()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
