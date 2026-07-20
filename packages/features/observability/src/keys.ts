/**
 * TanStack Query keys for the observability surfaces. Each key embeds the exact
 * params it queries with, so a filter/tab/granularity change is a new cache entry
 * (and a re-fetch) rather than a stale render.
 */
import type { MetricsQuery, RunsQuery } from '@tai42/api-client';

export const metricsKey = (params: MetricsQuery) => ['observability', 'metrics', params] as const;

export const runsKey = (params: RunsQuery) => ['observability', 'runs', params] as const;

export const traceKey = (traceId: string) => ['observability', 'trace', traceId] as const;
