/**
 * The per-run trace view rendered directly: the query states (loading, 404, 501,
 * empty), the nested span tree with level-driven coloring and escaped payloads,
 * the back action, and the export → download flow (anchor click spied so jsdom
 * logs no navigation while the real export wiring is asserted).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type RunSpan, type RunTrace } from '@tai42/api-client';

import { TraceView } from './TraceView';
import { renderWithProviders, type StubApiClient } from './test-utils';

afterEach(() => {
  vi.restoreAllMocks();
});

function span(overrides: Partial<RunSpan>): RunSpan {
  return {
    id: 's1',
    parentId: null,
    traceId: 't1',
    name: 'root-span',
    type: 'llm',
    level: 'DEFAULT',
    statusMessage: null,
    start: '2026-01-01T00:00:00.000Z',
    end: '2026-01-01T00:00:01.500Z',
    model: 'gpt-4o',
    usage: null,
    metadata: null,
    input: 'in',
    output: 'out',
    nodeId: null,
    ...overrides,
  };
}

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
      span({ id: 's1', parentId: null, input: '<script>alert(1)</script>' }),
      span({
        id: 's2',
        parentId: 's1',
        name: 'child-span',
        type: 'tool',
        level: 'ERROR',
        statusMessage: 'boom',
        start: null,
        end: null,
        model: null,
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
    // `←`/`→` are in NO shipped font subset, so a literal arrow paints in a
    // platform fallback face beside Inter. The icon set carries the mark instead.
    expect(document.body.textContent).not.toMatch(/[\u2190\u2192]/u);
    expect(screen.queryByText('root-span')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('calls onBack when the back button is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
    renderWithProviders(<TraceView traceId="t1" onBack={onBack} />, { client });

    await screen.findByText('root-span');
    await user.click(screen.getByRole('button', { name: 'Back to runs' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('renders the nested span tree, tags, and level color, escaping payloads', async () => {
    const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    expect(await screen.findByText('root-span')).toBeInTheDocument();
    const child = screen.getByText('child-span');
    expect(child).toBeInTheDocument();
    // The ERROR span name is colored with the canonical error token; the DEFAULT one is not.
    expect(child).toHaveStyle({ color: 'var(--tai-color-err-text)' });
    expect(screen.getByText('root-span')).toHaveStyle({ color: 'var(--tai-color-text)' });
    expect(screen.getByText('boom')).toBeInTheDocument();

    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();

    // The <script> payload renders as literal escaped text, never a live element.
    expect(
      screen.getByText((content) => content.includes('<script>alert(1)</script>')),
    ).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();
  });

  it('names each JSON pane for the span and the side it holds, never all of them "JSON"', async () => {
    // A `JsonTree` pane becomes a keyboard tab stop the moment it scrolls, and
    // its name is whatever the call site passed — omitted, EVERY pane in the
    // trace announces itself as "JSON" and a reader tabbing through cannot tell
    // one span's input from another span's output. jsdom runs no layout, so the
    // overflow the region keys on is stated on the prototype for this test.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 100 });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, value: 400 });
    try {
      const client: StubApiClient = { getRunTrace: vi.fn().mockResolvedValue(traceFixture()) };
      renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });
      await screen.findByText('root-span');

      const names = [...document.querySelectorAll('.tai-code-block')].map((pane) =>
        pane.getAttribute('aria-label'),
      );
      expect(names).toEqual([
        'root-span input',
        'root-span output',
        'child-span input',
        'child-span output',
      ]);
    } finally {
      // Unshadow the jsdom getters this test hid on the prototype.
      Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
    }
  });

  it('renders a placeholder when the trace has no spans', async () => {
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockResolvedValue(traceFixture({ spans: [] })),
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    expect(await screen.findByText('This trace has no recorded spans.')).toBeInTheDocument();
  });

  it('surfaces a partial-availability trace fetch error loudly', async () => {
    const client: StubApiClient = {
      getRunTrace: vi
        .fn()
        .mockResolvedValue(
          traceFixture({ availability: 'partial', fetchError: 'spans truncated' }),
        ),
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent('spans truncated');
  });

  it('renders the read-not-supported state on a 501', async () => {
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockRejectedValue(new ApiError('nope', 501)),
    };
    renderWithProviders(<TraceView traceId="t1" onBack={vi.fn()} />, { client });

    expect(await screen.findByTestId('observability-read-not-supported')).toBeInTheDocument();
  });

  it('surfaces a 404 as a loud error', async () => {
    const client: StubApiClient = {
      getRunTrace: vi.fn().mockRejectedValue(new ApiError('trace not found', 404)),
    };
    renderWithProviders(<TraceView traceId="missing" onBack={vi.fn()} />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent('trace not found');
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
