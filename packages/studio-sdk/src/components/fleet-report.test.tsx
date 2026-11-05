import type { FleetReportSummary } from '@tai42/api-client';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FleetReport } from './fleet-report';

/** The status line that carries the given outcome label, with its mark and tone. */
function statusFor(alert: HTMLElement, label: RegExp): HTMLElement {
  const line = within(alert).getByText(label);
  expect(line).toHaveClass('tai-status');
  expect(line.querySelector('svg')).not.toBeNull();
  return line;
}

describe('FleetReport', () => {
  it('renders nothing for an absent report', () => {
    const { container } = render(<FleetReport summary={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a converged report (the caller shows its own success)', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'converged',
      awaiting: [],
      note: 'only this worker reloaded',
      failures: [],
      error: null,
    };
    const { container } = render(<FleetReport summary={summary} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a loud alert naming every non-converged worker and its outcome', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'degraded',
      awaiting: [],
      note: null,
      failures: [
        { name: 'serve-a', outcome: 'failed', message: 'reload raised', withheld: false },
        { name: 'backend-b', outcome: 'timed_out', message: null, withheld: false },
        { name: 'serve-c', outcome: 'departed', message: null, withheld: false },
        { name: 'serve-d', outcome: 'missing', message: null, withheld: false },
      ],
      error: null,
    };
    render(<FleetReport summary={summary} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/4 workers did not converge/)).toBeInTheDocument();
    expect(within(alert).getByText('serve-a')).toBeInTheDocument();
    // The per-worker message (from error/detail) renders alongside the worker.
    expect(within(alert).getByText(/reload raised/)).toBeInTheDocument();
    expect(within(alert).getByText('backend-b')).toBeInTheDocument();
    expect(within(alert).getByText('serve-c')).toBeInTheDocument();
    expect(within(alert).getByText('serve-d')).toBeInTheDocument();
    // Each outcome label must match the bus semantics: `missing` is alive-but-silent
    // (never acked, still in the census), `timed_out` acked but did not finish applying.
    expect(within(alert).getByText(/apply failed/)).toBeInTheDocument();
    expect(within(alert).getByText(/acknowledged but did not finish applying/)).toBeInTheDocument();
    expect(within(alert).getByText(/left mid-broadcast/)).toBeInTheDocument();
    expect(within(alert).getByText(/alive but did not acknowledge in time/)).toBeInTheDocument();
  });

  it('renders the per-worker gap outcomes (resyncing / recycling / stale) with their labels and tone', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'degraded',
      awaiting: [],
      note: null,
      failures: [
        { name: 'serve-1', outcome: 'resyncing', message: null, withheld: false },
        { name: 'backend-1', outcome: 'recycling', message: null, withheld: false },
        { name: 'serve-2', outcome: 'stale', message: null, withheld: false },
      ],
      error: null,
    };
    render(<FleetReport summary={summary} />);
    const alert = screen.getByRole('alert');
    // Each gap outcome carries its own honest label; `stale` makes NO convergence promise.
    expect(statusFor(alert, /^resyncing — will converge on resync$/)).toHaveClass(
      'tai-status-warn',
    );
    expect(statusFor(alert, /^restarting$/)).toHaveClass('tai-status-warn');
    expect(statusFor(alert, /^quiet — reconnecting or dead$/)).toHaveClass('tai-status-warn');
    expect(within(alert).getByText('serve-1')).toBeInTheDocument();
    expect(within(alert).getByText('backend-1')).toBeInTheDocument();
    expect(within(alert).getByText('serve-2')).toBeInTheDocument();
  });

  it('gives every state a mark AND a label, never color alone', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'degraded',
      awaiting: [],
      note: null,
      failures: [
        { name: 'serve-a', outcome: 'failed', message: null, withheld: false },
        { name: 'backend-b', outcome: 'timed_out', message: null, withheld: false },
        { name: 'serve-c', outcome: 'departed', message: null, withheld: false },
        { name: 'serve-d', outcome: 'missing', message: null, withheld: false },
      ],
      error: null,
    };
    render(<FleetReport summary={summary} />);
    const alert = screen.getByRole('alert');

    // The headline: a degraded fleet is a warning.
    expect(statusFor(alert, /did not converge/)).toHaveClass('tai-status-warn');
    // `failed` is a definite negative; `departed` warns; the unresolved two are pending.
    expect(statusFor(alert, /^apply failed$/)).toHaveClass('tai-status-err');
    expect(statusFor(alert, /^left mid-broadcast$/)).toHaveClass('tai-status-warn');
    expect(statusFor(alert, /^acknowledged but did not finish applying$/)).toHaveClass(
      'tai-status-pending',
    );
    expect(statusFor(alert, /^alive but did not acknowledge in time$/)).toHaveClass(
      'tai-status-pending',
    );
  });

  it('marks an unreachable bus as an error state', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'unreachable',
      awaiting: [],
      note: null,
      failures: [],
      error: 'RedisConnectionError: connection refused',
    };
    render(<FleetReport summary={summary} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('tai-error-state');
    expect(statusFor(alert, /was not reached/)).toHaveClass('tai-status-err');
    // The transport error is a raw payload — it renders on the terminal ground.
    expect(within(alert).getByText('RedisConnectionError: connection refused')).toHaveClass(
      'tai-code-block',
    );
  });

  it('renders a loud alert with the transport error when the bus was unreachable', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'unreachable',
      awaiting: [],
      note: null,
      failures: [],
      error: 'RedisConnectionError: connection refused',
    };
    render(<FleetReport summary={summary} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/was not reached/)).toBeInTheDocument();
    expect(within(alert).getByText('RedisConnectionError: connection refused')).toBeInTheDocument();
  });

  it('omits the error line when an unreachable report carries no message', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'unreachable',
      awaiting: [],
      note: null,
      failures: [],
      error: null,
    };
    render(<FleetReport summary={summary} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('drops the "Change saved" framing and System-page pointer on a degraded reload action', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'degraded',
      awaiting: [],
      note: null,
      failures: [
        { name: 'serve-a', outcome: 'failed', message: 'reload raised', withheld: false },
        { name: 'backend-b', outcome: 'timed_out', message: null, withheld: false },
      ],
      error: null,
    };
    render(<FleetReport summary={summary} action="reload" />);
    const alert = screen.getByRole('alert');
    // Nothing was saved on the reload surface, so the heading must not claim a save.
    expect(within(alert).getByText(/2 workers did not converge/)).toBeInTheDocument();
    expect(within(alert).queryByText(/Change saved/)).not.toBeInTheDocument();
    // The operator is already on the System page — no self-referential pointer.
    expect(within(alert).queryByText(/from the System page/)).not.toBeInTheDocument();
    expect(within(alert).getByText(/re-run the reload to converge them/)).toBeInTheDocument();
    // The honest per-worker outcomes remain unchanged.
    expect(within(alert).getByText('serve-a')).toBeInTheDocument();
    expect(within(alert).getByText(/apply failed/)).toBeInTheDocument();
    expect(within(alert).getByText(/acknowledged but did not finish applying/)).toBeInTheDocument();
  });

  it('drops the "Change saved" framing and System-page pointer on an unreachable reload action', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'unreachable',
      awaiting: [],
      note: null,
      failures: [],
      error: 'RedisConnectionError: connection refused',
    };
    render(<FleetReport summary={summary} action="reload" />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/The worker fleet was not reached/)).toBeInTheDocument();
    expect(within(alert).queryByText(/Change saved/)).not.toBeInTheDocument();
    expect(within(alert).queryByText(/from the System page/)).not.toBeInTheDocument();
    expect(within(alert).getByText(/Re-run the reload once the bus is back/)).toBeInTheDocument();
    expect(within(alert).getByText('RedisConnectionError: connection refused')).toBeInTheDocument();
  });

  it('points a degraded remove at re-running the remove, never a reload', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'degraded',
      awaiting: [],
      note: null,
      failures: [{ name: 'serve-b', outcome: 'timed_out', message: null, withheld: false }],
      error: null,
    };
    render(<FleetReport summary={summary} action="remove" />);
    const alert = screen.getByRole('alert');
    // Nothing was saved on a live-registry removal, so the heading must not claim a save.
    expect(within(alert).getByText(/1 worker did not converge/)).toBeInTheDocument();
    expect(within(alert).queryByText(/Change saved/)).not.toBeInTheDocument();
    // A reload would re-register the very tool being removed — the remediation must
    // be to re-run the remove, and must never tell the operator to reload.
    expect(within(alert).getByText(/re-run the remove to converge it/)).toBeInTheDocument();
    expect(within(alert).queryByText(/re-run the reload/)).not.toBeInTheDocument();
  });

  it('points an unreachable remove at re-running the remove, never a reload', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'unreachable',
      awaiting: [],
      note: null,
      failures: [],
      error: 'RedisConnectionError: connection refused',
    };
    render(<FleetReport summary={summary} action="remove" />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/The worker fleet was not reached/)).toBeInTheDocument();
    expect(within(alert).getByText(/Re-run the remove once the bus is back/)).toBeInTheDocument();
    expect(within(alert).queryByText(/re-run the reload/i)).not.toBeInTheDocument();
  });

  it('points a degraded deregister at re-running the deregister, never a reload', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'degraded',
      awaiting: [],
      note: null,
      failures: [{ name: 'serve-b', outcome: 'timed_out', message: null, withheld: false }],
      error: null,
    };
    render(<FleetReport summary={summary} action="deregister" />);
    const alert = screen.getByRole('alert');
    // Nothing was saved on a detach, so the heading must not claim a save.
    expect(within(alert).getByText(/1 worker did not converge/)).toBeInTheDocument();
    expect(within(alert).queryByText(/Change saved/)).not.toBeInTheDocument();
    // A reload would re-attach the very server being detached — the remediation must
    // be to re-run the deregister, and must never tell the operator to reload.
    expect(within(alert).getByText(/re-run the deregister to converge it/)).toBeInTheDocument();
    expect(within(alert).queryByText(/re-run the reload/)).not.toBeInTheDocument();
    expect(within(alert).queryByText(/from the System page/)).not.toBeInTheDocument();
  });

  it('points an unreachable deregister at re-running the deregister, never a reload', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'unreachable',
      awaiting: [],
      note: null,
      failures: [],
      error: 'RedisConnectionError: connection refused',
    };
    render(<FleetReport summary={summary} action="deregister" />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(/The worker fleet was not reached/)).toBeInTheDocument();
    expect(within(alert).queryByText(/Change saved/)).not.toBeInTheDocument();
    expect(
      within(alert).getByText(/Re-run the deregister once the bus is back/),
    ).toBeInTheDocument();
    expect(within(alert).queryByText(/Re-run the reload/)).not.toBeInTheDocument();
    expect(within(alert).getByText('RedisConnectionError: connection refused')).toBeInTheDocument();
  });

  it('keeps the alert, its mark and its per-worker labels', () => {
    const summary: FleetReportSummary = {
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'degraded',
      awaiting: [],
      note: null,
      failures: [{ name: 'serve-a', outcome: 'failed', message: null, withheld: false }],
      error: null,
    };
    render(<FleetReport summary={summary} />);
    const alert = screen.getByRole('alert');
    // A degraded fleet is a WARNING: panel and headline state one severity.
    expect(alert).toHaveClass('tai-warn-state');
    expect(alert).not.toHaveClass('tai-error-state');
    expect(statusFor(alert, /did not converge/)).toHaveClass('tai-status-warn');
    expect(statusFor(alert, /^apply failed$/)).toHaveClass('tai-status-err');
    expect(within(alert).getByText('serve-a')).toHaveClass('tai-mono');
  });

  it('agrees the count with its noun, singular and plural alike', () => {
    // `worker(s)` is not a plural: it is machine output at the one moment the
    // operator is being told something went wrong, and ONE unconverged worker is
    // the commonest degraded fleet there is. Both halves of the copy agree — the
    // headline's noun and the guidance line's subject and its pronoun.
    const degraded = (names: readonly string[]): FleetReportSummary => ({
      restartsPending: [],
      reloadsUnconfirmed: [],
      spanReleaseError: null,
      status: 'degraded',
      awaiting: [],
      note: null,
      failures: names.map((name) => ({ name, outcome: 'failed', message: null, withheld: false })),
      error: null,
    });

    const { rerender } = render(<FleetReport summary={degraded(['serve-a'])} />);
    let alert = screen.getByRole('alert');
    expect(within(alert).getByText(/1 worker did not converge/)).toBeInTheDocument();
    expect(within(alert).getByText(/This worker may still be running/)).toBeInTheDocument();
    expect(within(alert).getByText(/to converge it\./)).toBeInTheDocument();

    rerender(<FleetReport summary={degraded(['serve-a', 'serve-b'])} />);
    alert = screen.getByRole('alert');
    expect(within(alert).getByText(/2 workers did not converge/)).toBeInTheDocument();
    expect(within(alert).getByText(/These workers may still be running/)).toBeInTheDocument();
    expect(within(alert).getByText(/to converge them\./)).toBeInTheDocument();

    // Neither reading may reach the screen as a parenthesised suffix.
    for (const names of [['serve-a'], ['serve-a', 'serve-b']]) {
      rerender(<FleetReport summary={degraded(names)} />);
      expect(screen.getByRole('alert').textContent).not.toContain('worker(s)');
    }
  });
});

describe('FleetReport — workers awaiting a respawn', () => {
  const SUPERVISOR = 'your deployment’s supervisor (on a bare server, restart the server)';
  const awaiting: FleetReportSummary = {
    restartsPending: [],
    reloadsUnconfirmed: [],
    spanReleaseError: null,
    status: 'converged',
    awaiting: [
      { name: 'serve-1', keys: ['BACKEND_MANIFEST_KEY'], reading: 'restartable' },
      {
        name: 'backend-1',
        keys: ['BACKEND_MANIFEST_KEY', 'TAI_BUS_HEARTBEAT_TTL'],
        reading: 'restartable',
      },
    ],
    note: null,
    failures: [],
    error: null,
  };

  /** The status panel holding the given heading, read through its role. */
  function panelOf(heading: string): HTMLElement {
    const panel = screen.getByText(heading).closest<HTMLElement>('[role="status"]');
    if (panel === null) throw new Error(`no status panel for ${heading}`);
    return panel;
  }

  it('names each worker and the keys that take effect only when it restarts', () => {
    render(<FleetReport summary={awaiting} action="reload" />);
    const panel = panelOf('2 workers need a restart to apply some settings');
    expect(
      within(panel).getByText(
        `These settings changed in the stored environment after these workers started, and take effect only when they restart. Restart them through ${SUPERVISOR}.`,
      ),
    ).toBeInTheDocument();
    const [first, second] = within(panel).getAllByRole('listitem');
    if (first === undefined || second === undefined) throw new Error('expected two worker rows');
    expect(first).toHaveTextContent('serve-1');
    expect(within(first).getByText('waits for a restart:')).toBeInTheDocument();
    expect(within(first).getByText('BACKEND_MANIFEST_KEY')).toBeInTheDocument();
    expect(
      within(second).getByText('BACKEND_MANIFEST_KEY, TAI_BUS_HEARTBEAT_TTL'),
    ).toBeInTheDocument();
    expect(statusFor(panel, /need a restart/)).toHaveClass('tai-status-warn');
  });

  it('agrees the words with a single restartable worker', () => {
    render(
      <FleetReport
        summary={{
          ...awaiting,
          awaiting: [{ name: 'serve-1', keys: ['K'], reading: 'restartable' }],
        }}
      />,
    );
    const panel = panelOf('1 worker needs a restart to apply some settings');
    expect(
      within(panel).getByText(
        `These settings changed in the stored environment after this worker started, and take effect only when it restarts. Restart it through ${SUPERVISOR}.`,
      ),
    ).toBeInTheDocument();
  });

  it('shows the restart list beside a degraded report', () => {
    render(
      <FleetReport
        summary={{
          ...awaiting,
          status: 'degraded',
          failures: [{ name: 'serve-2', outcome: 'missing', message: null, withheld: false }],
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('serve-2');
    expect(screen.getByRole('status')).toHaveTextContent('serve-1');
  });

  it('counts each group apart, with its own heading, guidance and rows', () => {
    render(
      <FleetReport
        summary={{
          ...awaiting,
          status: 'degraded',
          failures: [
            { name: 'backend-1', outcome: 'failed', message: 'build refused', withheld: true },
          ],
          awaiting: [
            { name: 'serve-1', keys: ['K'], reading: 'restartable' },
            { name: 'backend-1', keys: ['K'], reading: 'withheld' },
            { name: 'backend-2', keys: ['K'], reading: 'withheld' },
            { name: 'serve-2', keys: ['K'], reading: 'unstated' },
          ],
        }}
      />,
    );
    expect(screen.getAllByRole('status')).toHaveLength(3);
    const restart = panelOf('1 worker needs a restart to apply some settings');
    expect(within(restart).getAllByRole('listitem')).toHaveLength(1);
    expect(restart).toHaveTextContent('serve-1');
    const withheld = panelOf('2 workers could not build the stored configuration');
    expect(within(withheld).getAllByRole('listitem')).toHaveLength(2);
    expect(withheld).toHaveTextContent('backend-1');
    expect(withheld).toHaveTextContent('backend-2');
    expect(
      within(withheld).getByText(
        `The stored configuration did not build on these workers, so they keep running their current configuration and were not restarted: a restart may fail the same way. Fix the stored configuration, or the cause the build error names, then restart them through ${SUPERVISOR}.`,
      ),
    ).toBeInTheDocument();
    const unstated = panelOf('1 worker has settings it has not applied');
    expect(within(unstated).getAllByRole('listitem')).toHaveLength(1);
    expect(unstated).toHaveTextContent('serve-2');
  });

  it('never tells a withheld worker that it needs or waits for a restart', () => {
    render(
      <FleetReport
        summary={{
          ...awaiting,
          awaiting: [{ name: 'backend-1', keys: ['K'], reading: 'withheld' }],
        }}
      />,
    );
    const panel = panelOf('1 worker could not build the stored configuration');
    expect(
      within(panel).getByText(
        `The stored configuration did not build on this worker, so it keeps running its current configuration and was not restarted: a restart may fail the same way. Fix the stored configuration, or the cause the build error names, then restart it through ${SUPERVISOR}.`,
      ),
    ).toBeInTheDocument();
    const row = within(panel).getByRole('listitem');
    expect(row).toHaveTextContent('backend-1has not applied:K');
    expect(panel).not.toHaveTextContent('needs a restart');
    expect(panel).not.toHaveTextContent('waits for a restart');
  });

  it('gives a worker the reply does not place the guidance that holds either way', () => {
    render(
      <FleetReport
        summary={{
          ...awaiting,
          awaiting: [{ name: 'backend-1', keys: ['K'], reading: 'unstated' }],
        }}
      />,
    );
    const panel = panelOf('1 worker has settings it has not applied');
    expect(
      within(panel).getByText(
        `These settings take effect only when this worker restarts. If its new build failed, fix the stored configuration first, since a restart may fail the same way. Then restart it through ${SUPERVISOR}.`,
      ),
    ).toBeInTheDocument();
    expect(within(panel).getByRole('listitem')).toHaveTextContent('backend-1has not applied:K');
  });

  it('agrees the words with several workers the reply does not place', () => {
    render(
      <FleetReport
        summary={{
          ...awaiting,
          awaiting: [
            { name: 'backend-1', keys: ['K'], reading: 'unstated' },
            { name: 'backend-2', keys: ['K'], reading: 'unstated' },
          ],
        }}
      />,
    );
    const panel = panelOf('2 workers have settings they have not applied');
    expect(
      within(panel).getByText(
        `These settings take effect only when these workers restart. If a worker’s new build failed, fix the stored configuration first, since a restart may fail the same way. Then restart them through ${SUPERVISOR}.`,
      ),
    ).toBeInTheDocument();
  });
});

describe('FleetReport — a worker whose reload was refused at its epoch build', () => {
  const summary = (failures: FleetReportSummary['failures']): FleetReportSummary => ({
    restartsPending: [],
    reloadsUnconfirmed: [],
    spanReleaseError: null,
    status: 'degraded',
    awaiting: [],
    note: null,
    failures,
    error: null,
  });
  const WITHHELD_ONE =
    'The stored configuration did not build on this worker, so it keeps running its current configuration. Trying again may be refused the same way: first fix the stored configuration, or the cause the build error names.';
  const held = (name: string) =>
    ({ name, outcome: 'failed', message: 'epoch build refused', withheld: true }) as const;

  it('tells a withheld worker to fix the configuration, never to reload again', () => {
    render(<FleetReport summary={summary([held('serve-a')])} />);
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText(WITHHELD_ONE)).toBeInTheDocument();
    expect(within(alert).getByText('serve-a')).toBeInTheDocument();
    expect(alert).not.toHaveTextContent('reload the fleet');
  });

  it('words the advice for several withheld workers', () => {
    render(<FleetReport summary={summary([held('serve-a'), held('serve-b')])} />);
    expect(
      within(screen.getByRole('alert')).getByText(
        'The stored configuration did not build on these workers, so they keep running their current configuration. Trying again may be refused the same way: first fix the stored configuration, or the cause the build error names.',
      ),
    ).toBeInTheDocument();
  });

  it('gives each worker of a mix its own next step', () => {
    render(
      <FleetReport
        summary={summary([
          held('serve-a'),
          { name: 'serve-b', outcome: 'timed_out', message: null, withheld: false },
        ])}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(within(alert).getByText('2 workers did not converge', { exact: false })).toBeTruthy();
    const retry = within(alert).getByText(
      'This worker may still be running the old config — reload the fleet from the System page to converge it.',
    );
    const withheld = within(alert).getByText(WITHHELD_ONE);
    expect(retry.nextElementSibling).toHaveTextContent('serve-b');
    expect(retry.nextElementSibling).not.toHaveTextContent('serve-a');
    expect(withheld.nextElementSibling).toHaveTextContent('serve-a');
    expect(withheld.nextElementSibling).not.toHaveTextContent('serve-b');
  });
});

describe('FleetReport — an unreleased write span', () => {
  it('says the write landed and what the held lock can do, with the store error', () => {
    render(
      <FleetReport
        summary={{
          restartsPending: [],
          reloadsUnconfirmed: [],
          spanReleaseError: 'tai42/toolbox: OSError: release failed',
          status: 'converged',
          awaiting: [],
          note: null,
          failures: [],
          error: null,
        }}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The config store did not release its write lock');
    expect(
      within(alert).getByText(
        'The write landed, but the store may hold its write lock until the server process that wrote it exits. Until then another config change can wait or be refused.',
      ),
    ).toBeInTheDocument();
    expect(within(alert).getByText('tai42/toolbox: OSError: release failed')).toBeInTheDocument();
  });
});
