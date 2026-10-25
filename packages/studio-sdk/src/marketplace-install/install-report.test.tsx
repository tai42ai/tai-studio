/**
 * The install report: the fleet report for the fan-out summary, and the worker
 * recycle section only when the reload recycled workers.
 */
import type { FleetReportSummary, RecycleRoll } from '@tai42/api-client';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { InstallReport } from './install-report';

const degraded: FleetReportSummary = {
  status: 'degraded',
  note: null,
  failures: [{ name: 'serve-a', outcome: 'missing', message: null }],
  error: null,
  awaiting: [],
  spanReleaseError: null,
};

const roll: RecycleRoll = {
  recycle: [
    { name: 'serve-a', kind: 'serve', status: 'recycled', generation_before: 1, detail: null },
    { name: 'serve-b', kind: 'serve', status: 'self-deferred', generation_before: 3, detail: null },
  ],
  fresh: [],
  recycle_stopped: null,
};

describe('InstallReport', () => {
  it('renders the fleet report and no recycle section without a roll', () => {
    render(<InstallReport summary={degraded} recycle={null} />);
    expect(within(screen.getByRole('alert')).getByText('serve-a')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Worker recycle' })).toBeNull();
  });

  it('renders the recycle roll with the self-recycling writer note', () => {
    render(<InstallReport summary={null} recycle={roll} />);
    const section = screen.getByRole('region', { name: 'Worker recycle' });
    expect(within(section).getByTestId('apply-recycle')).toBeInTheDocument();
    expect(
      within(section).getByText('this worker recycles itself after replying'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
