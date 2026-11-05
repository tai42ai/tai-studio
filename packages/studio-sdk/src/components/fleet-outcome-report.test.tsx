/**
 * The fleet outcome report: the fleet report for the fan-out summary, and the worker recycle
 * section only when the change ran a roll.
 */
import type { FleetReportSummary, RecycleRoll } from '@tai42/api-client';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FleetOutcomeReport } from './fleet-outcome-report';

const degraded: FleetReportSummary = {
  status: 'degraded',
  note: null,
  failures: [{ name: 'serve-a', outcome: 'missing', message: null, withheld: false }],
  error: null,
  awaiting: [],
  restartsPending: [],
  reloadsUnconfirmed: [],
  spanReleaseError: null,
};

const roll: RecycleRoll = {
  recycle: [
    {
      name: 'serve-a',
      kind: 'serve',
      status: 'recycled',
      generation_before: 1,
      keys: ['TAI_KEY'],
      detail: null,
    },
    {
      name: 'serve-b',
      kind: 'serve',
      status: 'self-deferred',
      generation_before: 3,
      keys: ['TAI_KEY'],
      detail: null,
    },
  ],
  skipped: [],
  fresh: [],
  recycle_stopped: null,
};

describe('FleetOutcomeReport', () => {
  it('renders the fleet report and no recycle section without a roll', () => {
    render(<FleetOutcomeReport scope="save" summary={degraded} recycle={null} />);
    expect(within(screen.getByRole('alert')).getByText('serve-a')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Worker recycle — save' })).toBeNull();
  });

  it('renders nothing for a change with nothing to report', () => {
    const { container } = render(<FleetOutcomeReport scope="save" summary={null} recycle={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the recycle roll with its self-deferred note', () => {
    render(<FleetOutcomeReport scope="save" summary={null} recycle={roll} />);
    const section = screen.getByRole('region', { name: 'Worker recycle — save' });
    expect(within(section).getByTestId('apply-recycle')).toBeInTheDocument();
    expect(
      within(section).getByText(
        'Some changed settings take effect only in a fresh worker process, so the fleet restarts the workers that need it, one at a time.',
      ),
    ).toBeInTheDocument();
    expect(
      within(section).getByText(
        'restarts once its own in-flight change has replied, which this report cannot confirm',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  const awaiting: FleetReportSummary = {
    ...degraded,
    status: 'converged',
    failures: [],
    awaiting: [{ name: 'serve-a', keys: ['K'], reading: 'restartable' }],
  };

  it('names the restart banner by its scope beside a roll', () => {
    render(<FleetOutcomeReport summary={awaiting} recycle={roll} scope="manifest" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 worker needs a restart to apply some settings — manifest',
    );
    expect(screen.getByRole('region', { name: 'Worker recycle — manifest' })).toBeVisible();
  });

  it('names the restart banner by its scope when the write ran no roll', () => {
    render(<FleetOutcomeReport summary={awaiting} recycle={null} scope="manifest" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 worker needs a restart to apply some settings — manifest',
    );
  });

  it('passes the framing to the fleet report and the scope to the roll', () => {
    render(<FleetOutcomeReport summary={degraded} recycle={roll} action="reload" scope="env" />);
    expect(screen.getByRole('alert')).toHaveTextContent('1 worker did not converge');
    expect(screen.getByRole('region', { name: /Worker recycle/ })).toHaveTextContent('env');
  });
});
