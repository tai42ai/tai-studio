/**
 * Page-level behaviour: the two URL-driven tabs, the metrics params derived from
 * the URL filter set, the stats render, the stats→tracing drill-through (filters
 * preserved), and the two dedicated failure states — the monitoring 501 full-page
 * state and a loud error surface for any other failure (e.g. a zod mismatch).
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, ApiSchemaError, type DashboardMetrics } from '@tai42/api-client';

import { ObservabilityPage } from './ObservabilityPage';
import { renderWithProviders, type StubApiClient } from './test-utils';

function metricsFixture(): DashboardMetrics {
  return {
    summary: {
      totalRuns: 5,
      totalCost: 1.23,
      totalTokens: 4000,
      averageLatencyMs: 850,
      avgCostPerRun: 0.24,
      avgTokensPerRun: 800,
      timeToFirstTokenMs: 120,
    },
    timeSeries: [
      { bucket: '2026-01-01T00:00:00Z', runs: 2, cost: 0.5, avgLatencyMs: 800, totalTokens: 1500 },
      { bucket: '2026-01-02T00:00:00Z', runs: 3, cost: 0.73, avgLatencyMs: 900, totalTokens: 2500 },
    ],
    byModel: [{ model: 'gpt-4o', calls: 4, cost: 1.0, totalTokens: 3000, avgLatencyMs: 850 }],
    granularity: 'day',
  };
}

describe('ObservabilityPage — page header', () => {
  it('renders the "Dashboard" h1 verbatim with the "Observability" eyebrow as a sibling', () => {
    const client: StubApiClient = {
      getObservabilityMetrics: vi.fn().mockResolvedValue(metricsFixture()),
    };
    renderWithProviders(<ObservabilityPage search={{}} />, { client });

    // The e2e-pinned title: exactly one <h1>, its accessible name the title VERBATIM.
    const heading = screen.getByRole('heading', { level: 1, name: 'Dashboard' });
    expect(heading).toBeInTheDocument();
    // The eyebrow is the nav-section label, a SEPARATE element — never folded into
    // the h1's accessible name.
    expect(heading).toHaveTextContent('Dashboard');
    expect(screen.getByText('Observability')).toBeInTheDocument();
  });
});

describe('ObservabilityPage — dashboard tab', () => {
  it('defaults to the dashboard tab and queries metrics with the URL window', async () => {
    const getObservabilityMetrics = vi.fn().mockResolvedValue(metricsFixture());
    const client: StubApiClient = { getObservabilityMetrics };
    renderWithProviders(<ObservabilityPage search={{ from: 'F', to: 'T' }} />, { client });

    await screen.findByText('Total runs');
    expect(getObservabilityMetrics).toHaveBeenCalled();
    const params = getObservabilityMetrics.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params).toMatchObject({ from: 'F', to: 'T', granularity: 'day' });
  });

  it('renders the stat tiles and both charts from the metrics fixture', async () => {
    const client: StubApiClient = {
      getObservabilityMetrics: vi.fn().mockResolvedValue(metricsFixture()),
    };
    renderWithProviders(<ObservabilityPage search={{}} />, { client });

    expect(await screen.findByText('Total runs')).toBeInTheDocument();
    expect(screen.getByText('Total cost')).toBeInTheDocument();
    expect(screen.getByText('Time to first token')).toBeInTheDocument();
    // The inline-SVG trend chart exposes an accessible image role.
    expect(screen.getByRole('img', { name: /over time/i })).toBeInTheDocument();
    // The by-model bar list.
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
  });

  it('hides the time-to-first-token tile when the metric is null', async () => {
    const fixture = metricsFixture();
    const client: StubApiClient = {
      getObservabilityMetrics: vi.fn().mockResolvedValue({
        ...fixture,
        summary: { ...fixture.summary, timeToFirstTokenMs: null },
      }),
    };
    renderWithProviders(<ObservabilityPage search={{}} />, { client });

    await screen.findByText('Total runs');
    expect(screen.queryByText('Time to first token')).not.toBeInTheDocument();
  });

  it('surfaces a loud error state when metrics fail a schema check', async () => {
    const client: StubApiClient = {
      getObservabilityMetrics: vi
        .fn()
        .mockRejectedValue(new ApiSchemaError('/api/observability/metrics', [])),
    };
    renderWithProviders(<ObservabilityPage search={{}} />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /did not match its expected schema/i,
    );
  });

  it('renders the dedicated read-not-supported state on a 501', async () => {
    const client: StubApiClient = {
      getObservabilityMetrics: vi.fn().mockRejectedValue(new ApiError('nope', 501)),
    };
    renderWithProviders(<ObservabilityPage search={{}} />, { client });

    expect(await screen.findByTestId('observability-read-not-supported')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the dedicated state when the pinned code is present (code wins over status)', async () => {
    const client: StubApiClient = {
      getObservabilityMetrics: vi
        .fn()
        .mockRejectedValue(new ApiError('nope', 500, 'monitoring-read-not-supported')),
    };
    renderWithProviders(<ObservabilityPage search={{}} />, { client });

    expect(await screen.findByTestId('observability-read-not-supported')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('ObservabilityPage — tab + drill-through URL writes', () => {
  it('writes the tab to the URL preserving the filter set when a tab is selected', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      getObservabilityMetrics: vi.fn().mockResolvedValue(metricsFixture()),
      listRuns: vi.fn().mockResolvedValue({ items: [], page: 1, nextPage: null }),
    };
    const { navigate } = renderWithProviders(
      <ObservabilityPage search={{ from: 'F', status: 'error' }} />,
      { client },
    );

    await user.click(screen.getByRole('tab', { name: 'Tracing' }));
    expect(navigate).toHaveBeenCalledWith('observability', {
      tab: 'tracing',
      from: 'F',
      status: 'error',
    });
  });

  it('drills through from stats to tracing carrying the current filters', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      getObservabilityMetrics: vi.fn().mockResolvedValue(metricsFixture()),
    };
    const { navigate } = renderWithProviders(
      <ObservabilityPage search={{ from: 'F', minCost: 2 }} />,
      { client },
    );

    await user.click(screen.getByRole('button', { name: 'View runs' }));
    expect(navigate).toHaveBeenCalledWith('observability', {
      tab: 'tracing',
      from: 'F',
      minCost: 2,
    });
  });
});

describe('ObservabilityPage — tracing tab from the URL', () => {
  it('renders the runs tab and queries runs with the URL filter set', async () => {
    const listRuns = vi.fn().mockResolvedValue({ items: [], page: 1, nextPage: null });
    const client: StubApiClient = { listRuns };
    renderWithProviders(
      <ObservabilityPage search={{ tab: 'tracing', status: 'success', minTokens: 10 }} />,
      { client },
    );

    await waitFor(() => {
      expect(listRuns).toHaveBeenCalled();
    });
    const params = listRuns.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params).toMatchObject({ status: 'success', minTokens: 10, page: 1 });
  });
});
