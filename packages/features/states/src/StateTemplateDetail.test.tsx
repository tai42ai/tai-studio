import { ApiError, schemas, type StateTemplateDocument } from '@tai42/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { StateTemplateDetail } from './StateTemplateDetail';
import { renderWithProviders, type StubApiClient } from './test-utils';

function doc(overrides: Partial<StateTemplateDocument> = {}): StateTemplateDocument {
  return {
    kind: 'state-template',
    name: 'tally',
    description: 'A running tally.',
    parameters: {
      ceiling: { schema: { type: 'number' }, default: 100 },
      floor: { schema: { type: 'number' } },
    },
    schema: { type: 'object', properties: { tally: { type: 'number' } } },
    regimes: [
      { path: ['tally'], regime: 'single' },
      { path: [], regime: 'free' },
    ],
    declarations: {
      schema: { type: 'object', properties: { tally: { type: 'number' } } },
      check: { content: '.tally >= 0' },
    },
    trace: { enabled: false },
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
    expect(screen.getByRole('columnheader', { name: 'Regime' })).toBeInTheDocument();
    expect(screen.getByText('single')).toBeInTheDocument();
    expect(screen.getByText('(root)')).toBeInTheDocument();
    expect(screen.getByText('Check')).toBeInTheDocument();
    expect(screen.getByText('Parameters')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Schema' })).toBeInTheDocument();
    expect(screen.getByText('ceiling')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    // A parameter with no default reads "—", never a null.
    const floorRow = screen.getByText('floor').closest('tr');
    expect(floorRow).not.toBeNull();
    expect(floorRow?.textContent).toContain('—');
    expect(floorRow?.textContent).not.toContain('null');
    expect(screen.getByTestId('template-trace')).toHaveTextContent('Trace writes: Off');
  });

  it('joins a nested regime path and shows traced writes', async () => {
    const client: StubApiClient = {
      getStateTemplate: vi.fn().mockResolvedValue(
        doc({
          regimes: [{ path: ['a', '*', 'b'], regime: 'composing' }],
          trace: { enabled: true },
        }),
      ),
    };
    renderWithProviders(<StateTemplateDetail name="tally" />, { client });
    await screen.findByTestId('state-template-detail');
    expect(screen.getByText('a / * / b')).toBeInTheDocument();
    expect(screen.getByText('composing')).toBeInTheDocument();
    expect(screen.getByTestId('template-trace')).toHaveTextContent('Trace writes: On');
  });

  it('parses a served document so a parameter without a default stays without one', () => {
    const served = schemas.stateTemplateDocument.parse({
      name: 'tally',
      schema: { type: 'object' },
      parameters: { floor: { schema: { type: 'number' } }, nil: { schema: {}, default: null } },
    });
    expect(Object.keys(served.parameters.floor ?? {})).not.toContain('default');
    expect(Object.keys(served.parameters.nil ?? {})).toContain('default');
    expect(served.trace).toBeUndefined();
  });

  it('renders a stored-reference fragment schema as a read-only reference', async () => {
    const client: StubApiClient = {
      getStateTemplate: vi
        .fn()
        .mockResolvedValue(doc({ schema: { id: 'prefs-schema', kwargs: { locale: 'en' } } })),
    };
    renderWithProviders(<StateTemplateDetail name="tally" />, { client });
    await screen.findByTestId('state-template-detail');
    expect(screen.getByText('Stored template')).toBeInTheDocument();
    expect(screen.getByText('prefs-schema')).toBeInTheDocument();
    // The render parameters are shown, and the source is named (a template serves no resolved
    // schema, so the note states the schema is rendered from the stored template).
    expect(screen.getByText('locale')).toBeInTheDocument();
    expect(
      screen.getByText('The schema is rendered from this stored template.'),
    ).toBeInTheDocument();
  });

  it('lists template jq by name, purpose, description and params/writes on the Jq tab', async () => {
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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
