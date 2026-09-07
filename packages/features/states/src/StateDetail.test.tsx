/**
 * The per-state detail: the header (name, description, subject-kind badges), the tab
 * switch (navigating `?tab=`), the Delete-state danger flow, and the not-found / OFF
 * branches of the composite read.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tai42/api-client';

import { StateDetail } from './StateDetail';
import { renderWithProviders, type StubApiClient } from './test-utils';

function detail(over: Record<string, unknown> = {}) {
  return {
    name: 'profile',
    description: 'A person profile',
    schema: { type: 'object' },
    subject_kinds: ['person', 'thread'],
    default_subject_kind: 'person',
    retention_days: null,
    effective_schema: { type: 'object' },
    regimes: [],
    mounts: [],
    ...over,
  };
}

function client(over: Partial<StubApiClient> = {}): StubApiClient {
  return {
    getState: vi.fn().mockResolvedValue(detail()),
    getStateStats: vi.fn().mockResolvedValue({ records: 0 }),
    ...over,
  };
}

describe('StateDetail', () => {
  it('renders the header and the default Declaration tab', async () => {
    renderWithProviders(<StateDetail name="profile" tab={undefined} />, { client: client() });
    expect(await screen.findByRole('heading', { name: 'profile', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('A person profile')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Declaration' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switching a tab navigates ?tab=', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<StateDetail name="profile" tab={undefined} />, {
      client: client(),
    });
    await user.click(await screen.findByRole('tab', { name: 'Consumers' }));
    expect(navigate).toHaveBeenCalledWith('states', { state: 'profile', tab: 'consumers' });
  });

  it('Delete state confirms, deletes, and clears the selection', async () => {
    const user = userEvent.setup();
    const deleteState = vi.fn().mockResolvedValue({ name: 'profile', deleted: true });
    const { navigate } = renderWithProviders(<StateDetail name="profile" tab={undefined} />, {
      client: client({ deleteState }),
    });
    await user.click(await screen.findByRole('button', { name: 'Delete state' }));
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(deleteState).toHaveBeenCalledWith('profile');
    expect(navigate).toHaveBeenCalledWith('states', {});
  });

  it('a 404 shows the not-found empty state', async () => {
    renderWithProviders(<StateDetail name="ghost" tab={undefined} />, {
      client: { getState: vi.fn().mockRejectedValue(new ApiError('missing', 404)) },
    });
    expect(await screen.findByText("No state named 'ghost'")).toBeInTheDocument();
  });

  it('a 501 shows FeatureDisabled', async () => {
    renderWithProviders(<StateDetail name="profile" tab={undefined} />, {
      client: { getState: vi.fn().mockRejectedValue(new ApiError('no store', 501)) },
    });
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
  });
});
