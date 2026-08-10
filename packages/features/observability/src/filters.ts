/**
 * The observability filter set lives in the URL search params — the single
 * source of truth is the SDK route contract, so the filter type is DERIVED from
 * `PageProps<'observability'>['search']` rather than re-declared. These helpers
 * project that search state onto the two typed api-client query shapes
 * (`MetricsQuery` for the dashboard, `RunsQuery` for the runs table) and merge
 * partial edits back into a full search object for `navigate`.
 *
 * They also model the ONE combination the monitoring read contract cannot serve
 * — a metric sort alongside a level/cost/token/latency filter — so a shared or
 * hand-edited URL is repaired to a legal query before it reaches the backend, and
 * the widgets that would create the combo interactively are guarded on both sides.
 */
import type { PageProps, DateRangeValue } from '@tai42/studio-sdk';
import type { MetricsQuery, RunsQuery } from '@tai42/api-client';

/** The full observability route search state (tab + drill-in trace + filters). */
export type ObservabilitySearch = PageProps<'observability'>['search'];

export type TabId = 'dashboard' | 'tracing';

/** A sort key the runs table can carry. */
export type SortKey = NonNullable<ObservabilitySearch['sort']>;

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

// -- metric-sort × filter incompatibility ------------------------------------

/**
 * Sort keys the reader ranks GLOBALLY through the metrics "traces" view. That
 * view has no level/cost/token/latency column, so combining one of these with any
 * such filter is a guaranteed `MonitoringReadNotSupportedError` (501) — not a
 * capability gap in the backend. `createdAt` sorts natively on `timestamp` and
 * combines with everything, so it is deliberately absent here.
 */
export const METRIC_SORT_FIELDS: readonly SortKey[] = ['cost', 'latencyMs', 'totalTokens'];

/**
 * The filter keys a metric sort cannot carry (`status` maps to the reader's
 * `level` column). Time range, tags, and sort direction are always legal.
 */
export const METRIC_INCOMPATIBLE_FILTER_KEYS: readonly (keyof ObservabilitySearch)[] = [
  'status',
  'minCost',
  'maxCost',
  'minTokens',
  'maxTokens',
  'minLatencyMs',
  'maxLatencyMs',
];

/** True when the active sort is a globally-ranked metric sort. */
export function isMetricSort(sort: SortKey | undefined): boolean {
  return sort !== undefined && METRIC_SORT_FIELDS.includes(sort);
}

/** True when any filter a metric sort cannot carry is set. */
export function hasMetricIncompatibleFilter(search: ObservabilitySearch): boolean {
  return METRIC_INCOMPATIBLE_FILTER_KEYS.some((key) => {
    return search[key] !== undefined;
  });
}

/**
 * Repair a metric-sort×filter combo that arrived through the URL (a shared or
 * hand-edited link the widget guard never mediated). The filter set is the more
 * specific expression of intent, so the conflict is repaired by DROPPING the
 * metric sort and its direction — falling back to native timestamp order —
 * rather than silently discarding the operator's filters. A legal search is
 * returned unchanged (same reference), so callers can detect a repair by identity.
 */
export function sanitizeSearch(search: ObservabilitySearch): ObservabilitySearch {
  if (isMetricSort(search.sort) && hasMetricIncompatibleFilter(search)) {
    const { sort: _sort, dir: _dir, ...rest } = search;
    return rest;
  }
  return search;
}

// -- date range ⇄ search window ----------------------------------------------

/** A relative range token the backend resolves against its own clock. */
const RELATIVE_TOKEN = /^(\d+)([hdw])$/;

/** The relative token the picker shows when no window is set (backend default). */
const DEFAULT_RELATIVE_TOKEN = '30d';

/** Whether a string parses to a real instant (the picker renders it via Intl). */
function isValidInstant(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

/**
 * Project the URL window (`from`/`to`) onto the picker's value. An absent `from`
 * mirrors the backend's own `30d` default as a relative preset; a `from` that is a
 * relative token stays relative; a valid ISO `from` is an absolute window. An
 * absolute `from` with no (or a relative) `to` is shown against `now`, which the
 * picker needs as a concrete second end.
 *
 * A `from` that is NEITHER a relative token NOR a parseable instant can only come
 * from a hand-edited URL; the picker cannot represent it and would throw formatting
 * it, so the control falls back to the default window. The raw value is untouched
 * in the search itself and still reaches the backend, which rejects it loudly.
 */
export function searchToRange(
  search: ObservabilitySearch,
  now: () => Date = () => new Date(),
): DateRangeValue {
  const from = search.from;
  if (from === undefined || from === '') {
    return { kind: 'relative', token: DEFAULT_RELATIVE_TOKEN };
  }
  if (RELATIVE_TOKEN.test(from)) {
    return { kind: 'relative', token: from };
  }
  if (!isValidInstant(from)) {
    return { kind: 'relative', token: DEFAULT_RELATIVE_TOKEN };
  }
  const to = search.to;
  const absoluteTo =
    to !== undefined && to !== '' && !RELATIVE_TOKEN.test(to) && isValidInstant(to)
      ? to
      : now().toISOString();
  return { kind: 'absolute', from, to: absoluteTo };
}

/**
 * Project a picker value back onto a search patch. A relative window carries its
 * token in `from` and drops `to` (the backend defaults `to` to now); an absolute
 * window sets both instants.
 */
export function rangeToPatch(value: DateRangeValue): Partial<ObservabilitySearch> {
  if (value.kind === 'relative') {
    return { from: value.token, to: undefined };
  }
  return { from: value.from, to: value.to };
}
