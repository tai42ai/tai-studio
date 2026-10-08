/**
 * The per-run trace explorer rendered directly: the query states
 * (loading, 404 → not-available, 501, no-spans placeholder), the
 * two-pane layout (waterfall left, span detail right), auto-selection of the first
 * error span, proportional waterfall bars, the body and bar chosen by the span's
 * neutral kind, structural LLM messages, the token cell, the metadata pane, escaped
 * payloads, jump-to-error / jump-to-slowest, and the export / resolved-export
 * downloads.
 */
import { ApiError, type RunSpan, type RunTrace } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, type StubApiClient } from './test-utils';
import { TraceView } from './TraceView';

afterEach(() => {
  vi.restoreAllMocks();
});

function span(overrides: Partial<RunSpan> & { id: string }): RunSpan {
  return {
    parentId: null,
    traceId: 't1',
    name: overrides.id,
    kind: null,
    level: null,
    statusMessage: null,
    start: null,
    end: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    metadata: null,
    input: null,
    output: null,
    ...overrides,
  };
}

/** root(0–3s) → { llm-call LLM(0.5–2s), tool-call TOOL/ERROR(2.1–2.9s) } */
function traceFixture(overrides: Partial<RunTrace> = {}): RunTrace {
  return {
    traceId: 't1',
    timestamp: '2026-01-01T00:00:00Z',
    tags: ['alpha', 'beta'],
    totalCost: 0.1,
    input: 'trace-in',
    output: 'trace-out',
    metadata: null,
    spans: [
      span({
        id: 'root',
        name: 'root-chain',
        kind: 'CHAIN',
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-01-01T00:00:03.000Z',
        input: '<script>alert(1)</script>',
      }),
      span({
        id: 'gen',
        parentId: 'root',
        name: 'llm-call',
        kind: 'LLM',
        model: 'gpt-4o',
        start: '2026-01-01T00:00:00.500Z',
        end: '2026-01-01T00:00:02.000Z',
        inputTokens: 1204,
        outputTokens: 96,
        metadata: { temperature: 0.7 },
        input: [{ role: 'user', parts: [{ type: 'text', content: 'ping' }] }],
        output: [
          {
            role: 'assistant',
            parts: [{ type: 'text', content: 'pong' }],
            finish_reason: 'stop',
          },
        ],
      }),
      span({
        id: 'tool',
        parentId: 'root',
        name: 'tool-call',
        kind: 'TOOL',
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
    // Leaf-only tokens: only the LLM leaf's 1,204 + 96; the wrapper is not counted.
    expect(within(summary).getByText('1,300')).toBeInTheDocument();
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

  it('renders an LLM span structurally, with its token cell and metadata', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await screen.findByText('llm-call');
    await user.click(screen.getByText('llm-call'));

    const detail = screen.getByTestId('span-detail');
    // The message array renders as role-tagged bubbles, not a raw JSON blob.
    expect(within(detail).getByText('user')).toBeInTheDocument();
    expect(within(detail).getByText('ping')).toBeInTheDocument();
    expect(within(detail).getByText('finish: stop')).toBeInTheDocument();
    // Both counts reported: the header shows them side by side.
    expect(within(detail).getByText('1,204 in · 96 out')).toBeInTheDocument();
    expect(within(detail).getByText('Metadata')).toBeInTheDocument();
  });

  it('chooses the body by the span kind and shows a dash for absent tokens', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    // A CHAIN span shows Input / Output and a dash for its absent tokens.
    await user.click(await screen.findByText('root-chain'));
    const detail = screen.getByTestId('span-detail');
    expect(within(detail).getByText('CHAIN')).toBeInTheDocument();
    expect(within(detail).getByText('Input')).toBeInTheDocument();
    expect(within(detail).getByText('—')).toBeInTheDocument();
  });

  it('colours each bar by the span kind, and shows a lone total as the token cell', async () => {
    const user = userEvent.setup();
    const at = (seconds: number): string =>
      new Date(Date.UTC(2026, 0, 1, 0, 0, seconds)).toISOString();
    const trace = traceFixture({
      spans: [
        span({ id: 'root', name: 'root-chain', kind: 'CHAIN', start: at(0), end: at(10) }),
        span({
          id: 'gen',
          parentId: 'root',
          name: 'model-step',
          kind: 'LLM',
          totalTokens: 42,
          start: at(0),
          end: at(1),
        }),
        span({
          id: 'tool',
          parentId: 'root',
          name: 'tool-step',
          kind: 'TOOL',
          start: at(1),
          end: at(2),
        }),
        span({
          id: 'slow',
          parentId: 'root',
          name: 'slow-step',
          kind: 'CHAIN',
          start: at(2),
          end: at(9),
        }),
        span({
          id: 'quick',
          parentId: 'root',
          name: 'quick-step',
          kind: 'EVENT',
          start: at(9),
          end: at(9),
        }),
      ],
    });
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(trace) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await screen.findByText('model-step');
    const bar = (id: string): string | undefined =>
      document.querySelector<HTMLElement>(`[data-span-id="${id}"] div[style*="left:"]`)?.style
        .background;
    expect(bar('gen')).toBe('var(--tai-color-accent)');
    expect(bar('tool')).toBe('var(--tai-color-primary)');
    expect(bar('quick')).toBe('var(--tai-color-border-strong)');

    await user.click(screen.getByText('model-step'));
    expect(within(screen.getByTestId('span-detail')).getByText('42 tokens')).toBeInTheDocument();
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

  it('hides DEBUG spans from the tree by default and reveals them via Show debug', async () => {
    const user = userEvent.setup();
    const withDebug = traceFixture({
      spans: [
        ...traceFixture().spans,
        span({
          id: 'waiting',
          parentId: 'root',
          name: 'fan-in-standdown',
          level: 'DEBUG',
          start: '2026-01-01T00:00:01.000Z',
          end: '2026-01-01T00:00:01.000Z',
        }),
      ],
    });
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(withDebug) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await screen.findByText('root-chain');
    // The phantom DEBUG span is absent from the default waterfall.
    expect(document.querySelector('[data-span-id="waiting"]')).toBeNull();
    expect(screen.queryByText('fan-in-standdown')).not.toBeInTheDocument();

    // Toggling "Show debug" on reveals it; the real spans are unaffected.
    await user.click(screen.getByRole('checkbox', { name: 'Show debug' }));
    expect(document.querySelector('[data-span-id="waiting"]')).not.toBeNull();
    expect(screen.getByText('fan-in-standdown')).toBeInTheDocument();
    expect(document.querySelector('[data-span-id="gen"]')).not.toBeNull();
  });

  it('re-parents a DEBUG span’s child to its parent instead of dropping the subtree', async () => {
    const nested = traceFixture({
      spans: [
        ...traceFixture().spans,
        span({ id: 'debug-wrap', parentId: 'root', name: 'standdown', level: 'DEBUG' }),
        span({ id: 'real-child', parentId: 'debug-wrap', name: 'kept-child' }),
      ],
    });
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(nested) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await screen.findByText('root-chain');
    // The debug wrapper is hidden, but its child survives re-parented under root.
    expect(document.querySelector('[data-span-id="debug-wrap"]')).toBeNull();
    const child = document.querySelector<HTMLElement>('[data-span-id="real-child"]');
    if (child === null) throw new Error('the re-parented child was dropped');
    expect(within(child).getByText('kept-child')).toBeInTheDocument();
  });

  it('renders a placeholder when a trace has no spans', async () => {
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockResolvedValue(traceFixture({ spans: [] })),
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    expect(await screen.findByText('This trace has no recorded spans.')).toBeInTheDocument();
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

  it('downloads the trace with every reference resolved', async () => {
    const user = userEvent.setup();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:trace');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const exportTrace = vi.fn().mockResolvedValue(new Blob(['{}'], { type: 'application/json' }));
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockResolvedValue(traceFixture()),
      exportTrace,
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Download resolved' }));
    await waitFor(() => {
      expect(exportTrace).toHaveBeenCalledWith('t1', { resolve: true });
    });
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

/** A plain root (auto-selected on open) over two steps whose inputs hold references. */
function referenceTrace(): RunTrace {
  const ref = (spanId: string) => ({
    $tai42_ref: { span_id: spanId, field: 'output', pointer: '/0/parts/0/content' },
  });
  return traceFixture({
    spans: [
      span({ id: 'root', name: 'root-chain', kind: 'CHAIN', input: { question: 'q' } }),
      span({ id: 'a', parentId: 'root', name: 'step-a', kind: 'CHAIN', input: { x: ref('g1') } }),
      span({ id: 'b', parentId: 'root', name: 'step-b', kind: 'CHAIN', input: { y: ref('g2') } }),
    ],
  });
}

async function selectRow(user: ReturnType<typeof userEvent.setup>, spanId: string): Promise<void> {
  const row = await waitFor(() => {
    const found = document.querySelector<HTMLElement>(`[data-span-id="${spanId}"]`);
    if (found === null) throw new Error(`the ${spanId} row was not rendered`);
    return found;
  });
  await user.click(row);
}

describe('TraceView — each selected span opens in its own default view', () => {
  it('shows the recorded reference of a span selected after a span without references', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(referenceTrace()) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    const detail = await screen.findByTestId('span-detail');
    expect(within(detail).getByRole('heading', { name: 'root-chain' })).toBeInTheDocument();

    await selectRow(user, 'a');
    expect(within(detail).getByRole('heading', { name: 'step-a' })).toBeInTheDocument();
    expect(
      within(detail).getByText('Recorded with 1 reference to other steps.'),
    ).toBeInTheDocument();
    // As recorded, the reference object is in the tree: its key, span id and pointer.
    expect(within(detail).getAllByText(/\$tai42_ref/).length).toBeGreaterThan(0);
    expect(within(detail).getAllByText(/g1/).length).toBeGreaterThan(0);
    expect(within(detail).getAllByText(/\/0\/parts\/0\/content/).length).toBeGreaterThan(0);
  });

  it('opens the next span As recorded after Resolved was chosen on another, with no unasked read', async () => {
    const user = userEvent.setup();
    const getResolvedSpanValue = vi.fn().mockResolvedValue({
      traceId: 't1',
      spanId: 'a',
      field: 'input',
      pointer: '',
      value: { x: 'assembled' },
    });
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockResolvedValue(referenceTrace()),
      getResolvedSpanValue,
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    await selectRow(user, 'a');
    await user.click(screen.getByRole('radio', { name: 'Resolved' }));
    await screen.findByText('Full value assembled from 1 reference.');

    await selectRow(user, 'b');
    const detail = screen.getByTestId('span-detail');
    expect(within(detail).getByRole('heading', { name: 'step-b' })).toBeInTheDocument();
    expect(within(detail).getByRole('radio', { name: 'As recorded' })).toBeChecked();
    expect(within(detail).getAllByText(/\$tai42_ref/).length).toBeGreaterThan(0);
    expect(getResolvedSpanValue).toHaveBeenCalledTimes(1);
  });
});
