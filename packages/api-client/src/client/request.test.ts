/**
 * The host's authenticated request for a plugin's own routes: the same auth header,
 * `{ data }` unwrap, 401 handling and schema refusal as every named method, with a zod
 * schema built outside this package (as a plugin bundle builds its own).
 */
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { API_KEY_HEADER } from '../headers';
import { type ApiConfig, ApiSchemaError, ApiUnauthorizedError } from '../index';
import { createApiClient } from './index';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function harness(responder: () => Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    calls.push({ url: href, init });
    return Promise.resolve(responder());
  });
  const config: ApiConfig = { getToken: () => 'secret-key', fetch: fetchImpl };
  return { client: createApiClient(config), calls };
}

const pluginSchema = z.object({ flag: z.boolean() });

describe('ApiClient.request — a plugin route through the host transport', () => {
  it('sends the auth header, the method and the body, and unwraps { data }', async () => {
    const { client, calls } = harness(() => jsonResponse({ data: { flag: true } }));
    const out = await client.request('/api/synthetic/gates/a%2Fb', pluginSchema, {
      method: 'PUT',
      body: { flag: true },
    });
    expect(out).toEqual({ flag: true });
    expect(calls[0]?.url).toBe('/api/synthetic/gates/a%2Fb');
    expect(calls[0]?.init?.method).toBe('PUT');
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ flag: true }));
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers[API_KEY_HEADER]).toBe('secret-key');
  });

  it('throws ApiUnauthorizedError on a 401', async () => {
    const { client } = harness(() => jsonResponse({ error: 'no' }, 401));
    await expect(client.request('/api/synthetic/x', pluginSchema)).rejects.toBeInstanceOf(
      ApiUnauthorizedError,
    );
  });

  it('throws ApiSchemaError when the body misses the plugin schema', async () => {
    const { client } = harness(() => jsonResponse({ data: { flag: 'yes' } }));
    await expect(client.request('/api/synthetic/x', pluginSchema)).rejects.toBeInstanceOf(
      ApiSchemaError,
    );
  });
});
