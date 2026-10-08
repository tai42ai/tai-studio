/** Run metrics, listing, trace and export sub-client. */
import { apiDownload, encodeSegment, type RequestOptions } from '../http';
import * as s from '../schemas';
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
    // What the monitoring backend serves: page ceiling, sorts, sort/filter combinations, metrics.
    getObservabilityCapabilities: (signal?: AbortSignal) =>
      req('/api/observability/capabilities', s.observabilityCapabilities, { signal }),
    getRunTrace: (traceId: string, signal?: AbortSignal) =>
      req(`/api/observability/runs/${encodeSegment(traceId)}/trace`, s.runTrace, { signal }),
    // The run's span tree without span inputs/outputs.
    getRunTraceOutline: (traceId: string, signal?: AbortSignal) =>
      req(`/api/observability/runs/${encodeSegment(traceId)}/trace/outline`, s.runTraceOutline, {
        signal,
      }),
    // One span field with every record reference resolved; `pointer` is an RFC 6901
    // JSON pointer into the field's value (omitted or empty = the whole value).
    getResolvedSpanValue: (
      traceId: string,
      spanId: string,
      field: 'input' | 'output',
      options: { readonly pointer?: string } = {},
      signal?: AbortSignal,
    ) =>
      req(
        `/api/observability/runs/${encodeSegment(traceId)}/spans/${encodeSegment(spanId)}/resolved`,
        s.resolvedSpanValue,
        { query: { field, pointer: options.pointer === '' ? undefined : options.pointer }, signal },
      ),
    exportTrace: (
      traceId: string,
      options: { readonly resolve?: boolean } = {},
      signal?: AbortSignal,
    ): Promise<Blob> =>
      apiDownload(config, `/api/observability/runs/${encodeSegment(traceId)}/trace/export`, {
        query: { resolve: options.resolve ? 'true' : undefined },
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
