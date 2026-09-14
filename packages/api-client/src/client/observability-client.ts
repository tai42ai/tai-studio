/** Run metrics, listing, trace and export sub-client. */
import * as s from '../schemas';
import { apiDownload, encodeSegment, type RequestOptions } from '../http';
import type { Transport } from './transport';

/** The observability-metrics window + bucket size (GET query params). */
export interface MetricsQuery {
  readonly from?: string;
  readonly to?: string;
  readonly granularity?: string;
}

/**
 * The observability runs filter. List/dict-valued params (`tags`) are
 * JSON-encoded into the query string; scalars are sent verbatim. Shared by
 * `listRuns` and the `exportRuns` download.
 */
export interface RunsQuery {
  readonly from?: string;
  readonly to?: string;
  readonly tags?: string[];
  readonly status?: 'error' | 'success';
  readonly minCost?: number;
  readonly maxCost?: number;
  readonly minTokens?: number;
  readonly maxTokens?: number;
  readonly minLatencyMs?: number;
  readonly maxLatencyMs?: number;
  readonly sort?: string;
  readonly dir?: 'asc' | 'desc';
  readonly page?: number;
  readonly pageSize?: number;
}

/** Flatten a `RunsQuery` to transport params, JSON-encoding the `tags` list. */
function runsQueryToParams(query: RunsQuery): Required<RequestOptions>['query'] {
  return {
    from: query.from,
    to: query.to,
    tags: query.tags === undefined ? undefined : JSON.stringify(query.tags),
    status: query.status,
    minCost: query.minCost,
    maxCost: query.maxCost,
    minTokens: query.minTokens,
    maxTokens: query.maxTokens,
    minLatencyMs: query.minLatencyMs,
    maxLatencyMs: query.maxLatencyMs,
    sort: query.sort,
    dir: query.dir,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export function observabilityClient(t: Transport) {
  const { config, req } = t;
  return {
    // The monitoring-backend dashboard rollups (`GET /api/observability/metrics`),
    // a JSON aggregate distinct from any raw process-metrics text endpoint.
    getObservabilityMetrics: (params: MetricsQuery = {}, signal?: AbortSignal) =>
      req('/api/observability/metrics', s.dashboardMetrics, {
        query: { from: params.from, to: params.to, granularity: params.granularity },
        signal,
      }),
    listRuns: (params: RunsQuery = {}, signal?: AbortSignal) =>
      req('/api/observability/runs', s.runsPage, { query: runsQueryToParams(params), signal }),
    getRunTrace: (traceId: string, signal?: AbortSignal) =>
      req(`/api/observability/runs/${encodeSegment(traceId)}/trace`, s.runTrace, { signal }),
    exportTrace: (traceId: string, signal?: AbortSignal): Promise<Blob> =>
      apiDownload(config, `/api/observability/runs/${encodeSegment(traceId)}/trace/export`, {
        signal,
      }),
    exportRuns: (
      params: RunsQuery & { format: 'csv' | 'json' },
      signal?: AbortSignal,
    ): Promise<Blob> =>
      apiDownload(config, '/api/observability/runs/export', {
        query: { ...runsQueryToParams(params), format: params.format },
        signal,
      }),
  };
}
