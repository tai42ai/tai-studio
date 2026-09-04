/**
 * Transport-level tests for the config client methods: `getEnvConfig`,
 * `setEnvConfig`, `getConfigMode`, `reloadConfig` — URL, HTTP method, request-body
 * shaping, the
 * `{ data }` envelope unwrap, the `read_only` tolerated-absent default, and a LOUD
 * error on a 4xx `{error}` plus an `ApiSchemaError` on a drifting response.
 *
 * env-config is a secret-bearing endpoint EXCLUDED from fixture auto-capture by
 * design; these tests mock the transport only and never touch a live secret.
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

describe('config client transport', () => {
  it('getEnvConfig GETs /api/config/env and parses env + secret_keys', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { env: { APP_TITLE: 'Studio' }, secret_keys: ['API_TOKEN'] } }),
    );
    const out = await client.getEnvConfig();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/config/env');
    expect(out.env).toEqual({ APP_TITLE: 'Studio' });
    expect(out.secret_keys).toEqual(['API_TOKEN']);
  });

  it('setEnvConfig POSTs the raw env map as the body and parses the apply result (reload + fanout)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          status: 'ok',
          env_keys: 2,
          fanout: {
            mode: 'local-only',
            note: 'no worker bus configured; only this worker reloaded',
          },
        },
      }),
    );
    const out = await client.setEnvConfig({ APP_TITLE: 'Studio', API_TOKEN: 'x' });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/config/env');
    // The env record is sent verbatim as the body (not wrapped in a key).
    expect(captured[0]?.body).toEqual({ APP_TITLE: 'Studio', API_TOKEN: 'x' });
    expect(out.status).toBe('ok');
    expect(out.fanout.mode).toBe('local-only');
  });

  it('getConfigMode GETs /api/config/mode and parses config_mode', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { config_mode: 'k8s', read_only: true } }),
    );
    const out = await client.getConfigMode();
    expect(captured[0]?.url).toBe('/api/config/mode');
    expect(out.config_mode).toBe('k8s');
    expect(out.read_only).toBe(true);
  });

  it('getConfigMode defaults read_only to false when the field is absent (the normal case)', async () => {
    const { client } = harness(() => jsonResponse({ data: { config_mode: 'file' } }));
    const out = await client.getConfigMode();
    expect(out.read_only).toBe(false);
  });

  it('reloadConfig POSTs { targets: null } to /api/config/reload and parses the fleet report', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: { op: 'reload_config', reachable: true, local_only: true, results: [], error: null },
      }),
    );
    const out = await client.reloadConfig();
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/config/reload');
    // No targets selected on the settings surface → reload the whole fleet.
    expect(captured[0]?.body).toEqual({ targets: null });
    expect(out.reachable).toBe(true);
    expect(out.results).toEqual([]);
  });

  it('surfaces a 4xx { error } from a rejected config reload as a LOUD ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'reload is admin-only' }, 403));
    await expect(client.reloadConfig()).rejects.toBeInstanceOf(ApiError);
  });

  it('surfaces a 4xx { error } from a rejected env write as a LOUD ApiError', async () => {
    const { client } = harness(() => jsonResponse({ error: 'config backend is read-only' }, 403));
    await expect(client.setEnvConfig({ X: '1' })).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiSchemaError LOUDLY on a drifting env config (secret_keys missing)', async () => {
    const { client } = harness(() => jsonResponse({ data: { env: {} } }));
    await expect(client.getEnvConfig()).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
