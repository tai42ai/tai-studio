/**
 * A link that names a schedule (`?schedule=`) lands on its row: the row is marked
 * `aria-current` on the accent tint, and a name the list does not hold says so.
 */
import { ApiError } from '@tai42/api-client';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SchedulingPage } from './SchedulingPage';
import { makeClient, renderWithProviders, schedule } from './test-utils';

function client() {
  return makeClient({
    listSchedules: vi
      .fn()
      .mockResolvedValue([schedule({ name: 'nightly-report' }), schedule({ name: 'hourly-sync' })]),
    getServerDateTime: vi.fn().mockRejectedValue(new ApiError('no server time', 501)),
  });
}

describe('SchedulingPage — landing on a named schedule', () => {
  it('marks the named row and no other', async () => {
    renderWithProviders(<SchedulingPage search={{ schedule: 'hourly-sync' }} />, {
      client: client(),
    });
    const cell = await screen.findByText('hourly-sync');
    expect(cell.closest('tr')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('nightly-report').closest('tr')).not.toHaveAttribute('aria-current');
    expect(screen.queryByText(/^No schedule named/)).not.toBeInTheDocument();
  });

  it('says so when the list holds no schedule by that name', async () => {
    renderWithProviders(<SchedulingPage search={{ schedule: 'gone' }} />, { client: client() });
    expect(await screen.findByText("No schedule named 'gone'.")).toBeInTheDocument();
    expect(document.querySelector('tr[aria-current]')).toBeNull();
  });
});
