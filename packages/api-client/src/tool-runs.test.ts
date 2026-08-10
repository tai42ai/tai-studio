/**
 * Background tool-runs transport + zod tests.
 *
 * The three methods are driven through the assembled client (the same wiring the
 * shell uses) against a mocked fetch: request shape (path/method/body/query) and
 * `{ data }`-envelope validation are both pinned. The zod schemas are exercised
 * directly for their accept/reject boundaries.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiError, ApiSchemaError } from './errors';
import type { ApiConfig } from './http';
import { toolRunList, toolRunRecord, isTerminalRunStatus } from './tool-runs';

/** A fetch mock whose first arg is always the (string) request URL our transport
 * builds; the cast bridges the narrowed signature to `typeof fetch`. */
type FetchHandler = (url: string, init?: RequestInit) => Response;

function mockFetch(handler: FetchHandler): typeof fetch {
  return vi.fn(async (url: string, init?: RequestInit) =>
    handler(url, init),
  ) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function config(fetchImpl: typeof fetch, token: string | null = 'k'): ApiConfig {
  return { getToken: () => token, fetch: fetchImpl };
}

describe('submitToolRun', () => {
  it('POSTs { tool_name, arguments } and returns the run_id from the envelope', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const api = createApiClient(
      config(
        mockFetch((u, i) => {
          url = u;
          init = i;
          return jsonResponse({ data: { run_id: 'abc123' } }, 202);
        }),
      ),
    );

    const out = await api.submitToolRun({ tool_name: 'alpha', arguments: { x: 2 } });

    expect(out).toEqual({ run_id: 'abc123' });
    expect(url).toContain('/api/tool-runs');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ tool_name: 'alpha', arguments: { x: 2 } });
  });

  it('defaults arguments to {} when omitted', async () => {
    let init: RequestInit | undefined;
    const api = createApiClient(
      config(
        mockFetch((_u, i) => {
          init = i;
          return jsonResponse({ data: { run_id: 'r1' } }, 202);
        }),
      ),
    );
    await api.submitToolRun({ tool_name: 'alpha' });
    expect(JSON.parse(init?.body as string)).toEqual({ tool_name: 'alpha', arguments: {} });
  });
});

describe('getToolRun', () => {
  it('GETs the run record and validates the full shape', async () => {
    let url = '';
    const record = {
      run_id: 'r1',
      tool_name: 'alpha',
      status: 'succeeded',
      started_at: '2026-01-01T00:00:00+00:00',
      finished_at: '2026-01-01T00:00:01+00:00',
      result: { ok: 1 },
    };
    const api = createApiClient(
      config(
        mockFetch((u) => {
          url = u;
          return jsonResponse({ data: record });
        }),
      ),
    );

    const out = await api.getToolRun('r1');
    expect(out).toEqual(record);
    expect(url).toContain('/api/tool-runs/r1');
  });

  it('throws a loud ApiError on a 404 (unknown/expired run)', async () => {
    const api = createApiClient(
      config(mockFetch(() => jsonResponse({ error: "run 'r1' not found" }, 404))),
    );
    await expect(api.getToolRun('r1')).rejects.toBeInstanceOf(ApiError);
  });

  // A `.`/`..`/absolute/empty run id would be collapsed by the browser URL parser
  // and silently retarget the poll at a different route, so the id is rejected at
  // the client boundary before any request leaves.
  it('rejects an unsafe run id before any request, still encodes a legit one', async () => {
    let url = '';
    const record = { run_id: 'r 1', tool_name: 'alpha', status: 'succeeded', started_at: 's' };
    const fetchImpl = mockFetch((u) => {
      url = u;
      return jsonResponse({ data: record });
    });
    const api = createApiClient(config(fetchImpl));
    const rule = /path segment must not be/;
    expect(() => api.getToolRun('..')).toThrow(rule);
    expect(() => api.getToolRun('.')).toThrow(rule);
    expect(() => api.getToolRun('')).toThrow(rule);
    expect(fetchImpl).not.toHaveBeenCalled();
    await api.getToolRun('r 1');
    expect(url).toContain('/api/tool-runs/r%201');
  });
});

describe('listToolRuns', () => {
  it('GETs /api/tool-runs with the tool_name query and validates the list', async () => {
    let url = '';
    const api = createApiClient(
      config(
        mockFetch((u) => {
          url = u;
          return jsonResponse({
            data: [
              { run_id: 'r2', tool_name: 'alpha', status: 'running', started_at: 't2' },
              {
                run_id: 'r1',
                tool_name: 'alpha',
                status: 'succeeded',
                started_at: 't1',
                finished_at: 't1b',
              },
            ],
          });
        }),
      ),
    );

    const out = await api.listToolRuns('alpha');
    expect(out).toHaveLength(2);
    expect(url).toContain('/api/tool-runs?tool_name=alpha');
  });

  it('rejects a list entry that leaks a result/error field via the zod schema', () => {
    // The list schema is deliberately narrow — a result-bearing entry has its
    // unknown keys stripped, so a server drift that leaks secrets into the list
    // cannot reach the UI through this schema.
    const leaked = [
      { run_id: 'r1', tool_name: 'alpha', status: 'succeeded', started_at: 't', result: { s: 1 } },
    ];
    const parsed = toolRunList.parse(leaked);
    expect(parsed).toHaveLength(1);
    expect(Object.keys(parsed[0] ?? {})).not.toContain('result');
  });
});

describe('zod boundaries', () => {
  it('accepts every valid status and rejects an unknown one', () => {
    for (const status of ['running', 'succeeded', 'failed', 'lost']) {
      expect(
        toolRunRecord.safeParse({ run_id: 'r', tool_name: 't', status, started_at: 's' }).success,
      ).toBe(true);
    }
    expect(
      toolRunRecord.safeParse({ run_id: 'r', tool_name: 't', status: 'weird', started_at: 's' })
        .success,
    ).toBe(false);
  });

  it('isTerminalRunStatus is false only for running', () => {
    expect(isTerminalRunStatus('running')).toBe(false);
    expect(isTerminalRunStatus('succeeded')).toBe(true);
    expect(isTerminalRunStatus('failed')).toBe(true);
    expect(isTerminalRunStatus('lost')).toBe(true);
  });
});

describe('envelope guard', () => {
  it('throws ApiSchemaError when the response is not a { data } envelope', async () => {
    const api = createApiClient(config(mockFetch(() => jsonResponse({ nope: true }))));
    await expect(api.getToolRun('r1')).rejects.toBeInstanceOf(ApiSchemaError);
  });
});
