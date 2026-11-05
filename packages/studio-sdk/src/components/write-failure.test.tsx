import type { ApiClient, FailedReplyRoll } from '@tai42/api-client';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ApiProvider } from '../hooks/useApi';
import { FailedReplyOutcome } from './failed-reply-outcome';
import { WriteFailure } from './write-failure';

const STARTING_MESSAGE =
  "tool selection of 'relay' cannot be checked: the server did not list its tools: MCP server 'relay' start still in progress after 10s; it continues up to the start budget 60s";
const NOT_LOADED_MESSAGE =
  "tool selection of 'relay' cannot be checked: the server did not list its tools: MCP server 'relay' is not loaded on this worker; a reload binds it";

/**
 * The client's readers of the two listing refusals, each answering for the one error this
 * test raises.
 */
const STARTING = new Error(STARTING_MESSAGE);
const NOT_LOADED = new Error(NOT_LOADED_MESSAGE);
const client = {
  failedReplyRoll: () => null,
  isMcpStartingError: (error: unknown) => error === STARTING,
  isMcpNotLoadedError: (error: unknown) => error === NOT_LOADED,
} as unknown as ApiClient;

function renderFailure(error: unknown): void {
  render(
    <ApiProvider value={client}>
      <WriteFailure scope="save" error={error} />
    </ApiProvider>,
  );
}

describe('WriteFailure', () => {
  it('shows a write refused while an MCP server is still starting on the warn ground, naming the start', () => {
    renderFailure(STARTING);
    const refusal = screen.getByRole('alert');
    expect(refusal).toHaveClass('tai-warn-state');
    expect(refusal).toHaveTextContent('An MCP server is still starting');
    expect(refusal).toHaveTextContent(STARTING_MESSAGE);
    expect(refusal).toHaveTextContent('Nothing was changed. Try again once it has started.');
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('shows a write refused because the worker has not loaded an MCP server on the warn ground, naming the reload', () => {
    renderFailure(NOT_LOADED);
    const refusal = screen.getByRole('alert');
    expect(refusal).toHaveClass('tai-warn-state');
    expect(refusal).toHaveTextContent('An MCP server is not loaded on the worker that answered');
    expect(refusal).toHaveTextContent(NOT_LOADED_MESSAGE);
    expect(refusal).toHaveTextContent('Nothing was changed. Reload the server, then try again.');
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('shows any other failure in the error state with its message', () => {
    renderFailure(new Error('upstream down'));
    const failure = screen.getByRole('alert');
    expect(failure).toHaveClass('tai-error-state');
    expect(failure).toHaveTextContent('Something went wrong');
    expect(failure).toHaveTextContent('upstream down');
    expect(screen.queryByText('An MCP server is still starting')).toBeNull();
    expect(
      screen.queryByText('An MCP server is not loaded on the worker that answered'),
    ).toBeNull();
  });
});

describe('WriteFailure on a reply that carries a recycle roll', () => {
  const FAILED = new Error('Internal Server Error');
  const withheld: FailedReplyRoll = {
    summary: {
      status: 'degraded',
      note: null,
      failures: [{ name: 'serve-a', outcome: 'failed', message: 'build refused', withheld: true }],
      error: null,
      awaiting: [{ name: 'serve-a', keys: ['TAI_KEY'], reading: 'withheld' }],
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
    },
    recycle: null,
  };
  const masked: FailedReplyRoll = {
    summary: {
      status: 'converged',
      note: null,
      failures: [],
      error: null,
      awaiting: [{ name: 'serve-a', keys: ['TAI_KEY'], reading: 'unstated' }],
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
    },
    recycle: null,
  };
  const unreachable: FailedReplyRoll = {
    summary: {
      status: 'unreachable',
      note: null,
      failures: [],
      error: 'bus down',
      awaiting: [],
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
    },
    recycle: null,
  };
  const stopped: FailedReplyRoll = {
    summary: null,
    recycle: {
      recycle: [],
      skipped: [],
      fresh: [],
      recycle_stopped: { kind: 'serve', name: 'serve-a', detail: 'timed out' },
    },
  };

  function renderRoll(roll: FailedReplyRoll): void {
    const reading = {
      ...client,
      failedReplyRoll: (error: unknown) => (error === FAILED ? roll : null),
    } as unknown as ApiClient;
    render(
      <ApiProvider value={reading}>
        <WriteFailure scope="save" error={FAILED} />
      </ApiProvider>,
    );
  }

  it('shows the discarded build the operator-facing body states, with no saved framing', () => {
    renderRoll(withheld);
    expect(screen.getByText('Internal Server Error')).toBeInTheDocument();
    expect(screen.getByText('1 worker did not converge —')).toBeInTheDocument();
    expect(
      screen.getByText(
        /^The stored configuration did not build on this worker, so it keeps running its current configuration\. Trying again may be refused the same way: first fix the stored configuration, or the cause the build error names\.$/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('build refused')).toBeInTheDocument();
    expect(
      screen.getByText('1 worker could not build the stored configuration —'),
    ).toBeInTheDocument();
  });

  it('shows the masked body with no report: the worker reads unstated and no headline shows', () => {
    renderRoll(masked);
    expect(screen.getByText('Internal Server Error')).toBeInTheDocument();
    expect(screen.getByText('1 worker has settings it has not applied —')).toBeInTheDocument();
    expect(
      screen.getByText(
        'These settings take effect only when this worker restarts. If its new build failed, fix the stored configuration first, since a restart may fail the same way. Then restart it through your deployment’s supervisor (on a bare server, restart the server).',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/converged/)).toBeNull();
    expect(screen.queryByText('The reload was applied.')).toBeNull();
    expect(screen.queryByText(/Change saved/)).toBeNull();
  });

  it('frames an unreachable bus without saying the change was saved', () => {
    renderRoll(unreachable);
    expect(screen.getByText('The worker fleet was not reached —')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The worker bus was unreachable, so other workers may not be running the stored configuration. Re-run the reload from the System page once the bus is back.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Change saved/)).toBeNull();
  });

  it('says a retryable worker may not be running the stored configuration', () => {
    const summary = withheld.summary;
    if (summary === null) throw new Error('the fixture has a summary');
    renderRoll({
      summary: {
        ...summary,
        failures: [{ name: 'serve-a', outcome: 'timed_out', message: null, withheld: false }],
        awaiting: [],
      },
      recycle: null,
    });
    expect(
      screen.getByText(
        'This worker may not be running the stored configuration — reload the fleet from the System page to converge it.',
      ),
    ).toBeInTheDocument();
  });

  it('shows where the roll stopped', () => {
    renderRoll(stopped);
    expect(screen.getByText('Internal Server Error')).toBeInTheDocument();
    expect(screen.getByText('The recycle stopped at serve-a (serve workers)')).toBeInTheDocument();
  });

  function renderScoped(roll: FailedReplyRoll, ui: ReactNode): void {
    const reading = {
      ...client,
      failedReplyRoll: (error: unknown) => (error === FAILED ? roll : null),
    } as unknown as ApiClient;
    render(<ApiProvider value={reading}>{ui}</ApiProvider>);
  }

  it('heads the roll of a named write with that write', () => {
    renderScoped(stopped, <WriteFailure error={FAILED} scope="env key K" />);
    expect(screen.getByRole('region', { name: 'Worker recycle — env key K' })).toBeVisible();
  });

  it('names the banner of a named write with that write', () => {
    renderScoped(masked, <WriteFailure error={FAILED} scope="env key K" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 worker has settings it has not applied — env key K',
    );
  });

  it('heads the roll the outcome shows alone with its scope', () => {
    renderScoped(stopped, <FailedReplyOutcome error={FAILED} scope="env key K" />);
    expect(screen.getByRole('region', { name: 'Worker recycle — env key K' })).toBeVisible();
  });

  it('keeps a listing refusal as it renders, whatever else the client reads', () => {
    const reading = { ...client, failedReplyRoll: () => masked } as unknown as ApiClient;
    render(
      <ApiProvider value={reading}>
        <WriteFailure scope="save" error={STARTING} />
      </ApiProvider>,
    );
    expect(screen.getByRole('alert')).toHaveClass('tai-warn-state');
    expect(screen.queryByText('1 worker has settings it has not applied —')).toBeNull();
  });
});
