/**
 * Behavioural tests for the run panel. Cover the auto-form path (schema →
 * form → validate → run → typed result), the loud failure surfaces, and the
 * PANEL-VS-AUTOFORM decision driven by the plugin registry:
 *
 *  - auto-form renders from a fetched schema;
 *  - validation blocks Run on a missing required field (no `runTool` call);
 *  - a clean Run renders the typed result viewer;
 *  - a run error surfaces the GENERIC error state;
 *  - a client-timeout expiry surfaces the DISTINCT "still executing" state;
 *  - with no contribution the auto-form renders; after a plugin registers a
 *    panel the contributed panel renders instead.
 */
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ToolPanelProps } from '@tai42/studio-sdk';
import { loadPlugin } from '@tai42/studio-sdk/host';
import { __resetContributions } from '@tai42/studio-sdk/testing';

import { AutoFormRunPanel, RunPanel } from './RunPanel';
import { RUN_TIMEOUT_MS } from './run';
import {
  fullProjection,
  renderWithProviders,
  scopedProjection,
  type StubApiClient,
} from './test-utils';

/** Both run doors, as a projection carries them (each a concrete route). */
const RUN_TOOL_ROUTE = { path: '/api/run-tool', methods: ['POST'] };
const TOOL_RUNS_ROUTE = { path: '/api/tool-runs', methods: ['POST'] };

/** Find a button by name and wait until the capability projection has enabled it — the
 * run buttons start disabled (fail-safe) until the projection resolves. */
async function findEnabled(name: string): Promise<HTMLElement> {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

const REQUIRED_NAME_SCHEMA = {
  type: 'object',
  properties: { name: { type: 'string', title: 'Name' } },
  required: ['name'],
} as const;

const EMPTY_OBJECT_SCHEMA = { type: 'object', properties: {}, required: [] } as const;

afterEach(() => {
  __resetContributions();
});

describe('RunPanel — auto-form from a fetched schema', () => {
  it('renders the schema-driven form when the schema loads', async () => {
    const client: StubApiClient = {
      getToolSchema: vi.fn().mockResolvedValue({
        input: REQUIRED_NAME_SCHEMA,
        output: null,
        description: 'Echoes its input.',
      }),
    };
    renderWithProviders(<RunPanel toolName="echo" />, { client });

    expect(await screen.findByTestId('schema-form')).toBeInTheDocument();
    expect(screen.getByText('Echoes its input.')).toBeInTheDocument();
  });

  it('shows a loud error state when the schema request fails', async () => {
    const client: StubApiClient = {
      getToolSchema: vi.fn().mockRejectedValue(new Error('boom: schema failed')),
    };
    renderWithProviders(<RunPanel toolName="echo" />, { client });

    expect(await screen.findByRole('alert')).toHaveTextContent('boom: schema failed');
  });
});

describe('AutoFormRunPanel — validation + run', () => {
  it('blocks Run and never calls runTool when a required field is missing', async () => {
    const user = userEvent.setup();
    const runTool = vi.fn();
    const client: StubApiClient = { runTool, listToolRuns: vi.fn().mockResolvedValue([]) };
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={REQUIRED_NAME_SCHEMA} />, {
      client,
      projection: fullProjection(),
    });

    await user.click(await findEnabled('Run'));

    expect(runTool).not.toHaveBeenCalled();
    expect(screen.getByText('"name" is required')).toBeInTheDocument();
  });

  it('runs the tool and renders an object result in the JSON tree', async () => {
    const user = userEvent.setup();
    const runTool = vi.fn().mockResolvedValue({ greeting: 'hello' });
    const client: StubApiClient = { runTool, listToolRuns: vi.fn().mockResolvedValue([]) };
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client,
      projection: fullProjection(),
    });

    await user.click(await findEnabled('Run'));

    expect(await screen.findByText('greeting:')).toBeInTheDocument();
    expect(screen.getByText('"hello"')).toBeInTheDocument();
    expect(runTool).toHaveBeenCalledWith({ tool: 'echo', kwargs: {} }, expect.any(AbortSignal));
  });

  it('surfaces the generic error state when the run fails', async () => {
    const user = userEvent.setup();
    const runTool = vi.fn().mockRejectedValue(new Error('boom: run failed'));
    const client: StubApiClient = { runTool, listToolRuns: vi.fn().mockResolvedValue([]) };
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client,
      projection: fullProjection(),
    });

    await user.click(await findEnabled('Run'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: run failed');
    // The generic surface — NOT the distinct timeout state.
    expect(screen.queryByTestId('tool-run-timeout')).toBeNull();
  });

  it('submits a background run from the secondary action and shows its live detail', async () => {
    const user = userEvent.setup();
    const submitToolRun = vi.fn().mockResolvedValue({ run_id: 'bg1' });
    const getToolRun = vi.fn().mockResolvedValue({
      run_id: 'bg1',
      tool_name: 'echo',
      status: 'succeeded',
      started_at: 't',
      finished_at: 't2',
      result: { ok: 1 },
    });
    const client: StubApiClient = {
      runTool: vi.fn(),
      submitToolRun,
      getToolRun,
      listToolRuns: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client,
      projection: fullProjection(),
    });

    await user.click(await findEnabled('Run in background'));

    expect(submitToolRun).toHaveBeenCalledWith({ tool_name: 'echo', arguments: {} });
    const detail = await screen.findByTestId('tool-run-detail');
    expect(within(detail).getByText('ok:')).toBeInTheDocument();
    expect(within(detail).getByText('1')).toBeInTheDocument();
  });

  it('refetches the recent-runs list after a background submit into an EMPTY list', async () => {
    const user = userEvent.setup();
    const submitToolRun = vi.fn().mockResolvedValue({ run_id: 'bg-new' });
    const getToolRun = vi.fn().mockResolvedValue({
      run_id: 'bg-new',
      tool_name: 'echo',
      status: 'running',
      started_at: 't',
    });
    // Empty on first load, then the just-submitted RUNNING run once the submit
    // invalidates and re-fetches the list.
    const listToolRuns = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { run_id: 'bg-new', tool_name: 'echo', status: 'running', started_at: 't' },
      ]);
    const client: StubApiClient = {
      runTool: vi.fn(),
      submitToolRun,
      getToolRun,
      listToolRuns,
    };
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client,
      projection: fullProjection(),
    });

    // The list starts empty (its poll is stopped: nothing non-terminal to watch).
    expect(await screen.findByText('No background runs yet')).toBeInTheDocument();

    await user.click(await findEnabled('Run in background'));

    // The submit invalidated the list query, so it re-fetched — and the new
    // running run now shows in the recent-runs list.
    await waitFor(() => {
      expect(listToolRuns).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole('button', { name: /bg-new/ })).toBeInTheDocument();
  });

  it('refetches the recent-runs list after a background submit into an ALL-TERMINAL list', async () => {
    const user = userEvent.setup();
    const submitToolRun = vi.fn().mockResolvedValue({ run_id: 'bg-new' });
    const getToolRun = vi.fn().mockResolvedValue({
      run_id: 'bg-new',
      tool_name: 'echo',
      status: 'running',
      started_at: 't2',
    });
    // First load: one already-settled run (poll stopped). After the submit the
    // list re-fetches and now also carries the new running run.
    const listToolRuns = vi
      .fn()
      .mockResolvedValueOnce([
        { run_id: 'bg-old', tool_name: 'echo', status: 'succeeded', started_at: 't1' },
      ])
      .mockResolvedValue([
        { run_id: 'bg-new', tool_name: 'echo', status: 'running', started_at: 't2' },
        { run_id: 'bg-old', tool_name: 'echo', status: 'succeeded', started_at: 't1' },
      ]);
    const client: StubApiClient = {
      runTool: vi.fn(),
      submitToolRun,
      getToolRun,
      listToolRuns,
    };
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client,
      projection: fullProjection(),
    });

    // The all-terminal list is shown (and its poll is stopped).
    expect(await screen.findByRole('button', { name: /bg-old/ })).toBeInTheDocument();

    await user.click(await findEnabled('Run in background'));

    await waitFor(() => {
      expect(listToolRuns).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole('button', { name: /bg-new/ })).toBeInTheDocument();
  });
});

describe('AutoFormRunPanel — client timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the distinct "still executing server-side" state on timeout expiry', async () => {
    // A run that only ever settles by rejecting when its signal aborts.
    const runTool = vi.fn(
      (_args: unknown, signal?: AbortSignal) =>
        new Promise<never>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    const client: StubApiClient = { runTool, listToolRuns: vi.fn().mockResolvedValue([]) };
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client,
      projection: fullProjection(),
    });

    // Let the capability projection resolve so the run door is enabled before submit.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    // `fireEvent` is synchronous (no userEvent timer coupling under fake timers).
    const runButton = screen.getByRole('button', { name: 'Run' });
    expect(runButton).toBeEnabled();
    const form = runButton.closest('form');
    if (form === null) throw new Error('expected the Run button to be inside a form');
    fireEvent.submit(form);

    // Flush react-query's scheduler tick, then assert the loud running state.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText(/running/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RUN_TIMEOUT_MS);
    });

    const timeout = screen.getByTestId('tool-run-timeout');
    expect(timeout).toHaveTextContent(/still executing on the server/i);
    // Distinct from the generic failure surface.
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});

describe('AutoFormRunPanel — run-door capability gate', () => {
  function runClient(): StubApiClient {
    return {
      runTool: vi.fn().mockResolvedValue({ ok: 1 }),
      submitToolRun: vi.fn().mockResolvedValue({ run_id: 'bg' }),
      listToolRuns: vi.fn().mockResolvedValue([]),
    };
  }

  it('shows both run doors for a full projection', async () => {
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client: runClient(),
      projection: fullProjection(),
    });

    expect(await findEnabled('Run')).toBeInTheDocument();
    expect(await findEnabled('Run in background')).toBeInTheDocument();
    expect(screen.queryByTestId('run-read-only-note')).toBeNull();
  });

  it('shows ONLY the background door to a scoped caller who reaches /api/tool-runs but not /api/run-tool', async () => {
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client: runClient(),
      projection: scopedProjection({ routes: [TOOL_RUNS_ROUTE] }),
    });

    expect(await findEnabled('Run in background')).toBeInTheDocument();
    // The sync Run POSTs the admin-only /api/run-tool — never shown to this caller.
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    });
  });

  it('shows ONLY the sync door to a scoped caller who reaches /api/run-tool but not /api/tool-runs', async () => {
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client: runClient(),
      projection: scopedProjection({ routes: [RUN_TOOL_ROUTE] }),
    });

    expect(await findEnabled('Run')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Run in background' })).toBeNull();
    });
  });

  it('shows a read-only note (no dead buttons) when the caller reaches NEITHER run door', async () => {
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client: runClient(),
      projection: scopedProjection({ routes: [] }),
    });

    expect(await screen.findByTestId('run-read-only-note')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run in background' })).toBeNull();
  });

  it('fails safe while the projection is not ready — both doors render disabled', async () => {
    renderWithProviders(<AutoFormRunPanel toolName="echo" schema={EMPTY_OBJECT_SCHEMA} />, {
      client: runClient(),
    });

    expect(await screen.findByRole('button', { name: 'Run' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Run in background' })).toBeDisabled();
    expect(screen.queryByTestId('run-read-only-note')).toBeNull();
  });
});

describe('RunPanel — panel vs auto-form', () => {
  it('falls back to the auto-form when no panel is contributed', async () => {
    const client: StubApiClient = {
      getToolSchema: vi.fn().mockResolvedValue({
        input: EMPTY_OBJECT_SCHEMA,
        output: null,
        description: null,
      }),
    };
    renderWithProviders(<RunPanel toolName="echo" />, { client });

    expect(await screen.findByTestId('schema-form')).toBeInTheDocument();
  });

  it('renders the contributed panel instead of the auto-form', async () => {
    function EchoPanel({ toolName }: ToolPanelProps): ReactNode {
      return <div>Custom panel for {toolName}</div>;
    }
    await loadPlugin('acme', (ctx) => {
      ctx.registerToolPanel({ toolName: 'echo', component: EchoPanel });
    });

    const client: StubApiClient = {
      getToolSchema: vi.fn().mockResolvedValue({
        input: EMPTY_OBJECT_SCHEMA,
        output: null,
        description: null,
      }),
    };
    renderWithProviders(<RunPanel toolName="echo" />, { client });

    expect(await screen.findByText('Custom panel for echo')).toBeInTheDocument();
    expect(screen.queryByTestId('schema-form')).toBeNull();
  });
});
