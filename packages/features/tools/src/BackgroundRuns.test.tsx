/**
 * Behavioural tests for the background-runs panel:
 *
 *  - the recent-runs list renders status chips (and an empty state);
 *  - an active run is polled to success and renders the typed result;
 *  - polling STOPS the moment the run is terminal (no further GETs);
 *  - the failed and lost states render their distinct surfaces;
 *  - selecting a recent run shows that run's detail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ToolRunListItem, ToolRunRecord } from '@tai42/api-client';

import { BackgroundRuns } from './BackgroundRuns';
import { POLL_INTERVAL_MS } from './backgroundRunsCommon';
import { decorBorderedControls, renderWithProviders, type StubApiClient } from './test-utils';

function listItem(over: Partial<ToolRunListItem> = {}): ToolRunListItem {
  return { run_id: 'r1', tool_name: 'echo', status: 'succeeded', started_at: 't1', ...over };
}

function record(over: Partial<ToolRunRecord> = {}): ToolRunRecord {
  return { run_id: 'r1', tool_name: 'echo', status: 'succeeded', started_at: 't1', ...over };
}

describe('BackgroundRuns — recent list', () => {
  it('renders an empty state when the tool has no background runs', async () => {
    const client: StubApiClient = { listToolRuns: vi.fn().mockResolvedValue([]) };
    renderWithProviders(<BackgroundRuns toolName="echo" />, { client });

    expect(await screen.findByText('No background runs yet')).toBeInTheDocument();
  });

  it('lists recent runs with status chips (newest first, no result field)', async () => {
    const client: StubApiClient = {
      listToolRuns: vi
        .fn()
        .mockResolvedValue([
          listItem({ run_id: 'r2', status: 'running', started_at: 't2' }),
          listItem({ run_id: 'r1', status: 'succeeded', started_at: 't1' }),
        ]),
    };
    renderWithProviders(<BackgroundRuns toolName="echo" />, { client });

    expect(await screen.findByText('r2')).toBeInTheDocument();
    expect(screen.getByText('r1')).toBeInTheDocument();
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('Succeeded')).toBeInTheDocument();
  });

  it('surfaces a loud error state when the list request fails', async () => {
    const client: StubApiClient = {
      listToolRuns: vi.fn().mockRejectedValue(new Error('boom: list failed')),
    };
    renderWithProviders(<BackgroundRuns toolName="echo" />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent('boom: list failed');
  });
  it('draws every run row with the contrast-safe border, never the decorative one', async () => {
    // `tokens.css`: the decorative border sits below 3:1 and may never be a
    // control's only boundary. Derived over the whole rendered panel.
    const client: StubApiClient = { listToolRuns: vi.fn().mockResolvedValue([listItem()]) };
    renderWithProviders(<BackgroundRuns toolName="echo" />, { client });

    await screen.findByText('r1');
    expect(decorBorderedControls(document.body)).toEqual([]);
  });
});

describe('BackgroundRuns — active run detail', () => {
  it('shows the succeeded result through the ResultViewer', async () => {
    const client: StubApiClient = {
      listToolRuns: vi.fn().mockResolvedValue([listItem()]),
      getToolRun: vi
        .fn()
        .mockResolvedValue(
          record({ status: 'succeeded', result: { greeting: 'hi' }, finished_at: 't1b' }),
        ),
    };
    renderWithProviders(<BackgroundRuns toolName="echo" activeRunId="r1" />, { client });

    const detail = await screen.findByTestId('tool-run-detail');
    expect(await within(detail).findByText('greeting:')).toBeInTheDocument();
    expect(within(detail).getByText('"hi"')).toBeInTheDocument();
  });

  it('renders the failed state with the error string', async () => {
    const client: StubApiClient = {
      listToolRuns: vi.fn().mockResolvedValue([listItem({ status: 'failed' })]),
      getToolRun: vi
        .fn()
        .mockResolvedValue(record({ status: 'failed', error: 'kaboom', finished_at: 't1b' })),
    };
    renderWithProviders(<BackgroundRuns toolName="echo" activeRunId="r1" />, { client });

    const detail = await screen.findByTestId('tool-run-detail');
    expect(within(detail).getByRole('alert')).toHaveTextContent('kaboom');
  });

  it('renders the distinct lost explanation', async () => {
    const client: StubApiClient = {
      listToolRuns: vi.fn().mockResolvedValue([listItem({ status: 'lost' })]),
      getToolRun: vi.fn().mockResolvedValue(record({ status: 'lost', finished_at: 't1b' })),
    };
    renderWithProviders(<BackgroundRuns toolName="echo" activeRunId="r1" />, { client });

    const lost = await screen.findByTestId('tool-run-lost');
    expect(lost).toHaveTextContent(/server restarted while this run was executing/i);
  });

  it('selects a recent run and shows its detail on click', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listToolRuns: vi.fn().mockResolvedValue([listItem({ run_id: 'r9', status: 'succeeded' })]),
      getToolRun: vi
        .fn()
        .mockResolvedValue(
          record({ run_id: 'r9', status: 'succeeded', result: 'picked', finished_at: 't1b' }),
        ),
    };
    renderWithProviders(<BackgroundRuns toolName="echo" />, { client });

    await user.click(await screen.findByRole('button', { name: /r9/ }));
    const detail = await screen.findByTestId('tool-run-detail');
    expect(within(detail).getByText('picked')).toBeInTheDocument();
  });
});

describe('BackgroundRuns — polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls a running run to success, then STOPS polling once terminal', async () => {
    const getToolRun = vi
      .fn()
      .mockResolvedValueOnce(record({ status: 'running' }))
      .mockResolvedValue(
        record({ status: 'succeeded', result: { done: true }, finished_at: 't1b' }),
      );
    const client: StubApiClient = {
      listToolRuns: vi.fn().mockResolvedValue([listItem({ status: 'running' })]),
      getToolRun,
    };
    renderWithProviders(<BackgroundRuns toolName="echo" activeRunId="r1" />, { client });

    // First poll resolves to running.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getToolRun).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/polling for the result/i)).toBeInTheDocument();

    // The interval fires the next poll, which resolves to succeeded.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(getToolRun).toHaveBeenCalledTimes(2);
    expect(
      within(screen.getByTestId('tool-run-detail')).getByText('Succeeded'),
    ).toBeInTheDocument();

    // Terminal → refetchInterval is false; further time advances trigger no GETs.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });
    expect(getToolRun).toHaveBeenCalledTimes(2);
  });

  it('re-fetches the recent list while a run is active, then STOPS once all are terminal', async () => {
    const listToolRuns = vi
      .fn()
      .mockResolvedValueOnce([listItem({ status: 'running' })])
      .mockResolvedValue([listItem({ status: 'succeeded' })]);
    const client: StubApiClient = { listToolRuns };
    renderWithProviders(<BackgroundRuns toolName="echo" />, { client });

    // Initial fetch resolves to a still-running run.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(listToolRuns).toHaveBeenCalledTimes(1);

    // A non-terminal entry keeps the list polling: the interval fires the next
    // fetch, which now reports the run as succeeded.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(listToolRuns).toHaveBeenCalledTimes(2);

    // Every listed run is terminal → refetchInterval is false; the list stops
    // polling (no unbounded re-fetch loop).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });
    expect(listToolRuns).toHaveBeenCalledTimes(2);
  });
});
