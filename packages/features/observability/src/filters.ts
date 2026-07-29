/**
 * The observability filter set lives in the URL search params — the single
 * source of truth is the SDK route contract, so the filter type is DERIVED from
 * `PageProps<'observability'>['search']` rather than re-declared. These helpers
 * project that search state onto the two typed api-client query shapes
 * (`MetricsQuery` for the dashboard, `RunsQuery` for the runs table) and merge
 * partial edits back into a full search object for `navigate`.
 */
import type { PageProps } from '@tai42/studio-sdk';
import type { MetricsQuery, RunsQuery } from '@tai42/api-client';

/** The full observability route search state (tab + drill-in trace + filters). */
export type ObservabilitySearch = PageProps<'observability'>['search'];

export type TabId = 'dashboard' | 'tracing';

/** Time-series bucket size. Not a URL filter — a dashboard-local view control. */
export type Granularity = 'hour' | 'day' | 'week';

export function activeTab(search: ObservabilitySearch): TabId {
  return search.tab ?? 'dashboard';
}

/** The dashboard metrics window. `granularity` is a dashboard-local view choice. */
export function metricsParams(
  search: ObservabilitySearch,
  granularity: Granularity | undefined,
): MetricsQuery {
  return { from: search.from, to: search.to, granularity };
}

/**
 * The runs-table filter set. `page` is supplied per-request by the infinite
 * query, not from the URL, so it is intentionally absent here.
 */
export function runsParams(search: ObservabilitySearch): RunsQuery {
  return {
    from: search.from,
    to: search.to,
    tags: search.tags,
    status: search.status,
    minCost: search.minCost,
    maxCost: search.maxCost,
    minTokens: search.minTokens,
    maxTokens: search.maxTokens,
    minLatencyMs: search.minLatencyMs,
    maxLatencyMs: search.maxLatencyMs,
    sort: search.sort,
    dir: search.dir,
  };
}

/** Merge a partial edit into the current search, dropping keys set to `undefined`. */
export function mergeSearch(
  current: ObservabilitySearch,
  patch: Partial<ObservabilitySearch>,
): ObservabilitySearch {
  const merged: Record<string, unknown> = { ...current, ...patch };
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(merged)) {
    if (merged[key] !== undefined) next[key] = merged[key];
  }
  return next;
}
