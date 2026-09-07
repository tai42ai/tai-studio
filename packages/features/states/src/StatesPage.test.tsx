/**
 * The page shell routes between the master/detail split and the record page: a bare page
 * shows the list and the no-selection prompt; `?state=` mounts the detail; `?state=` plus
 * `?subject=`/`?target=` mounts the record page.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

import { StatesPage } from './StatesPage';
import { renderWithProviders, type StubApiClient } from './test-utils';

function client(over: Partial<StubApiClient> = {}): StubApiClient {
  return {
    listStates: vi.fn().mockResolvedValue([]),
    stateConsumers: vi.fn().mockResolvedValue([]),
    getState: vi.fn().mockResolvedValue({
      name: 'profile',
      description: 'A profile',
      schema: {},
      subject_kinds: ['person'],
      default_subject_kind: 'person',
      retention_days: null,
      effective_schema: {},
      regimes: [],
      mounts: [],
    }),
    getStateStats: vi.fn().mockResolvedValue({ records: 0 }),
    getStateRecord: vi.fn().mockResolvedValue({
      state: 'profile',
      subject: { target_kind: 'agent', target_name: 'assistant', kind: 'person', key: 'p-1' },
      data: { tone: 'warm' },
      seq: 1,
      canonical_subject: {
        target_kind: 'agent',
        target_name: 'assistant',
        kind: 'person',
        key: 'p-1',
      },
      folded_from: [],
    }),
    listStateWrites: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
    ...over,
  };
}

describe('StatesPage routing', () => {
  it('a bare page shows the list and the no-selection prompt', async () => {
    renderWithProviders(<StatesPage search={{}} />, { client: client() });
    expect(await screen.findByText('No states declared')).toBeInTheDocument();
    expect(screen.getByText('No state selected')).toBeInTheDocument();
  });

  it('?state= mounts the detail pane', async () => {
    renderWithProviders(<StatesPage search={{ state: 'profile' }} />, { client: client() });
    expect(await screen.findByTestId('state-detail')).toBeInTheDocument();
  });

  it('?state= + ?subject= + ?target= mounts the record page', async () => {
    renderWithProviders(
      <StatesPage
        search={{ state: 'profile', subject: 'person:p-1', target: 'agent:assistant' }}
      />,
      { client: client() },
    );
    expect(await screen.findByTestId('record-page')).toBeInTheDocument();
  });
});
