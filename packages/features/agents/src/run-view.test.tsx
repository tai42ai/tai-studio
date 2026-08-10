/**
 * The shared streaming-run view's status settling: an honest end-of-stream. A
 * run must never wear a green "Finished" when its connection died mid-stream, and
 * a user Stop must read as a deliberate "Stopped", not a fresh "Ready".
 *
 * Each case drives a real `useStreamRun` through the `StreamRunView` UI (Run/Stop
 * clicks, badge assertions) over the test-utils stream stubs, so the settling
 * path is exercised end to end rather than by poking hook internals.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { JsonSchema } from '@tai42/studio-sdk';

import { StreamRunView, useStreamRun, type StreamOpener } from './run-view';
import { ERROR_TRANSCRIPT, FULL_TRANSCRIPT, OPEN_TRANSCRIPT, parse } from './fixtures';
import { hangingStream, renderWithProviders, scriptedStream, stubClient } from './test-utils';

// An input schema with no fields, so the empty auto-form validates and Run fires
// with a single click.
const EMPTY_SCHEMA: JsonSchema = { type: 'object', properties: {} };

function RunHarness({ open }: { readonly open: StreamOpener }): ReactNode {
  const run = useStreamRun(open);
  return (
    <StreamRunView
      title="tester"
      schema={EMPTY_SCHEMA}
      run={run}
      onBack={vi.fn()}
      backLabel="Back to agents"
    />
  );
}

describe('StreamRunView status settling', () => {
  it('settles an abrupt stream close (no terminal frame) as an honest error', async () => {
    // The generator yields a non-terminal event, then RETURNS — the shape of a
    // connection that died before its guaranteed `stream.end`/`stream.error`.
    const open: StreamOpener = (input, signal) =>
      scriptedStream(parse(OPEN_TRANSCRIPT))('agent', input, signal);
    renderWithProviders(<RunHarness open={open} />, stubClient({}));

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    // Not a green "Finished": the badge fails and the reason surfaces loudly.
    expect(await screen.findByText('Failed')).toBeInTheDocument();
    expect(await screen.findByText('connection lost before the run finished')).toBeInTheDocument();
    expect(screen.queryByText('Finished')).not.toBeInTheDocument();
  });

  it('marks a user Stop as Stopped, not Ready', async () => {
    const captured: { signal: AbortSignal | undefined } = { signal: undefined };
    const open: StreamOpener = (input, signal) =>
      hangingStream(parse(OPEN_TRANSCRIPT), captured)('agent', input, signal);
    renderWithProviders(<RunHarness open={open} />, stubClient({}));

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    const stop = await screen.findByRole('button', { name: 'Stop the run' });
    await userEvent.click(stop);

    // A stopped run reads as deliberately halted, never falling back to the
    // never-started "Ready".
    expect(await screen.findByText('Stopped')).toBeInTheDocument();
    expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    expect(captured.signal?.aborted).toBe(true);
  });

  it('settles Finished on a terminal stream.end', async () => {
    const open: StreamOpener = (input, signal) =>
      scriptedStream(parse(FULL_TRANSCRIPT))('agent', input, signal);
    renderWithProviders(<RunHarness open={open} />, stubClient({}));

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('Finished')).toBeInTheDocument();
  });

  it('settles Failed on a terminal stream.error frame without the abrupt-close override', async () => {
    const open: StreamOpener = (input, signal) =>
      scriptedStream(parse(ERROR_TRANSCRIPT))('agent', input, signal);
    renderWithProviders(<RunHarness open={open} />, stubClient({}));

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('Failed')).toBeInTheDocument();
    // The stream.error message owns a single timeline row; the abrupt-close
    // error text never appears, since a terminal frame did arrive.
    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(screen.queryByText('connection lost before the run finished')).not.toBeInTheDocument();
  });
});
