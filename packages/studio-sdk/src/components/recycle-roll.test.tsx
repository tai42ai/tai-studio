/** Behavioural tests for the shared recycle-roll section. */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RecycleRollSection } from './recycle-roll';

const SUPERVISOR = 'Restart them through your deployment’s supervisor.';

describe('RecycleRollSection', () => {
  it('states that no worker was recycled for an empty roll', () => {
    render(<RecycleRollSection roll={{ recycle: [], fresh: [], recycle_stopped: null }} />);
    expect(screen.getByRole('region', { name: 'Worker recycle' })).toHaveTextContent(
      'Worker recycleNo worker was recycled.',
    );
  });

  it('names the part of the operation the roll belongs to after the heading', () => {
    render(
      <RecycleRollSection roll={{ recycle: [], fresh: [], recycle_stopped: null }} scope="env" />,
    );
    expect(screen.getByRole('region', { name: 'Worker recycle — env' })).toBeInTheDocument();
  });

  it('explains the restarts and notes a self-deferred line, joining a fresh life', () => {
    render(
      <RecycleRollSection
        roll={{
          recycle: [
            {
              name: 'backend-1',
              kind: 'backend',
              status: 'recycled',
              generation_before: 3,
              keys: ['TAI_KEY'],
              detail: null,
            },
            {
              name: 'serve-1',
              kind: 'serve',
              status: 'self-deferred',
              generation_before: 2,
              keys: ['TAI_KEY'],
              detail: null,
            },
          ],
          fresh: [{ name: 'backend-1', kind: 'backend', generation: 4 }],
          recycle_stopped: null,
        }}
      />,
    );
    const section = screen.getByRole('region', { name: 'Worker recycle' });
    expect(
      within(section).getByText(
        'Some changed settings take effect only in a fresh worker process, so the fleet restarts the workers that need it, one at a time.',
      ),
    ).toBeInTheDocument();
    const rows = within(section).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('life 3 to 4');
    expect(rows[1]).toHaveTextContent(
      'restarts once its own in-flight change has replied, which this report cannot confirm',
    );
  });
});

describe('RecycleRollSection — a stopped roll', () => {
  it('names the target the roll stopped at and the workers it did not recycle', () => {
    render(
      <RecycleRollSection
        roll={{
          recycle: [
            {
              name: 'serve-2',
              kind: 'serve',
              status: 'timed-out',
              generation_before: 1,
              keys: ['TAI_KEY'],
              detail: 'old life still present',
            },
          ],
          fresh: [],
          recycle_stopped: { kind: 'serve', name: 'serve-2', detail: 'old life still present' },
        }}
      />,
    );
    const panel = screen.getByTestId('recycle-stopped');
    expect(panel).toHaveTextContent('The recycle stopped at serve-2 (serve workers)');
    expect(panel).toHaveTextContent(
      `serve-2 was not confirmed recycled, and any workers after it were not recycled. ${SUPERVISOR}`,
    );
  });

  it('names no worker when the roll stopped with no target in hand', () => {
    render(
      <RecycleRollSection
        roll={{
          recycle: [],
          fresh: [],
          recycle_stopped: { kind: 'backend', name: null, detail: 'bus unreachable' },
        }}
      />,
    );
    const panel = screen.getByTestId('recycle-stopped');
    expect(panel).toHaveTextContent(
      'The recycle stopped before it reached its next worker (backend workers)',
    );
    expect(panel).toHaveTextContent('bus unreachable');
    expect(panel).toHaveTextContent(
      `The workers it did not reach were not recycled. ${SUPERVISOR}`,
    );
  });
});
