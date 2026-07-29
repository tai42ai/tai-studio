/**
 * The dashboard tab rendered directly: the KPI tiles and their exact formatting,
 * the metric switcher driving the trend chart's accessible summary, the
 * granularity control and window feeding the metrics query, the drill-through to
 * the runs tab, the empty/loading states, and the 501 and loud-error paths.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type DashboardMetrics } from '@tai42/api-client';

import { StatsTab } from './StatsTab';
import { renderWithProviders, type StubApiClient } from './test-utils';

function metricsFixture(overrides: Partial<DashboardMetrics> = {}): DashboardMetrics {
  return {
    summary: {
      totalRuns: 1234,
      totalCost: 12.4,
      totalTokens: 5678,
      averageLatencyMs: 1500,
      avgCostPerRun: 0.0042,
      avgTokensPerRun: 42,
      timeToFirstTokenMs: null,
    },
    timeSeries: [
      { bucket: '2026-01-01T00:00:00Z', runs: 3, cost: 0.5, avgLatencyMs: 900, totalTokens: 1000 },
      { bucket: '2026-01-02T00:00:00Z', runs: 5, cost: 1.2, avgLatencyMs: 800, totalTokens: 2000 },
    ],
    byModel: [{ model: 'gpt-4o', calls: 3, cost: 1.2, totalTokens: 2000, avgLatencyMs: 800 }],
    granularity: 'day',
    ...overrides,
  };
}

describe('StatsTab', () => {
  it('shows the drill-through action while the metrics are loading', () => {
    const client: StubApiClient = {
      getObservabilityMetrics: vi.fn(() => new Promise<DashboardMetrics>(() => undefined)),
    };
    renderWithProviders(<StatsTab search={{ tab: 'dashboard' }} />, { client });

    expect(screen.getByRole('button', { name: 'View runs' })).toBeInTheDocument();
    expect(screen.queryByText('Total runs')).not.toBeInTheDocument();
  });

  it('queries the metrics with the search window and the default day granularity', async () => {
    const getObservabilityMetrics = vi.fn().mockResolvedValue(metricsFixture());
    const client: StubApiClient = { getObservabilityMetrics };
    renderWithProviders(
      <StatsTab search={{ tab: 'dashboard', from: '2026-01-01', to: '2026-02-01' }} />,
      { client },
    );

    await screen.findByText('Total runs');
    expect(getObservabilityMetrics).toHaveBeenCalledWith(
      { from: '2026-01-01', to: '2026-02-01', granularity: 'day' },
      expect.anything(),
    );
  });

  it('renders the KPI tiles with null-safe formatting, omitting the TTFT tile when null', async () => {
    const client: StubApiClient = {
      getObservabilityMetrics: vi.fn().mockResolvedValue(metricsFixture()),
    };
    renderWithProviders(<StatsTab search={{ tab: 'dashboard' }} />, { client });

    expect(await screen.findByText('$12.40')).toBeInTheDocument();
    expect(screen.getByText('1.5s')).toBeInTheDocument();
    expect(screen.getByText('$0.0042')).toBeInTheDocument();
    expect(screen.getByText((1234).toLocaleString())).toBeInTheDocument();
    expect(screen.queryByText('Time to first token')).not.toBeInTheDocument();
  });

  it('renders the time-to-first-token tile when the metric is present', async () => {
    const client: StubApiClient = {
      getObservabilityMetrics: vi
        .fn()
        .mockResolvedValue(
          metricsFixture({ summary: { ...metricsFixture().summary, timeToFirstTokenMs: 250 } }),
        ),
    };
    renderWithProviders(<StatsTab search={{ tab: 'dashboard' }} />, { client });

    expect(await screen.findByText('Time to first token')).toBeInTheDocument();
    expect(screen.getByText('250ms')).toBeInTheDocument();
  });

  it('switches the trend chart metric, updating its accessible summary', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      getObservabilityMetrics: vi.fn().mockResolvedValue(metricsFixture()),
    };
    renderWithProviders(<StatsTab search={{ tab: 'dashboard' }} />, { client });

    // Defaults to Runs: latest bucket has 5 runs.
    const chart = await screen.findByRole('img');
    expect(chart).toHaveAttribute('aria-label', `Runs over time. Latest ${(5).toLocaleString()}.`);
    expect(screen.getByRole('button', { name: 'Runs' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Cost' }));

    expect(screen.getByRole('button', { name: 'Cost' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'Cost over time. Latest $1.20.');
  });

  it('re-queries with a new granularity when the control changes', async () => {
    const user = userEvent.setup();
    const getObservabilityMetrics = vi.fn().mockResolvedValue(metricsFixture());
    const client: StubApiClient = { getObservabilityMetrics };
    renderWithProviders(<StatsTab search={{ tab: 'dashboard' }} />, { client });

    await screen.findByText('Total runs');
    await user.click(screen.getByRole('combobox', { name: 'Granularity' }));
    await user.click(await screen.findByRole('option', { name: 'Hourly' }));

    await waitFor(() => {
      expect(getObservabilityMetrics).toHaveBeenCalledWith(
        expect.objectContaining({ granularity: 'hour' }),
        expect.anything(),
      );
    });
  });

  it('drills through to the runs tab, carrying the filters and clearing any trace', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      getObservabilityMetrics: vi.fn().mockResolvedValue(metricsFixture()),
    };
    const { navigate } = renderWithProviders(
      <StatsTab search={{ tab: 'dashboard', status: 'error' }} />,
      { client },
    );

    await user.click(screen.getByRole('button', { name: 'View runs' }));
    expect(navigate).toHaveBeenCalledWith('observability', { tab: 'tracing', status: 'error' });
  });

  it('shows empty states when there is no time-series or per-model data', async () => {
    const client: StubApiClient = {
      getObservabilityMetrics: vi
        .fn()
        .mockResolvedValue(metricsFixture({ timeSeries: [], byModel: [] })),
    };
    renderWithProviders(<StatsTab search={{ tab: 'dashboard' }} />, { client });

    expect(await screen.findByText('No time-series data')).toBeInTheDocument();
    expect(screen.getByText('No per-model breakdown')).toBeInTheDocument();
  });

  it('renders the read-not-supported state on a 501', async () => {
    const client: StubApiClient = {
      getObservabilityMetrics: vi.fn().mockRejectedValue(new ApiError('nope', 501)),
    };
    renderWithProviders(<StatsTab search={{ tab: 'dashboard' }} />, { client });

    expect(await screen.findByTestId('observability-read-not-supported')).toBeInTheDocument();
  });

  it('surfaces a non-501 failure loudly and refetches on retry', async () => {
    const user = userEvent.setup();
    const getObservabilityMetrics = vi.fn().mockRejectedValue(new ApiError('metrics down', 500));
    const client: StubApiClient = { getObservabilityMetrics };
    renderWithProviders(<StatsTab search={{ tab: 'dashboard' }} />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent('metrics down');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(getObservabilityMetrics).toHaveBeenCalledTimes(2);
    });
  });
});
