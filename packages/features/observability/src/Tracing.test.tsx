/**
 * Tracing-tab behaviour: the runs table + pagination, sort-header and filter URL
 * writes, the row drill-in to the per-run trace, the trace tree render with XSS
 * escaping pinned, a surfaced 404, the two export actions, and the runs pane's
 * keyboard reachability once it outruns its column.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { flushResizeObservers, setElementOverflow } from '@tai42/studio-sdk/testing';
import { ApiError, type Run, type RunTrace } from '@tai42/api-client';

import { ObservabilityPage } from './ObservabilityPage';
import { renderWithProviders, type StubApiClient } from './test-utils';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Silence the export download's anchor click: jsdom would otherwise log
 * "Not implemented: navigation" for the `<a>` click, drowning real failures. The
 * export tests here assert the api call; the object-URL download wiring lives in
 * the SDK's `downloadBlob` and is covered by its own test and TraceView.test.tsx.
 */
function stubAnchorDownload(): void {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
}

function run(id: string, traceId: string): Run {
  return {
    id,
    traceId,
    createdAt: '2026-01-01T00:00:00Z',
    tags: ['alpha'],
    status: 'success',
    cost: 0.1,
    latencyMs: 500,
    totalTokens: 100,
    model: 'gpt-4o',
    inputPreview: `input-${id}`,
    outputPreview: `output-${id}`,
    fetchError: null,
  };
}

function traceFixture(): RunTrace {
  return {
    traceId: 't1',
    timestamp: '2026-01-01T00:00:00Z',
    tags: ['alpha'],
    totalCost: 0.1,
    input: 'trace-in',
    output: 'trace-out',
    metadata: null,
    availability: 'full',
    fetchError: null,
    spans: [
      {
        id: 's1',
        parentId: null,
        traceId: 't1',
        name: 'root-span',
        type: 'llm',
        level: 'DEFAULT',
        statusMessage: null,
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-01T00:00:01.000Z',
        model: 'gpt-4o',
        usage: null,
        metadata: null,
        input: '<script>alert(1)</script>',
        output: 'ok',
        nodeId: null,
      },
      {
        id: 's2',
        parentId: 's1',
        traceId: 't1',
        name: 'child-span',
        type: 'tool',
        level: 'ERROR',
        statusMessage: 'boom',
        start: null,
        end: null,
        model: null,
        usage: null,
        metadata: null,
        input: 'child-in',
        output: 'child-out',
        nodeId: null,
      },
    ],
  };
}

describe('TracingTab — runs table', () => {
  it('renders rows and loads the next page', async () => {
    const user = userEvent.setup();
    const listRuns = vi
      .fn()
      .mockImplementation((params: { page?: number }) =>
        params.page === 2
          ? Promise.resolve({ items: [run('r2', 't2')], page: 2, nextPage: null })
          : Promise.resolve({ items: [run('r1', 't1')], page: 1, nextPage: 2 }),
      );
    const client: StubApiClient = { listRuns };
    renderWithProviders(<ObservabilityPage search={{ tab: 'tracing' }} />, { client });

    expect(await screen.findByTestId('run-row-r1')).toBeInTheDocument();
    expect(screen.queryByTestId('run-row-r2')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByTestId('run-row-r2')).toBeInTheDocument();
    expect(listRuns).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }), expect.anything());
  });

  it('keeps the loaded table when a LOAD-MORE fails, and offers its own retry', async () => {
    // query-core 5 sets `status: "error"` on ANY fetch error, data present or not.
    // Reading `isError` for "the initial load failed" therefore threw away a fully
    // loaded table the moment a second page failed.
    const user = userEvent.setup();
    const listRuns = vi
      .fn()
      .mockImplementation((params: { page?: number }) =>
        params.page === 2
          ? Promise.reject(new ApiError('page two exploded', 500))
          : Promise.resolve({ items: [run('r1', 't1')], page: 1, nextPage: 2 }),
      );
    renderWithProviders(<ObservabilityPage search={{ tab: 'tracing' }} />, {
      client: { listRuns },
    });

    expect(await screen.findByTestId('run-row-r1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load more runs: page two exploded');
    // The retained page is still on screen — never blanked by the paging failure.
    expect(screen.getByTestId('run-row-r1')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    // The failure gets its own retry by the control, not a whole-table reload.
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('keeps the loaded table when a BACKGROUND REFETCH fails, and says so above it', async () => {
    let call = 0;
    const listRuns = vi.fn().mockImplementation(() => {
      call += 1;
      return call === 1
        ? Promise.resolve({ items: [run('r1', 't1')], page: 1, nextPage: null })
        : Promise.reject(new ApiError('refresh exploded', 503));
    });
    const { queryClient } = renderWithProviders(<ObservabilityPage search={{ tab: 'tracing' }} />, {
      client: { listRuns },
    });

    expect(await screen.findByTestId('run-row-r1')).toBeInTheDocument();
    // The same query key refetched with pages retained — what a window-focus
    // refetch does at runtime.
    await act(async () => {
      await queryClient.refetchQueries();
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not refresh runs: refresh exploded');
    expect(screen.getByTestId('run-row-r1')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('drills into a trace preserving filters when a row is clicked', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listRuns: vi.fn().mockResolvedValue({ items: [run('r1', 't1')], page: 1, nextPage: null }),
    };
    const { navigate } = renderWithProviders(
      <ObservabilityPage search={{ tab: 'tracing', status: 'success' }} />,
      { client },
    );

    await user.click(await screen.findByTestId('run-row-r1'));
    expect(navigate).toHaveBeenCalledWith('observability', {
      tab: 'tracing',
      status: 'success',
      trace: 't1',
    });
  });

  it('writes sort + direction to the URL when a sortable header is clicked', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listRuns: vi.fn().mockResolvedValue({ items: [run('r1', 't1')], page: 1, nextPage: null }),
    };
    const { navigate } = renderWithProviders(<ObservabilityPage search={{ tab: 'tracing' }} />, {
      client,
    });

    await screen.findByTestId('run-row-r1');
    await user.click(screen.getByRole('button', { name: /When/ }));
    expect(navigate).toHaveBeenCalledWith('observability', {
      tab: 'tracing',
      sort: 'createdAt',
      dir: 'desc',
    });
  });

  it('writes filter edits to the URL on apply', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listRuns: vi.fn().mockResolvedValue({ items: [run('r1', 't1')], page: 1, nextPage: null }),
    };
    const { navigate } = renderWithProviders(<ObservabilityPage search={{ tab: 'tracing' }} />, {
      client,
    });

    await screen.findByTestId('run-row-r1');
    const minCost = screen.getByLabelText('Min cost');
    await user.type(minCost, '5');
    await user.click(screen.getByRole('button', { name: 'Apply filters' }));

    expect(navigate).toHaveBeenCalledWith('observability', { tab: 'tracing', minCost: 5 });
  });

  it('exports the runs as CSV with the active filters', async () => {
    const user = userEvent.setup();
    stubAnchorDownload();
    const exportRuns = vi.fn().mockResolvedValue(new Blob(['csv']));
    const client: StubApiClient = {
      listRuns: vi.fn().mockResolvedValue({ items: [run('r1', 't1')], page: 1, nextPage: null }),
      exportRuns,
    };
    renderWithProviders(<ObservabilityPage search={{ tab: 'tracing', status: 'error' }} />, {
      client,
    });

    await screen.findByTestId('run-row-r1');
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));

    await waitFor(() => {
      expect(exportRuns).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error', format: 'csv' }),
      );
    });
  });

  it('renders the read-not-supported state on a 501 from the runs query', async () => {
    const client: StubApiClient = {
      listRuns: vi.fn().mockRejectedValue(new ApiError('nope', 501)),
    };
    renderWithProviders(<ObservabilityPage search={{ tab: 'tracing' }} />, { client });

    expect(await screen.findByTestId('observability-read-not-supported')).toBeInTheDocument();
  });
});

describe('TracingTab — trace view', () => {
  it('renders the nested span tree and escapes span payloads', async () => {
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockResolvedValue(traceFixture()),
    };
    renderWithProviders(<ObservabilityPage search={{ tab: 'tracing', trace: 't1' }} />, { client });

    expect(await screen.findByText('root-span')).toBeInTheDocument();
    expect(screen.getByText('child-span')).toBeInTheDocument();

    // The <script> payload is rendered as literal text (JsonTree), never as a
    // live element — the XSS discipline.
    const escaped = screen.getByText((content) => content.includes('<script>alert(1)</script>'));
    expect(escaped).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('renders the read-not-supported state on a 501 from the trace query (deep link)', async () => {
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockRejectedValue(new ApiError('nope', 501)),
    };
    renderWithProviders(<ObservabilityPage search={{ tab: 'tracing', trace: 't1' }} />, { client });

    expect(await screen.findByTestId('observability-read-not-supported')).toBeInTheDocument();
  });

  it('surfaces a 404 trace as a loud error', async () => {
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockRejectedValue(new ApiError('trace not found', 404)),
    };
    renderWithProviders(<ObservabilityPage search={{ tab: 'tracing', trace: 'missing' }} />, {
      client,
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('trace not found');
  });

  it('exports the trace and returns to the runs list on back', async () => {
    const user = userEvent.setup();
    stubAnchorDownload();
    const exportTrace = vi.fn().mockResolvedValue(new Blob(['{}']));
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockResolvedValue(traceFixture()),
      exportTrace,
    };
    const { navigate } = renderWithProviders(
      <ObservabilityPage search={{ tab: 'tracing', trace: 't1', status: 'success' }} />,
      { client },
    );

    await user.click(await screen.findByRole('button', { name: 'Export trace' }));
    await waitFor(() => {
      expect(exportTrace).toHaveBeenCalledWith('t1');
    });

    await user.click(screen.getByRole('button', { name: '← Back to runs' }));
    expect(navigate).toHaveBeenCalledWith('observability', { tab: 'tracing', status: 'success' });
  });
});

describe('TracingTab — the runs pane is reachable without a pointer', () => {
  it('names the pane holding the runs table, and only while it actually scrolls', async () => {
    const client: StubApiClient = {
      listRuns: vi.fn().mockResolvedValue({ items: [run('r1', 't1')], page: 1, nextPage: null }),
    };
    renderWithProviders(<ObservabilityPage search={{ tab: 'tracing' }} />, { client });

    await screen.findByTestId('run-row-r1');
    // Located through the table it holds, so this fails on a pane that nothing
    // measures rather than on a renamed class.
    const pane = screen.getByRole('table').parentElement;
    if (pane === null) throw new Error('the runs table has no containing pane');

    setElementOverflow(pane, false);
    act(() => {
      flushResizeObservers();
    });
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(pane).not.toHaveAttribute('tabindex');

    setElementOverflow(pane, true);
    act(() => {
      flushResizeObservers();
    });
    expect(screen.getByRole('region', { name: 'Runs' })).toBe(pane);
    expect(pane).toHaveAttribute('tabindex', '0');
  });
});
