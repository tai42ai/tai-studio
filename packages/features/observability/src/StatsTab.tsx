/**
 * Dashboard tab — KPI tiles, a trend chart with a metric switcher, and a
 * by-model breakdown, all sourced from `getObservabilityMetrics(from,to,
 * granularity)`. A "View runs" action drills through to the tracing tab carrying
 * the current filter set in the URL. A 501 from the reader renders the dedicated
 * read-not-supported state; every other failure is a loud, visible error.
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DashboardMetrics } from '@tai42/api-client';
import {
  Button,
  Card,
  DateRangePicker,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
  errorMessage,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';

import { AreaChart, BarList, type AreaPoint, type BarItem } from './charts';
import {
  formatCost,
  formatLatencyMs,
  formatMetricValue,
  formatTimestamp,
  formatTokenCount,
} from './format';
import {
  metricsParams,
  mergeSearch,
  rangeToPatch,
  searchToRange,
  type Granularity,
  type ObservabilitySearch,
} from './filters';
import { metricsKey } from './keys';
import { isReadNotSupported, ReadNotSupported } from './read-support';

type TrendMetric = 'runs' | 'cost' | 'avgLatencyMs' | 'totalTokens';

const TREND_METRICS: readonly { readonly key: TrendMetric; readonly label: string }[] = [
  { key: 'runs', label: 'Runs' },
  { key: 'cost', label: 'Cost' },
  { key: 'avgLatencyMs', label: 'Latency' },
  { key: 'totalTokens', label: 'Tokens' },
];

const GRANULARITIES: readonly { readonly value: Granularity; readonly label: string }[] = [
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
];

function Tile({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <Card>
      <div className="tai-stack tai-stack-2">
        <span className="tai-label">{label}</span>
        <span className="tai-kpi">{value}</span>
      </div>
    </Card>
  );
}

function trendPoints(metrics: DashboardMetrics, metric: TrendMetric): AreaPoint[] {
  return metrics.timeSeries.map((bucket) => ({
    label: formatTimestamp(bucket.bucket),
    value: bucket[metric],
  }));
}

function modelBars(metrics: DashboardMetrics): BarItem[] {
  return metrics.byModel.map((row) => ({
    key: row.model,
    label: row.model,
    value: row.cost,
    caption: `${formatCost(row.cost)} · ${formatTokenCount(row.totalTokens)} tok · ${String(
      row.calls,
    )} calls`,
  }));
}

function Populated({ metrics }: { readonly metrics: DashboardMetrics }): ReactNode {
  const [metric, setMetric] = useState<TrendMetric>('runs');
  const s = metrics.summary;
  const points = trendPoints(metrics, metric);
  const bars = modelBars(metrics);

  return (
    <div className="tai-stack tai-stack-6">
      <div className="tai-grid-cards">
        <Tile label="Total runs" value={formatTokenCount(s.totalRuns)} />
        <Tile label="Total cost" value={formatCost(s.totalCost)} />
        <Tile label="Avg latency" value={formatLatencyMs(s.averageLatencyMs)} />
        <Tile label="Total tokens" value={formatTokenCount(s.totalTokens)} />
        <Tile label="Avg cost / run" value={formatCost(s.avgCostPerRun)} />
        <Tile label="Avg tokens / run" value={formatTokenCount(s.avgTokensPerRun)} />
        {s.timeToFirstTokenMs !== null ? (
          <Tile label="Time to first token" value={formatLatencyMs(s.timeToFirstTokenMs)} />
        ) : null}
      </div>

      <Card>
        <div className="tai-stack">
          <div className="tai-row">
            <h2 className="tai-card-title">Trend</h2>
            <div
              role="group"
              aria-label="Trend metric"
              className="tai-row"
              style={{ marginLeft: 'auto' }}
            >
              {TREND_METRICS.map((m) => (
                <Button
                  key={m.key}
                  variant={m.key === metric ? 'primary' : 'secondary'}
                  aria-pressed={m.key === metric}
                  onClick={() => {
                    setMetric(m.key);
                  }}
                >
                  {m.label}
                </Button>
              ))}
            </div>
          </div>
          {points.length === 0 ? (
            <EmptyState
              title="No time-series data"
              description="No runs fall in this time range."
            />
          ) : (
            <AreaChart
              points={points}
              ariaLabel={`${
                TREND_METRICS.find((m) => m.key === metric)?.label ?? metric
              } over time`}
              formatValue={(value) => formatMetricValue(metric, value)}
            />
          )}
        </div>
      </Card>

      <Card>
        <div className="tai-stack">
          <h2 className="tai-card-title">By model</h2>
          {bars.length === 0 ? (
            <EmptyState title="No per-model breakdown" />
          ) : (
            <BarList items={bars} ariaLabel="Cost by model" />
          )}
        </div>
      </Card>
    </div>
  );
}

export function StatsTab({ search }: { readonly search: ObservabilitySearch }): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const [granularity, setGranularity] = useState<Granularity>('day');
  const params = metricsParams(search, granularity);
  const query = useQuery({
    queryKey: metricsKey(params),
    queryFn: ({ signal }) => api.getObservabilityMetrics(params, signal),
  });

  // The full-page marketplace pitch is only the right answer before metrics have
  // ever loaded; a 501 on a refetch of already-loaded data falls through to the
  // inline error state below rather than blanking the whole dashboard.
  if (query.isError && isReadNotSupported(query.error) && query.data === undefined) {
    return <ReadNotSupported />;
  }

  return (
    <div className="tai-stack tai-stack-6">
      <Card>
        <DateRangePicker
          aria-label="Metrics time range"
          value={searchToRange(search)}
          onValueChange={(value) => {
            navigate('observability', mergeSearch(search, rangeToPatch(value)));
          }}
          disabled={query.isFetching}
        />
      </Card>

      <div className="tai-row">
        <div style={{ width: '10rem' }}>
          <Select
            aria-label="Granularity"
            options={GRANULARITIES.map((g) => ({ value: g.value, label: g.label }))}
            value={granularity}
            onValueChange={(value) => {
              setGranularity(value as Granularity);
            }}
          />
        </div>
        <Button
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            navigate('observability', mergeSearch(search, { tab: 'tracing', trace: undefined }));
          }}
        >
          View runs
        </Button>
      </div>

      {query.isPending ? (
        <div className="tai-stack">
          <Skeleton height={96} />
          <Skeleton height={160} />
        </div>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <Populated metrics={query.data} />
      )}
    </div>
  );
}
