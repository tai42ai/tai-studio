/**
 * The per-run trace explorer rendered directly: the query/availability states
 * (loading, 404 → not-available, unavailable, 501, partial + fetchError), the R3
 * two-pane layout (waterfall left, span detail right), auto-selection of the first
 * error span, proportional waterfall bars, structural LLM messages, the usage /
 * metadata panes, escaped payloads, jump-to-error / jump-to-slowest, and the
 * export → download flow.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type RunSpan, type RunTrace } from '@tai42/api-client';

import { TraceView } from './TraceView';
import { renderWithProviders, type StubApiClient } from './test-utils';

afterEach(() => {
  vi.restoreAllMocks();
});

function span(overrides: Partial<RunSpan> & { id: string }): RunSpan {
  return {
    parentId: null,
    traceId: 't1',
    name: overrides.id,
    type: null,
    level: null,
    statusMessage: null,
    start: null,
    end: null,
    model: null,
    usage: null,
    metadata: null,
    input: null,
    output: null,
    nodeId: null,
    ...overrides,
  };
}

/** root(0–3s) → { llm-call GENERATION(0.5–2s), tool-call TOOL/ERROR(2.1–2.9s) } */
function traceFixture(overrides: Partial<RunTrace> = {}): RunTrace {
  return {
    traceId: 't1',
    timestamp: '2026-01-01T00:00:00Z',
    tags: ['alpha', 'beta'],
    totalCost: 0.1,
    input: 'trace-in',
    output: 'trace-out',
    metadata: null,
    availability: 'full',
    fetchError: null,
    spans: [
      span({
        id: 'root',
        name: 'root-chain',
        type: 'chain',
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-01T00:00:03.000Z',
        input: '<script>alert(1)</script>',
      }),
      span({
        id: 'gen',
        parentId: 'root',
        name: 'llm-call',
        type: 'GENERATION',
        model: 'gpt-4o',
        start: '2026-01-01T00:00:00.500Z',
        end: '2026-01-01T00:00:02.000Z',
        usage: { input_tokens: 10, output_tokens: 5 },
        metadata: { temperature: 0.7 },
        input: [{ role: 'user', content: 'ping' }],
        output: 'pong',
      }),
      span({
        id: 'tool',
        parentId: 'root',
        name: 'tool-call',
        type: 'TOOL',
        level: 'ERROR',
        statusMessage: 'boom',
        start: '2026-01-01T00:00:02.100Z',
        end: '2026-01-01T00:00:02.900Z',
        input: { query: 'x' },
        output: 'tool-out',
      }),
    ],
    ...overrides,
  };
}

describe('TraceView', () => {
  it('shows only the back action while the trace is loading', () => {
    const client: StubApiClient = {
      getRunTrace: vi.fn(() => new Promise<RunTrace>(() => undefined)),
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    expect(screen.getByRole('button', { name: 'Back to runs' })).toBeInTheDocument();
    // `←`/`→` are in NO shipped font subset; the icon set carries the mark instead.
    expect(document.body.textContent).not.toMatch(/[←→]/u);
    expect(screen.queryByText('root-chain')).not.toBeInTheDocument();
  });

  it('calls onBack when the back button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
    renderWithProviders(<TraceView traceId="t1" onBack={onBack} />, { client });

    await screen.findByText('root-chain');
    await user.click(screen.getByRole('button', { name: 'Back to runs' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('rolls up the trace into the summary bar (status, duration, leaf-only tokens, cost, spans)', async () => {
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    const summary = await screen.findByTestId('trace-summary');
    // An error span makes the whole trace error.
    expect(within(summary).getByText('error')).toBeInTheDocument();
    expect(within(summary).getByText('3.0s')).toBeInTheDocument();
    expect(within(summary).getByText('$0.100')).toBeInTheDocument();
    // Leaf-only tokens: only the generation leaf's 10+5; the wrapper is not counted.
    expect(within(summary).getByText('15')).toBeInTheDocument();
    // Span count.
    expect(within(summary).getByText('3')).toBeInTheDocument();
    // Trace tags ride along in the summary.
    expect(within(summary).getByText('alpha')).toBeInTheDocument();
  });

  it('renders the waterfall span tree with a proportional bar on the shared axis', async () => {
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await screen.findByText('root-chain');
    // Scope the label assertions to the waterfall rows: the auto-selected error
    // span also titles the detail pane, so its name is present twice on the page.
    const genRow = document.querySelector<HTMLElement>('[data-span-id="gen"]');
    const toolRow = document.querySelector<HTMLElement>('[data-span-id="tool"]');
    if (genRow === null || toolRow === null) throw new Error('the span rows were not rendered');
    expect(within(genRow).getByText('llm-call')).toBeInTheDocument();
    expect(within(toolRow).getByText('tool-call')).toBeInTheDocument();

    // The tool span starts 2.1s into a 3s axis, so its bar's left edge is 70%.
    const bar = toolRow.querySelector<HTMLElement>('div[style*="left:"]');
    expect(bar?.style.left).toBe('70%');
  });

  it('auto-selects the first error span and shows its detail on open', async () => {
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    const detail = await screen.findByTestId('span-detail');
    expect(within(detail).getByRole('heading', { name: 'tool-call' })).toBeInTheDocument();
    expect(within(detail).getByText('error')).toBeInTheDocument();
    expect(within(detail).getByText('boom')).toBeInTheDocument();
    // A tool span labels its payloads Arguments / Result.
    expect(within(detail).getByText('Arguments')).toBeInTheDocument();
    expect(within(detail).getByText('Result')).toBeInTheDocument();
  });

  it('renders a generation span structurally, and its usage + metadata, escaping payloads', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await screen.findByText('llm-call');
    await user.click(screen.getByText('llm-call'));

    const detail = screen.getByTestId('span-detail');
    // The message array renders as role-tagged bubbles, not a raw JSON blob.
    expect(within(detail).getByText('user')).toBeInTheDocument();
    expect(within(detail).getByText('ping')).toBeInTheDocument();
    // usage and metadata each get their own pane (both were previously unrendered).
    expect(within(detail).getByText('Usage')).toBeInTheDocument();
    expect(within(detail).getByText('Metadata')).toBeInTheDocument();
  });

  it('shows a selected span payload as escaped text, never a live element', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await user.click(await screen.findByText('root-chain'));
    const detail = screen.getByTestId('span-detail');
    expect(
      within(detail).getByText((content) => content.includes('<script>alert(1)</script>')),
    ).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('jumps to the slowest non-root span on demand', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await screen.findByText('llm-call');
    // The generation (1.5s) is the longest non-root span; the root (3s) is ignored.
    await user.click(screen.getByRole('button', { name: 'Slowest' }));
    const detail = screen.getByTestId('span-detail');
    expect(within(detail).getByRole('heading', { name: 'llm-call' })).toBeInTheDocument();
  });

  it('filters the span list down to matching names', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await screen.findByText('llm-call');
    await user.type(screen.getByLabelText('Filter spans'), 'llm');
    // Only the matching span survives in the tree; the others drop out.
    expect(screen.getByText('llm-call')).toBeInTheDocument();
    expect(screen.queryByText('root-chain')).not.toBeInTheDocument();
  });

  it('renders a placeholder when the trace has no spans', async () => {
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockResolvedValue(traceFixture({ spans: [] })),
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    expect(await screen.findByText('This trace has no recorded spans.')).toBeInTheDocument();
  });

  it('surfaces a partial-availability trace as a loud banner over the spans it did load', async () => {
    const client: StubApiClient = {
      getRunTrace: vi
        .fn()
        .mockResolvedValue(
          traceFixture({ availability: 'partial', fetchError: 'spans truncated' }),
        ),
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent('spans truncated');
    // The spans that DID load are still shown.
    expect(screen.getByText('root-chain')).toBeInTheDocument();
  });

  it('shows a not-available state for an unavailable trace, never a retry loop', async () => {
    const client: StubApiClient = {
      getRunTrace: vi
        .fn()
        .mockResolvedValue(traceFixture({ availability: 'unavailable', fetchError: 'no detail' })),
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    expect(await screen.findByText('Trace not available')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('renders the read-not-supported state on a 501', async () => {
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockRejectedValue(new ApiError('nope', 501)),
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    expect(await screen.findByTestId('observability-read-not-supported')).toBeInTheDocument();
  });

  it('renders a 404 as a not-available state, never a retry-forever error', async () => {
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockRejectedValue(new ApiError('trace not found', 404)),
    };
    renderWithProviders(<TraceView traceId="missing" onBack={vi.fn()} />, { client });

    expect(await screen.findByText('Trace not available')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('surfaces a non-404/501 failure as a loud, retryable error', async () => {
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockRejectedValue(new ApiError('reader exploded', 500)),
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent('reader exploded');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('exports the trace and streams the blob to a download', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:trace');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const appendChild = vi.spyOn(document.body, 'appendChild');

    const exportTrace = vi.fn().mockResolvedValue(new Blob(['{}'], { type: 'application/json' }));
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockResolvedValue(traceFixture()),
      exportTrace,
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Export trace' }));

    await waitFor(() => {
      expect(exportTrace).toHaveBeenCalledWith('t1');
    });
    const anchor = appendChild.mock.calls
      .map((call) => call[0])
      .find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor?.download).toBe('trace-t1.json');
    expect(anchor?.getAttribute('href')).toBe('blob:trace');
  });

  it('surfaces an export failure loudly and re-enables the button', async () => {
    const user = userEvent.setup();
    const exportTrace = vi.fn().mockRejectedValue(new ApiError('export unavailable', 500));
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockResolvedValue(traceFixture()),
      exportTrace,
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Export trace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('export unavailable');
    expect(screen.getByRole('button', { name: 'Export trace' })).toBeEnabled();
  });
});
