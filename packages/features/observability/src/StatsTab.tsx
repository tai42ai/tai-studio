/**
 * Dashboard tab — KPI tiles, a trend chart with a metric switcher, and a
 * by-model breakdown, all sourced from `getObservabilityMetrics(from,to,
 * granularity)`. A "View runs" action drills through to the tracing tab carrying
 * the current filter set in the URL. A 501 from the reader renders the dedicated
 * read-not-supported state; every other failure is a loud, visible error.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DashboardMetrics } from '@tai42/api-client';
import {
  Button,
  Card,
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
import { metricsParams, mergeSearch, type Granularity, type ObservabilitySearch } from './filters';
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

const tileGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(11rem, 1fr))',
  gap: 'var(--tai-space-4)',
};

function Tile({ label, value }: { readonly label: string; readonly value: string }): ReactNode {
  return (
    <Card>
      <p
        style={{ margin: 0, color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 'var(--tai-space-1) 0 0',
          fontSize: 'var(--tai-text-lg)',
          fontWeight: 600,
          color: 'var(--tai-color-text)',
        }}
      >
        {value}
      </p>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
      <div style={tileGridStyle}>
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--tai-space-3)',
            marginBottom: 'var(--tai-space-4)',
            flexWrap: 'wrap',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 'var(--tai-text-lg)' }}>Trend</h2>
          <div
            role="group"
            aria-label="Trend metric"
            style={{ display: 'flex', gap: 'var(--tai-space-1)' }}
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
          <EmptyState title="No time-series data" description="No runs fall in this time range." />
        ) : (
          <AreaChart
            points={points}
            ariaLabel={`${TREND_METRICS.find((m) => m.key === metric)?.label ?? metric} over time`}
            formatValue={(value) => formatMetricValue(metric, value)}
          />
        )}
      </Card>

      <Card>
        <h2 style={{ margin: '0 0 var(--tai-space-4)', fontSize: 'var(--tai-text-lg)' }}>
          By model
        </h2>
        {bars.length === 0 ? (
          <EmptyState title="No per-model breakdown" />
        ) : (
          <BarList items={bars} ariaLabel="Cost by model" />
        )}
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

  if (query.isError && isReadNotSupported(query.error)) {
    return <ReadNotSupported />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-3)',
          flexWrap: 'wrap',
        }}
      >
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
          onClick={() => {
            navigate('observability', mergeSearch(search, { tab: 'tracing', trace: undefined }));
          }}
        >
          View runs
        </Button>
      </div>

      {query.isPending ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
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
