/** The report both reload doors mount: the headline read from the summary and roll, and the roll. */
import type {
  FleetReportSummary,
  FleetWorkerAwaitingRespawn,
  RecycleRoll,
} from '@tai42/api-client';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FleetReloadReport } from './fleet-reload-report';

const converged: FleetReportSummary = {
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
        summary={converged}
        recycle={{ recycle: [], skipped: ['w1'], fresh: [], recycle_stopped: null }}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Reload converged across the fleet.');
    expect(screen.getByRole('region', { name: 'Worker recycle' })).toHaveTextContent(
      'No worker was recycled.',
    );
  });

  it('does not call a stopped roll converged and shows where it stopped', () => {
    render(<FleetReloadReport summary={converged} recycle={stoppedRoll} />);
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
    render(<FleetReloadReport summary={{ ...converged, awaiting: workers }} recycle={recycle} />);
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
        summary={{
          ...converged,
          status: 'degraded',
          failures: [{ name: 'w1', outcome: 'timed_out', message: null, withheld: false }],
        }}
        recycle={stoppedRoll}
      />,
    );
    expect(screen.queryByText(/The reload was applied/)).toBeNull();
    expect(screen.getByText('1 worker did not converge')).toBeInTheDocument();
    expect(screen.getByTestId('recycle-stopped')).toBeInTheDocument();
  });

  it('shows no roll section for a reload that ran no roll', () => {
    render(<FleetReloadReport summary={converged} recycle={null} />);
    expect(screen.queryByRole('region', { name: 'Worker recycle' })).toBeNull();
  });
});
