/**
 * Transport-level tests for the backend-identity + fleet client methods:
 * URL/method/body shaping, the envelope unwrap, and one error path each — the
 * identity door's absent sentinel (kept on `/api/backend`), a LOUD `ApiError` on the
 * census door's 500 (never a silent empty fleet), and the fleet-reload door's
 * targeted/whole-fleet bodies against `/api/fleet/*`. A fake `fetch` records each
 * request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiError, type ApiConfig } from './index';

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

describe('backend client transport', () => {
  it('getBackendInfo GETs /api/backend and parses the absent sentinel', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { present: false, backend: null, module: null } }),
    );
    const out = await client.getBackendInfo();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/backend');
    expect(out).toEqual({ present: false, backend: null, module: null });
  });

  it('getBackendInfo parses a present backend identity', async () => {
    const { client } = harness(() =>
      jsonResponse({
        data: { present: true, backend: 'CeleryBackend', module: 'plugin.backend.celery' },
      }),
    );
    const out = await client.getBackendInfo();
    expect(out.present).toBe(true);
    expect(out.backend).toBe('CeleryBackend');
    expect(out.module).toBe('plugin.backend.celery');
  });

  it('listFleetWorkers GETs the fleet route and parses the bus census (every worker kind)', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          workers: [
            {
              name: 'serve-1',
              kind: 'serve',
              pid: 101,
              generation: 3,
              joined_at: '2026-08-08T00:00:00Z',
              beat_at: '2026-08-08T00:00:05Z',
              state: 'ready',
              stale: false,
              last_op: { op: 'reload_config', outcome: 'applied', at: '2026-08-08T00:00:05Z' },
            },
            {
              name: 'backend-2',
              kind: 'backend',
              pid: 202,
              generation: 1,
              joined_at: '2026-08-08T00:00:01Z',
              beat_at: '2026-08-08T00:00:06Z',
              state: 'resyncing',
              stale: false,
              last_op: null,
            },
          ],
        },
      }),
    );
    const out = await client.listFleetWorkers();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/fleet/workers');
    expect(out.workers.map((worker) => worker.name)).toEqual(['serve-1', 'backend-2']);
    expect(out.workers.map((worker) => worker.kind)).toEqual(['serve', 'backend']);
    expect(out.workers.map((worker) => worker.generation)).toEqual([3, 1]);
    expect(out.workers.map((worker) => worker.state)).toEqual(['ready', 'resyncing']);
    // `stale` is read from the server flag, never recomputed from a client threshold.
    expect(out.workers[0]?.stale).toBe(false);
    expect(out.workers[0]?.last_op).toEqual({
      op: 'reload_config',
      outcome: 'applied',
      at: '2026-08-08T00:00:05Z',
    });
    expect(out.workers[1]?.last_op).toBeNull();
  });

  it('listFleetWorkers throws LOUDLY on a 500 census failure (no silent empty fleet)', async () => {
    const { client } = harness(() => jsonResponse({ error: 'presence store unreachable' }, 500));
    await expect(client.listFleetWorkers()).rejects.toBeInstanceOf(ApiError);
  });

  it('reloadFleetConfig POSTs targets: null for a whole-fleet reload and parses the report', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          op: 'reload_config',
          reachable: true,
          local_only: false,
          results: [
            {
              name: 'serve-1',
              outcome: 'applied',
              payload: { status: 'ok', env_keys: 3 },
              error: null,
              detail: null,
            },
          ],
          error: null,
        },
      }),
    );
    const out = await client.reloadFleetConfig(null);
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/fleet/reload-config');
    expect(captured[0]?.body).toEqual({ targets: null });
    expect(out.reachable).toBe(true);
    expect(out.results[0]?.outcome).toBe('applied');
  });

  it('reloadFleetConfig POSTs the selected targets and reports a non-converged worker honestly', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: {
          op: 'reload_config',
          reachable: true,
          local_only: false,
          results: [
            { name: 'serve-1', outcome: 'applied', payload: null, error: null, detail: null },
            {
              name: 'backend-2',
              outcome: 'timed_out',
              payload: null,
              error: null,
              detail: 'no ack within the window',
            },
          ],
          error: null,
        },
      }),
    );
    const out = await client.reloadFleetConfig(['serve-1', 'backend-2']);
    expect(captured[0]?.body).toEqual({ targets: ['serve-1', 'backend-2'] });
    expect(out.results.map((entry) => entry.outcome)).toEqual(['applied', 'timed_out']);
  });

  it('reloadFleetConfig surfaces a raised fleet op LOUDLY (never swallowed)', async () => {
    const { client } = harness(() =>
      jsonResponse({ error: "worker 'backend-c3d4' did not ack" }, 502),
    );
    await expect(client.reloadFleetConfig(null)).rejects.toBeInstanceOf(ApiError);
  });
});
