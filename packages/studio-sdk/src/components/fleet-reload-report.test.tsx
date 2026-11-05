/** The report both reload doors mount: the headline read from the summary and roll, and the roll. */
import type {
  FleetReloadNamedWorker,
  FleetReloadSummary,
  FleetReloadWorkerStatement,
  FleetWorkerAwaitingRespawn,
  RecycleRoll,
} from '@tai42/api-client';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FleetReloadReport } from './fleet-reload-report';

const converged: FleetReloadSummary = {
  reach: { kind: 'fleet' },
  status: 'converged',
  note: null,
  failures: [],
  error: null,
  awaiting: [],
  restartsPending: [],
  reloadsUnconfirmed: [],
  spanReleaseError: null,
};

const stoppedRoll: RecycleRoll = {
  recycle: [
    {
      name: 'w1',
      kind: 'serve',
      status: 'timed-out',
      generation_before: 1,
      keys: ['K'],
      detail: 'old life still present',
    },
  ],
  skipped: [],
  fresh: [],
  recycle_stopped: { kind: 'serve', name: 'w1', detail: 'old life still present' },
};

describe('FleetReloadReport', () => {
  it('reads converged when every worker applied and none is left behind', () => {
    render(
      <FleetReloadReport
        scope="reload"
        summary={converged}
        recycle={{ recycle: [], skipped: ['w1'], fresh: [], recycle_stopped: null }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Reload converged across the fleet.');
    expect(screen.getByRole('region', { name: 'Worker recycle — reload' })).toHaveTextContent(
      'No worker was recycled.',
    );
  });

  it('reads a worker alone on the worker bus as that one worker', () => {
    render(
      <FleetReloadReport
        scope="reload"
        summary={{ ...converged, reach: { kind: 'alone-on-bus' } }}
        recycle={null}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /^Reload applied\. Only this worker reloaded; no other worker was on the worker bus when it ran\.$/,
    );
  });

  it('reads a deployment with no worker bus as that one worker', () => {
    render(
      <FleetReloadReport
        scope="reload"
        summary={{ ...converged, reach: { kind: 'no-bus' } }}
        recycle={null}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /^Reload applied\. Only this worker reloaded; no worker bus is configured\.$/,
    );
  });

  it.each([
    [1, 'Reload converged on the selected worker.'],
    [2, 'Reload converged on the 2 selected workers.'],
  ])('names a selection of %i as its scope, never the fleet', (count, line) => {
    render(
      <FleetReloadReport
        scope="reload"
        summary={{ ...converged, reach: { kind: 'selected', count } }}
        recycle={null}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(line);
  });

  describe('one row with no other worker named', () => {
    const reach = { kind: 'one-row', worker: 'w1', others: [] } as const;
    const ROW_FACT = "This reload's report has a row only for w1.";

    it('states the row alone on the success line', () => {
      render(<FleetReloadReport scope="reload" summary={{ ...converged, reach }} recycle={null} />);
      expect(screen.getByRole('status').textContent).toBe(ROW_FACT);
    });

    it('closes the warning of a roll stopped on no named worker with it', () => {
      render(
        <FleetReloadReport
          scope="reload"
          summary={{ ...converged, reach }}
          recycle={{
            recycle: [],
            skipped: [],
            fresh: [],
            recycle_stopped: { kind: 'backend', name: null, detail: 'bus unreachable' },
          }}
        />,
      );
      expect(screen.getByRole('status').textContent).toBe(
        `The worker restarts stopped before they finished. ${ROW_FACT}`,
      );
    });
  });

  describe('one row beside other workers the reply names', () => {
    const ROW_FACT = "This reload's report has a row only for w1.";
    const COVERED = `${ROW_FACT} The sections below cover w2.`;
    const NEW_LIFE =
      'A new life of w2 came up during this reload; the report ties it to no restart and says nothing else about it.';
    const HANDED_OFF =
      "w2 takes over the worker restarts after this reply, so this report cannot state their outcome; w2's log holds it.";
    const line = {
      name: 'w2',
      kind: 'serve',
      status: 'recycled' as const,
      generation_before: 1,
      keys: ['K'],
      detail: null,
    };
    const roll = { recycle: [], skipped: [], fresh: [], recycle_stopped: null };
    const named = (statement: FleetReloadWorkerStatement, name = 'w2') =>
      ({ name, statement }) as const;
    const reachOf = (...others: FleetReloadNamedWorker[]) =>
      ({ kind: 'one-row', worker: 'w1', others }) as const;

    const headline = (): HTMLElement => screen.getByRole('status');
    const isGreen = (): boolean => !headline().classList.contains('tai-status-warn');

    it('points a recycled line at the roll that states it, on the success line', () => {
      render(
        <FleetReloadReport
          summary={{ ...converged, reach: reachOf(named('recycled')) }}
          recycle={{ ...roll, recycle: [line] }}
          scope="reload"
        />,
      );
      expect(headline().textContent).toBe(COVERED);
      expect(isGreen()).toBe(true);
    });

    it('states a skipped worker on the success line, beside the empty roll it agrees with', () => {
      render(
        <FleetReloadReport
          summary={{ ...converged, reach: reachOf(named('confirmed-clean')) }}
          recycle={{ ...roll, skipped: ['w2'] }}
          scope="reload"
        />,
      );
      expect(headline().textContent).toBe(
        `${ROW_FACT} w2 confirmed it needs no restart and was left running.`,
      );
      expect(isGreen()).toBe(true);
      expect(screen.getByText('No worker was recycled.')).toBeInTheDocument();
    });

    it('states several skipped workers in the plural', () => {
      render(
        <FleetReloadReport
          summary={{
            ...converged,
            reach: reachOf(named('confirmed-clean'), named('confirmed-clean', 'w3')),
          }}
          recycle={{ ...roll, skipped: ['w2', 'w3'] }}
          scope="reload"
        />,
      );
      expect(headline().textContent).toBe(
        `${ROW_FACT} w2, w3 confirmed they need no restart and were left running.`,
      );
    });

    it('warns on a new life, whose outcome the reply does not state', () => {
      render(
        <FleetReloadReport
          summary={{ ...converged, reach: reachOf(named('new-life')) }}
          recycle={{ ...roll, fresh: [{ name: 'w2', kind: 'serve', generation: 2 }] }}
          scope="reload"
        />,
      );
      expect(headline().textContent).toBe(`${ROW_FACT} ${NEW_LIFE}`);
      expect(isGreen()).toBe(false);
      expect(screen.getByText('No worker was recycled.')).toBeInTheDocument();
    });

    it('states several new lives in the plural', () => {
      render(
        <FleetReloadReport
          summary={{ ...converged, reach: reachOf(named('new-life'), named('new-life', 'w3')) }}
          recycle={roll}
          scope="reload"
        />,
      );
      expect(headline().textContent).toBe(
        `${ROW_FACT} New lives of w2, w3 came up during this reload; the report ties them to no restart and says nothing else about them.`,
      );
    });

    it('warns on a roll handed to the other worker, with no roll section', () => {
      render(
        <FleetReloadReport
          summary={{ ...converged, reach: reachOf(named('roll-handed-off')) }}
          recycle={null}
          scope="reload"
        />,
      );
      expect(headline().textContent).toBe(`${ROW_FACT} ${HANDED_OFF}`);
      expect(isGreen()).toBe(false);
      expect(screen.queryByText('No worker was recycled.')).toBeNull();
    });

    it('warns on a line the roll did not confirm, whatever else the reply lacks', () => {
      render(
        <FleetReloadReport
          summary={{ ...converged, reach: reachOf(named('outcome-open')) }}
          recycle={{ ...roll, recycle: [{ ...line, status: 'withheld' }] }}
          scope="reload"
        />,
      );
      expect(headline().textContent).toBe(COVERED);
      expect(isGreen()).toBe(false);
    });

    it('closes the warning of an awaiting worker with it and claims no applied reload', () => {
      render(
        <FleetReloadReport
          summary={{
            ...converged,
            reach: reachOf(named('outcome-open')),
            awaiting: [{ name: 'w2', keys: ['K'], reading: 'restartable' }],
          }}
          recycle={null}
          scope="reload"
        />,
      );
      expect(screen.getByText(`1 worker still needs a restart. ${COVERED}`)).toBeInTheDocument();
    });

    it('closes the warning of a stopped roll with it and claims no applied reload', () => {
      render(
        <FleetReloadReport
          summary={{ ...converged, reach: reachOf(named('outcome-open')) }}
          recycle={{
            ...roll,
            recycle_stopped: { kind: 'serve', name: 'w2', detail: 'old life still present' },
          }}
          scope="reload"
        />,
      );
      expect(headline().textContent).toBe(
        `The worker restarts stopped before they finished. ${COVERED}`,
      );
    });

    it('covers a recycled line and a line that did not finish in one sentence', () => {
      render(
        <FleetReloadReport
          summary={{
            ...converged,
            reach: reachOf(named('recycled'), named('outcome-open', 'w3')),
          }}
          recycle={{
            ...roll,
            recycle: [line, { ...line, name: 'w3', status: 'timed-out' }],
            recycle_stopped: { kind: 'serve', name: 'w3', detail: 'old life still present' },
          }}
          scope="reload"
        />,
      );
      expect(headline().textContent).toBe(
        `The worker restarts stopped before they finished. ${ROW_FACT} The sections below cover w2, w3.`,
      );
    });

    it('states each way the reply names several workers, in one line', () => {
      render(
        <FleetReloadReport
          summary={{
            ...converged,
            reach: reachOf(
              named('new-life', 'w4'),
              named('confirmed-clean', 'w3'),
              named('recycled'),
            ),
          }}
          recycle={{ ...roll, recycle: [line], skipped: ['w3'] }}
          scope="reload"
        />,
      );
      expect(headline().textContent).toBe(
        `${COVERED} w3 confirmed it needs no restart and was left running. A new life of w4 came up during this reload; the report ties it to no restart and says nothing else about it.`,
      );
      expect(isGreen()).toBe(false);
    });
  });

  it('carries the lone worker reach on the warning of a worker that still needs a restart', () => {
    render(
      <FleetReloadReport
        scope="reload"
        summary={{
          ...converged,
          reach: { kind: 'alone-on-bus' },
          awaiting: [{ name: 'w1', keys: ['K'], reading: 'restartable' }],
        }}
        recycle={null}
      />,
    );
    expect(
      screen.getByText(
        'The reload was applied. 1 worker still needs a restart. This reload reached only this worker; no other worker was on the worker bus when it ran.',
      ),
    ).toBeVisible();
  });

  it('carries the no-bus reach on the warning of a worker that still needs a restart', () => {
    render(
      <FleetReloadReport
        scope="reload"
        summary={{
          ...converged,
          reach: { kind: 'no-bus' },
          awaiting: [{ name: 'w1', keys: ['K'], reading: 'restartable' }],
        }}
        recycle={null}
      />,
    );
    expect(
      screen.getByText(
        'The reload was applied. 1 worker still needs a restart. This reload reached only this worker; no worker bus is configured.',
      ),
    ).toBeVisible();
  });

  it('carries the selected reach on the warning, counting the workers selected', () => {
    const awaiting = [{ name: 'w1', keys: ['K'], reading: 'restartable' as const }];
    const { rerender } = render(
      <FleetReloadReport
        scope="reload"
        summary={{ ...converged, reach: { kind: 'selected', count: 1 }, awaiting }}
        recycle={null}
      />,
    );
    expect(
      screen.getByText(
        'The reload was applied. 1 worker still needs a restart. This reload targeted the selected worker.',
      ),
    ).toBeVisible();

    rerender(
      <FleetReloadReport
        scope="reload"
        summary={{ ...converged, reach: { kind: 'selected', count: 3 }, awaiting }}
        recycle={null}
      />,
    );
    expect(
      screen.getByText(
        'The reload was applied. 1 worker still needs a restart. This reload targeted the 3 selected workers.',
      ),
    ).toBeVisible();
  });

  it('carries the reach on a warning that does not say the reload was applied', () => {
    render(
      <FleetReloadReport
        scope="reload"
        summary={{
          ...converged,
          reach: { kind: 'no-bus' },
          awaiting: [{ name: 'w1', keys: ['K'], reading: 'withheld' }],
        }}
        recycle={null}
      />,
    );
    expect(
      screen.getByText(
        'The stored configuration did not build on 1 worker, which keeps its current configuration. This reload reached only this worker; no worker bus is configured.',
      ),
    ).toBeVisible();
  });

  it('adds no reach to the warning of a reload that covered the fleet', () => {
    render(
      <FleetReloadReport
        scope="reload"
        summary={{
          ...converged,
          awaiting: [{ name: 'w1', keys: ['K'], reading: 'restartable' }],
        }}
        recycle={null}
      />,
    );
    expect(
      screen.getByText('The reload was applied. 1 worker still needs a restart.'),
    ).toBeVisible();
  });

  it('does not call a stopped roll converged and shows where it stopped', () => {
    render(<FleetReloadReport scope="reload" summary={converged} recycle={stoppedRoll} />);
    expect(
      screen.getByText('The reload was applied. The worker restarts stopped before they finished.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Reload converged across the fleet.')).toBeNull();
    expect(screen.getByTestId('recycle-stopped')).toHaveTextContent(
      'The recycle stopped at w1 (serve workers)',
    );
  });

  const restartable = (name: string): FleetWorkerAwaitingRespawn => ({
    name,
    keys: ['K'],
    reading: 'restartable',
  });
  const withheld = (name: string): FleetWorkerAwaitingRespawn => ({
    name,
    keys: ['K'],
    reading: 'withheld',
  });
  const unstated = (name: string): FleetWorkerAwaitingRespawn => ({
    name,
    keys: ['K'],
    reading: 'unstated',
  });

  it.each<[string, readonly FleetWorkerAwaitingRespawn[], RecycleRoll | null, string]>([
    [
      'one restartable worker',
      [restartable('w1')],
      null,
      'The reload was applied. 1 worker still needs a restart.',
    ],
    [
      'several restartable workers',
      [restartable('w1'), restartable('w2')],
      null,
      'The reload was applied. 2 workers still need a restart.',
    ],
    [
      'a stopped roll and a restartable worker',
      [restartable('w1')],
      stoppedRoll,
      'The reload was applied. The worker restarts stopped before they finished. 1 worker still needs a restart.',
    ],
    [
      'one withheld worker',
      [withheld('w1')],
      null,
      'The stored configuration did not build on 1 worker, which keeps its current configuration.',
    ],
    [
      'several withheld workers',
      [withheld('w1'), withheld('w2')],
      null,
      'The stored configuration did not build on 2 workers, which keep their current configuration.',
    ],
    [
      'a withheld and a restartable worker',
      [withheld('w1'), restartable('w2')],
      null,
      'The stored configuration did not build on 1 worker, which keeps its current configuration. 1 worker still needs a restart.',
    ],
    [
      'a withheld worker and a stopped roll',
      [withheld('w1')],
      stoppedRoll,
      'The stored configuration did not build on 1 worker, which keeps its current configuration. The worker restarts stopped before they finished.',
    ],
    [
      'one worker the reply does not place',
      [unstated('w1')],
      null,
      '1 worker has settings it has not applied.',
    ],
    [
      'several workers the reply does not place',
      [unstated('w1'), unstated('w2')],
      null,
      '2 workers have settings they have not applied.',
    ],
    [
      'every reading and a stopped roll',
      [withheld('w1'), restartable('w2'), unstated('w3')],
      stoppedRoll,
      'The stored configuration did not build on 1 worker, which keeps its current configuration. The worker restarts stopped before they finished. 1 worker still needs a restart. 1 worker has settings it has not applied.',
    ],
  ])('reads true for %s', (_case, workers, recycle, headline) => {
    render(
      <FleetReloadReport
        scope="reload"
        summary={{ ...converged, awaiting: workers }}
        recycle={recycle}
      />,
    );
    expect(screen.getByText(headline)).toBeInTheDocument();
    expect(screen.queryByText('Reload converged across the fleet.')).toBeNull();
  });

  it.each<[string, readonly string[], readonly string[], string]>([
    [
      'one deferred restart whose reload applied',
      ['w1'],
      [],
      'The reload was applied. 1 worker restarts once its own in-flight change has replied, which this report cannot confirm.',
    ],
    [
      'several deferred restarts whose reloads applied',
      ['w1', 'w2'],
      [],
      'The reload was applied. 2 workers restart once their own in-flight changes have replied, which this report cannot confirm.',
    ],
    [
      'a deferred restart whose reload did not confirm',
      ['w1'],
      ['w1'],
      '1 worker restarts once its own in-flight change has replied, which this report cannot confirm.',
    ],
    [
      'one worker confirmed clean after its reload did not confirm',
      [],
      ['w1'],
      '1 worker did not confirm the reload at first, then confirmed it needs no restart.',
    ],
    [
      'several workers confirmed clean after their reloads did not confirm',
      [],
      ['w1', 'w2'],
      '2 workers did not confirm the reload at first, then confirmed they need no restart.',
    ],
    [
      'a deferred restart beside a worker confirmed clean',
      ['w1'],
      ['w1', 'w2'],
      '1 worker restarts once its own in-flight change has replied, which this report cannot confirm. 1 worker did not confirm the reload at first, then confirmed it needs no restart.',
    ],
  ])('reads true for %s', (_case, restartsPending, reloadsUnconfirmed, headline) => {
    render(
      <FleetReloadReport
        scope="reload"
        summary={{ ...converged, restartsPending, reloadsUnconfirmed }}
        recycle={null}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`^${headline}$`));
    expect(screen.queryByText('Reload converged across the fleet.')).toBeNull();
  });

  it('leaves a worker that did not apply to the failure panel, keeping the roll', () => {
    render(
      <FleetReloadReport
        scope="reload"
        summary={{
          ...converged,
          status: 'degraded',
          failures: [{ name: 'w1', outcome: 'timed_out', message: null, withheld: false }],
        }}
        recycle={stoppedRoll}
      />,
    );
    expect(screen.queryByText(/The reload was applied/)).toBeNull();
    expect(screen.getByText('1 worker did not converge —')).toBeInTheDocument();
    expect(screen.getByTestId('recycle-stopped')).toBeInTheDocument();
  });

  it('names its restart panel and its roll with the scope a screen gives it', () => {
    render(
      <FleetReloadReport
        summary={{
          ...converged,
          awaiting: [{ name: 'w1', keys: ['K'], reading: 'restartable' }],
        }}
        recycle={stoppedRoll}
        scope="reload"
      />,
    );
    expect(screen.getByRole('region', { name: 'Worker recycle — reload' })).toBeVisible();
    expect(screen.getByText('1 worker needs a restart to apply some settings —')).toHaveTextContent(
      '1 worker needs a restart to apply some settings — reload',
    );
  });

  it('shows no roll section for a reload that ran no roll', () => {
    render(<FleetReloadReport scope="reload" summary={converged} recycle={null} />);
    expect(screen.queryByRole('region', { name: 'Worker recycle — reload' })).toBeNull();
  });
});
