/**
 * The page shell routes between the master/detail split and the record page: a bare page
 * shows the list and the no-selection prompt; `?state=` mounts the detail; `?state=` plus
 * `?subject=`/`?target=` mounts the record page.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PENDING_SAVES_CARD_ID } from './PendingSavesCard';
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
      attachments: [],
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
    listPendingSaves: vi
      .fn()
      .mockResolvedValue({ items: [], next_cursor: null, outstanding: 0, failed: 0 }),
    ...over,
  };
}

const INTRO =
  "A state is a declared JSON document kept per subject and checked against its schema on every write. A preset, conversation route, hook or schedule that binds a state reads the record into the run's input before the run and writes the result back after it; plugins and the API write records too, and you can edit one here. Each state's Consumers tab lists what binds it.";

describe('StatesPage header', () => {
  it('sits under Doors and says what a state is and who reads and writes it', async () => {
    renderWithProviders(<StatesPage search={{}} />, { client: client() });
    expect(await screen.findByText(INTRO)).toBeInTheDocument();
    expect(screen.getByText('Doors')).toBeInTheDocument();
  });
});

describe('StatesPage routing', () => {
  it('a bare page shows the list and the no-selection prompt', async () => {
    renderWithProviders(<StatesPage search={{}} />, { client: client() });
    expect(await screen.findByText('No states declared')).toBeInTheDocument();
    expect(screen.getByText('No state selected')).toBeInTheDocument();
  });

  it('the pending saves card sits on every pane', async () => {
    renderWithProviders(<StatesPage search={{ state: 'profile' }} />, { client: client() });
    expect(
      await screen.findByText('No pending saves. Every state write has been applied.'),
    ).toBeInTheDocument();
    expect(document.getElementById(PENDING_SAVES_CARD_ID)).not.toBeNull();
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
