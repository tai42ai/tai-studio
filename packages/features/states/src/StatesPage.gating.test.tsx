/**
 * Feature-OFF gating for the states surface: a deployment with no state store reports
 * the `states` kind `off`, so the whole page shows the muted `FeatureDisabled` note (the
 * server's own remediation line) and never reads the list. With the kind on, the list
 * renders.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

import { StatesPage } from './StatesPage';
import { renderWithProviders, statesOffKind, type StubApiClient } from './test-utils';

function client(): StubApiClient {
  return {
    listStates: vi.fn().mockResolvedValue([]),
    stateConsumers: vi.fn().mockResolvedValue([]),
  };
}

describe('StatesPage — feature gating', () => {
  it('states OFF: shows the FeatureDisabled note in place of the list', async () => {
    renderWithProviders(<StatesPage search={{}} />, {
      client: client(),
      systemKinds: [statesOffKind('Set STATES_DATABASE_URL to enable states.')],
    });

    expect(await screen.findByText('States is not configured')).toBeInTheDocument();
    expect(screen.getByText('Set STATES_DATABASE_URL to enable states.')).toBeInTheDocument();
    // Once the kind table settles OFF, the list surface is gone.
    expect(screen.queryByText('No states declared')).not.toBeInTheDocument();
  });

  it('states on: renders the list surface', async () => {
    renderWithProviders(<StatesPage search={{}} />, {
      client: client(),
      systemKinds: [{ kind: 'states', state: 'active', plugin: null, detail: '' }],
    });

    expect(await screen.findByText('No states declared')).toBeInTheDocument();
  });
});
