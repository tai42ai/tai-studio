import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type StateTemplateDocument } from '@tai42/api-client';

import { StateTemplateDetail } from './StateTemplateDetail';
import { renderWithProviders, type StubApiClient } from './test-utils';

function doc(overrides: Partial<StateTemplateDocument> = {}): StateTemplateDocument {
  return {
    kind: 'state-template',
    name: 'tally',
    description: 'A running tally.',
    parameters: { ceiling: 100 },
    schema: { type: 'object', properties: { tally: { type: 'number' } } },
    regimes: [{ path: ['tally'], policy: 'single' }],
    declarations: {
      schema: { type: 'object', properties: { tally: { type: 'number' } } },
      check: { content: '.tally >= 0' },
    },
    trace: {},
    template_jq: {
      current: {
        description: 'the head',
        purpose: 'input',
        params: ['as_of'],
        reads: [],
        writes: [],
        jq: { content: '.tally' },
      },
      bump: {
        description: 'add',
        purpose: 'update',
        params: ['amount'],
        reads: [],
        writes: [['tally']],
        jq: { content: '[{op:"inc"}]' },
      },
    },
    reconcile: null,
    ...overrides,
  };
}

describe('StateTemplateDetail', () => {
  it('renders the Template tab: fields, write policies, check and parameters', async () => {
    const client: StubApiClient = { getStateTemplate: vi.fn().mockResolvedValue(doc()) };
    renderWithProviders(<StateTemplateDetail name="tally" />, { client });
    await screen.findByTestId('state-template-detail');
    expect(screen.getByText('Fields')).toBeInTheDocument();
    expect(screen.getByText('Write policies')).toBeInTheDocument();
    expect(screen.getByText('single')).toBeInTheDocument();
    expect(screen.getByText('Check')).toBeInTheDocument();
    expect(screen.getByText('Parameters')).toBeInTheDocument();
    expect(screen.getByText('ceiling')).toBeInTheDocument();
  });

  it('lists template jq by name, purpose, description and params/writes on the Jq tab', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = { getStateTemplate: vi.fn().mockResolvedValue(doc()) };
    renderWithProviders(<StateTemplateDetail name="tally" />, { client });
    await screen.findByTestId('state-template-detail');
    await user.click(screen.getByRole('tab', { name: 'Jq' }));
    expect(screen.getByText('current')).toBeInTheDocument();
    expect(screen.getByText('input')).toBeInTheDocument();
    expect(screen.getByText('update')).toBeInTheDocument();
    // The input jq shows its params; the update jq shows its writes.
    expect(screen.getByText('as_of')).toBeInTheDocument();
    expect(screen.getAllByText('tally').length).toBeGreaterThan(0);
    // Each row's jq is behind a keyboard-native disclosure.
    expect(screen.getByLabelText('Show jq for bump')).toBeInTheDocument();
  });

  it('shows the empty jq state when the template declares none', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      getStateTemplate: vi.fn().mockResolvedValue(doc({ template_jq: null })),
    };
    renderWithProviders(<StateTemplateDetail name="tally" />, { client });
    await screen.findByTestId('state-template-detail');
    await user.click(screen.getByRole('tab', { name: 'Jq' }));
    expect(screen.getByText('No template jq')).toBeInTheDocument();
  });

  it('shows a not-found empty state on a 404', async () => {
    const client: StubApiClient = {
      getStateTemplate: vi.fn().mockRejectedValue(new ApiError('nope', 404)),
    };
    renderWithProviders(<StateTemplateDetail name="ghost" />, { client });
    await waitFor(() => {
      expect(screen.getByText("No template named 'ghost'")).toBeInTheDocument();
    });
  });

  it('shows the error state on a non-404 failure', async () => {
    const client: StubApiClient = {
      getStateTemplate: vi.fn().mockRejectedValue(new Error('boom')),
    };
    renderWithProviders(<StateTemplateDetail name="tally" />, { client });
    await waitFor(() => {
      expect(screen.getByText("Couldn't load this template.")).toBeInTheDocument();
    });
  });
});
