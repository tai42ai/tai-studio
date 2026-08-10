/**
 * Transport-level tests for the schedules client methods: `listSchedules`,
 * `getServerDateTime`, `addSchedule`, `deleteSchedule` — URL (+ name encoding),
 * HTTP method, request-body shaping, the `{ data }` envelope unwrap, the
 * passthrough of unknown backend fields, and the loud 501 mapping the doors emit
 * when no scheduler backend is installed. A fake `fetch` records each request.
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

describe('schedules client transport', () => {
  it('listSchedules GETs /api/schedules and passes unknown backend fields through', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({
        data: [{ name: 'nightly', enabled: true, schedule: '0 0 * * *', backend_extra: 42 }],
      }),
    );
    const out = await client.listSchedules();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/schedules');
    expect(out[0]?.name).toBe('nightly');
    // The passthrough schema keeps unknown fields the table forwards untouched.
    expect((out[0] as Record<string, unknown>).backend_extra).toBe(42);
  });

  it('getServerDateTime GETs the server-datetime route and parses utc', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { utc: '2026-07-11T00:00:00Z', system: 'UTC' } }),
    );
    const out = await client.getServerDateTime();
    expect(captured[0]?.url).toBe('/api/schedules/server-datetime');
    expect(out.utc).toBe('2026-07-11T00:00:00Z');
  });

  it('addSchedule POSTs the tool/schedule kwargs body and passes the opaque result through', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'nightly', created: true } }),
    );
    const out = await client.addSchedule({
      tool_name: 'backup',
      tool_kwargs: { sections: ['presets'] },
      schedule_kwargs: { cron: '0 0 * * *' },
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/schedules');
    expect(captured[0]?.body).toEqual({
      tool_name: 'backup',
      tool_kwargs: { sections: ['presets'] },
      schedule_kwargs: { cron: '0 0 * * *' },
    });
    expect(out).toEqual({ name: 'nightly', created: true });
  });

  it('deleteSchedule DELETEs the name-encoded route', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'a b', deleted: true } }),
    );
    const out = await client.deleteSchedule('a b');
    expect(captured[0]?.method).toBe('DELETE');
    expect(captured[0]?.url).toBe('/api/schedules/a%20b');
    expect(out).toEqual({ name: 'a b', deleted: true });
  });

  it('maps a 501 (no scheduler backend installed) to a LOUD ApiError carrying its code', async () => {
    const { client } = harness(() =>
      jsonResponse({ error: 'scheduling is not supported', code: 'scheduling-not-supported' }, 501),
    );
    const err = await client
      .addSchedule({ tool_name: 'x', tool_kwargs: {}, schedule_kwargs: {} })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(501);
    expect((err as ApiError).code).toBe('scheduling-not-supported');
  });

  // A `.`/`..`/absolute/empty schedule name would be collapsed by the browser URL
  // parser and silently retarget the request, so the id→path encoder rejects it at
  // the client boundary before any request leaves.
  it('rejects an unsafe schedule name before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'a b', deleted: true } }),
    );
    expect(() => client.deleteSchedule('..')).toThrow(rule);
    expect(() => client.deleteSchedule('.')).toThrow(rule);
    expect(() => client.deleteSchedule('')).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.deleteSchedule('a b');
    expect(captured[0]?.url).toBe('/api/schedules/a%20b');
  });
});
