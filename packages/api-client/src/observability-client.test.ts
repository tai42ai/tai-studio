/**
 * Transport-level tests for the observability client methods:
 * `getObservabilityMetrics`, `listRuns`, `getRunTrace`, and the `exportTrace` /
 * `exportRuns` DOWNLOADS — URL, HTTP method, the `{ data }` envelope unwrap, the
 * raw-`Blob` downloads with a LOUD error on a non-2xx (never a silent empty Blob),
 * and the `RunsQuery` → query-string encoding: each filter, pagination, sort, the
 * `JSON.stringify`-ed `tags`, and the omission of unset keys. A fake `fetch`
 * records each request and returns a canned body.
 */
import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './client';
import { ApiError, ApiSchemaError, type ApiConfig, type RunsQuery } from './index';

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
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: urlString(url), method: init?.method ?? 'GET' });
    return responder();
  });
  const config: ApiConfig = { getToken: () => 'k', fetch: fetchImpl };
  return { client: createApiClient(config), captured };
}

/** Parse the captured relative URL's query params (resolved against a dummy base). */
function query(url: string): URLSearchParams {
  return new URL(url, 'http://localhost').searchParams;
}

const metrics = {
  summary: {
    totalRuns: 3,
    totalCost: 0.12,
    totalTokens: 900,
    averageLatencyMs: 42,
    avgCostPerRun: 0.04,
    avgTokensPerRun: 300,
    timeToFirstTokenMs: null,
  },
  timeSeries: [
    { bucket: '2026-07-11T00:00:00Z', runs: 3, cost: 0.12, avgLatencyMs: 42, totalTokens: 900 },
  ],
  byModel: [{ model: 'gpt', calls: 3, cost: 0.12, totalTokens: 900, avgLatencyMs: 42 }],
  granularity: 'day',
};

const runsPage = {
  items: [
    {
      id: 'run_1',
      traceId: 'trace_1',
      createdAt: '2026-07-11T00:00:00Z',
      tags: ['prod'],
      status: 'success',
      cost: 0.04,
      latencyMs: 42,
      totalTokens: 300,
      inputPreview: 'hi',
      outputPreview: 'ok',
    },
  ],
  page: 1,
  nextPage: null,
};

const trace = {
  traceId: 'trace_1',
  timestamp: '2026-07-11T00:00:00Z',
  tags: ['prod'],
  totalCost: 0.04,
  input: 'hi',
  output: 'ok',
  metadata: null,
  spans: [],
};

describe('observability metrics + runs transport', () => {
  it('getObservabilityMetrics GETs the metrics route and encodes the window query', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: metrics }));
    const out = await client.getObservabilityMetrics({
      from: '2026-07-01',
      to: '2026-07-11',
      granularity: 'day',
    });
    const q = query(captured[0]?.url ?? '');
    expect(captured[0]?.url.split('?')[0]).toBe('/api/observability/metrics');
    expect(q.get('from')).toBe('2026-07-01');
    expect(q.get('to')).toBe('2026-07-11');
    expect(q.get('granularity')).toBe('day');
    expect(out.summary.totalRuns).toBe(3);
  });

  it('getObservabilityMetrics omits unset window keys and sends no query when empty', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: metrics }));
    await client.getObservabilityMetrics();
    expect(captured[0]?.url).toBe('/api/observability/metrics');
  });

  it('listRuns GETs the runs route and parses the page', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: runsPage }));
    const out = await client.listRuns();
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/observability/runs');
    expect(out.items[0]?.id).toBe('run_1');
    expect(out.nextPage).toBeNull();
  });

  it('listRuns encodes every filter, JSON-stringifies tags, and preserves pagination/sort', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: runsPage }));
    const params: RunsQuery = {
      from: '2026-07-01',
      to: '2026-07-11',
      tags: ['prod', 'eu'],
      status: 'error',
      minCost: 0.01,
      maxCost: 1,
      minTokens: 10,
      maxTokens: 1000,
      minLatencyMs: 5,
      maxLatencyMs: 500,
      sort: 'cost',
      dir: 'desc',
      page: 2,
      pageSize: 50,
    };
    await client.listRuns(params);
    const q = query(captured[0]?.url ?? '');
    expect(q.get('from')).toBe('2026-07-01');
    expect(q.get('to')).toBe('2026-07-11');
    // tags is JSON-encoded, not repeated params.
    expect(q.get('tags')).toBe('["prod","eu"]');
    expect(q.get('status')).toBe('error');
    expect(q.get('minCost')).toBe('0.01');
    expect(q.get('maxCost')).toBe('1');
    expect(q.get('minTokens')).toBe('10');
    expect(q.get('maxTokens')).toBe('1000');
    expect(q.get('minLatencyMs')).toBe('5');
    expect(q.get('maxLatencyMs')).toBe('500');
    expect(q.get('sort')).toBe('cost');
    expect(q.get('dir')).toBe('desc');
    expect(q.get('page')).toBe('2');
    expect(q.get('pageSize')).toBe('50');
  });

  it('listRuns omits every unset key (a single filter yields exactly that param)', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: runsPage }));
    await client.listRuns({ from: '2026-07-01' });
    const q = query(captured[0]?.url ?? '');
    expect(q.get('from')).toBe('2026-07-01');
    expect([...q.keys()]).toEqual(['from']);
    // An absent tags list is dropped entirely, never sent as an empty JSON array.
    expect(q.has('tags')).toBe(false);
  });

  it('getRunTrace GETs the id-encoded trace route and parses the trace', async () => {
    const { client, captured } = harness(() => jsonResponse({ data: trace }));
    const out = await client.getRunTrace('trace 1');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/observability/runs/trace%201/trace');
    expect(out.traceId).toBe('trace_1');
  });

  it('throws ApiSchemaError LOUDLY on a drifting run row (status not in the enum)', async () => {
    const drifted = { ...runsPage, items: [{ ...runsPage.items[0], status: 'weird' }] };
    const { client } = harness(() => jsonResponse({ data: drifted }));
    await expect(client.listRuns()).rejects.toBeInstanceOf(ApiSchemaError);
  });

  // A `.`/`..`/absolute/empty trace id would be collapsed by the browser URL parser
  // and silently retarget the request, so the id→path encoder rejects it at the
  // client boundary before any request leaves. Both the trace read and the export
  // download inherit the guard.
  it('rejects an unsafe trace id before any request, still encodes a legit one', async () => {
    const rule = /path segment must not be/;
    const { client, captured } = harness(() => jsonResponse({ data: trace }));
    expect(() => client.getRunTrace('..')).toThrow(rule);
    expect(() => client.getRunTrace('.')).toThrow(rule);
    expect(() => client.getRunTrace('')).toThrow(rule);
    expect(() => client.exportTrace('..')).toThrow(rule);
    expect(captured).toHaveLength(0);
    await client.getRunTrace('trace 1');
    expect(captured[0]?.url).toBe('/api/observability/runs/trace%201/trace');
  });
});

describe('observability downloads', () => {
  it('exportTrace GETs the trace-export route and returns the raw Blob', async () => {
    const bytes = new TextEncoder().encode('trace-doc');
    const { client, captured } = harness(
      () => new Response(bytes, { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const blob = await client.exportTrace('trace_1');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url).toBe('/api/observability/runs/trace_1/trace/export');
    expect(blob.type).toBe('application/json');
    expect(await blob.text()).toBe('trace-doc');
  });

  it('exportTrace throws LOUDLY on a non-2xx (no silent empty Blob)', async () => {
    const { client } = harness(() => jsonResponse({ error: 'trace unavailable' }, 404));
    await expect(client.exportTrace('trace_1')).rejects.toBeInstanceOf(ApiError);
  });

  it('exportRuns encodes the filters + format in the query and returns the raw Blob', async () => {
    const bytes = new TextEncoder().encode('id,cost\nrun_1,0.04\n');
    const { client, captured } = harness(
      () => new Response(bytes, { status: 200, headers: { 'content-type': 'text/csv' } }),
    );
    const blob = await client.exportRuns({ tags: ['prod'], status: 'success', format: 'csv' });
    const q = query(captured[0]?.url ?? '');
    expect(captured[0]?.method).toBe('GET');
    expect(captured[0]?.url.split('?')[0]).toBe('/api/observability/runs/export');
    expect(q.get('tags')).toBe('["prod"]');
    expect(q.get('status')).toBe('success');
    expect(q.get('format')).toBe('csv');
    expect(blob.type).toBe('text/csv');
    expect(await blob.text()).toBe('id,cost\nrun_1,0.04\n');
  });

  it('exportRuns throws LOUDLY on a non-2xx (no silent empty Blob)', async () => {
    const { client } = harness(() => jsonResponse({ error: 'export failed' }, 500));
    await expect(client.exportRuns({ format: 'json' })).rejects.toBeInstanceOf(ApiError);
  });
});
