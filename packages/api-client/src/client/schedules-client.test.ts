/**
 * Transport-level tests for the schedules client methods: `listSchedules`,
 * `getServerDateTime`, `addSchedule`, `deleteSchedule` — URL (+ name encoding),
 * HTTP method, request-body shaping, the `{ data }` envelope unwrap, the typed
 * `ScheduleListRow` listing (a row of another shape is a loud schema error), and the
 * loud 501 mapping the doors emit when no scheduler backend is installed. A fake `fetch` records each request.
 */
import { describe, expect, it, vi } from 'vitest';

import { type ApiConfig, ApiError, ApiSchemaError } from '../index';
import { createApiClient } from './index';

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
  const row = {
    name: 'nightly',
    tool: 'backup',
    cadence: { kind: 'interval', every: 60, relative: false },
    enabled: true,
    next_run_at_ts: null,
    next_run_at_iso: null,
    error: null,
  };

  it('listSchedules GETs /api/schedules and parses the typed rows', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: [row] }));
    const out = await client.listSchedules();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/schedules');
    expect(out).toEqual([row]);
  });

  it('listSchedules refuses a row carrying stored kwargs (a loud schema error)', async () => {
    const { client } = harness(() => jsonResponse({ data: [{ ...row, kwargs: { secret: 'x' } }] }));
    const err = await client.listSchedules().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiSchemaError);
  });

  it('getServerDateTime GETs the server-datetime route and parses utc', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { utc: '2026-07-11T00:00:00Z', system: 'UTC' } }),
    );
    const out = await client.getServerDateTime();
    expect(captured[0]?.url).toBe('/api/schedules/server-datetime');
    expect(out.utc).toBe('2026-07-11T00:00:00Z');
  });

  it('addSchedule POSTs the ScheduleCreate body and passes the opaque result through', async () => {
    const { client, captured } = harness(() =>
      jsonResponse({ data: { name: 'nightly', created: true } }),
    );
    const out = await client.addSchedule({
      tool_name: 'backup',
      tool_kwargs: { sections: ['presets'] },
      cadence: { kind: 'crontab', minute: '0', hour: '0' },
      schedule_name: 'nightly',
    });
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/api/schedules');
    expect(captured[0]?.body).toEqual({
      tool_name: 'backup',
      tool_kwargs: { sections: ['presets'] },
      cadence: { kind: 'crontab', minute: '0', hour: '0' },
      schedule_name: 'nightly',
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
      .addSchedule({ tool_name: 'x', tool_kwargs: {} })
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
