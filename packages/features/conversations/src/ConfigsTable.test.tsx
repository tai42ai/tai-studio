/**
 * The per-target config surface's state machine and its CRUD flows — loading, the
 * loud failure, the 403/404 capability boundaries, the empty state, the rows, and
 * create / edit / delete behind the confirm — mirroring the route table's coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tai42/api-client';

import { ConfigsTable } from './ConfigsTable';
import {
  fullProjection,
  makeConfig,
  renderWithProviders,
  scopedProjection,
  type StubApiClient,
} from './test-utils';

function renderTable(client: StubApiClient) {
  return renderWithProviders(<ConfigsTable />, { client });
}

/** Render the table under a full (admin) projection, so its write affordances show. */
function renderCrud(client: StubApiClient) {
  return renderWithProviders(<ConfigsTable />, { client, projection: fullProjection() });
}

describe('ConfigsTable', () => {
  it('shows a skeleton while the configs load', () => {
    renderTable({ listConversationConfigs: vi.fn().mockReturnValue(new Promise(() => undefined)) });
    expect(document.querySelector('.tai-skeleton')).not.toBeNull();
  });

  it('renders a config row: its target, multichannel flag and greeting', async () => {
    renderTable({
      listConversationConfigs: vi.fn().mockResolvedValue({
        items: [makeConfig({ multichannel: true, greeting_template: 'Hi {pairing_code}' })],
        total: 1,
      }),
    });
    const table = await screen.findByTestId('conversation-configs-table');
    expect(within(table).getByText('agent: assistant')).toBeInTheDocument();
    expect(within(table).getByText('On')).toBeInTheDocument();
    expect(within(table).getByText('Hi {pairing_code}')).toBeInTheDocument();
  });

  it('shows a placeholder where a config carries no greeting', async () => {
    renderTable({
      listConversationConfigs: vi
        .fn()
        .mockResolvedValue({ items: [makeConfig({ greeting_template: null })], total: 1 }),
    });
    const table = await screen.findByTestId('conversation-configs-table');
    expect(within(table).getByText('—')).toBeInTheDocument();
    expect(within(table).getByText('Off')).toBeInTheDocument();
  });

  it('explains an empty catalogue rather than a bare table', async () => {
    renderTable({ listConversationConfigs: vi.fn().mockResolvedValue({ items: [], total: 0 }) });
    expect(await screen.findByText('No per-target configs')).toBeInTheDocument();
  });

  it('raises a real failure loudly and offers a retry', async () => {
    const user = userEvent.setup();
    const list = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('backend exploded', 500))
      .mockResolvedValue({ items: [makeConfig()], total: 1 });
    renderTable({ listConversationConfigs: list });
    expect(await screen.findByRole('alert')).toHaveTextContent('backend exploded');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('conversation-configs-table')).toBeInTheDocument();
  });

  it('reads a 403 as a capability boundary, not a failure', async () => {
    renderTable({
      listConversationConfigs: vi.fn().mockRejectedValue(new ApiError('forbidden', 403)),
    });
    expect(await screen.findByText('Not available to this session')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('ConfigsTable — CRUD', () => {
  it('opens the blank create dialog and cancels it', async () => {
    const user = userEvent.setup();
    renderCrud({ listConversationConfigs: vi.fn().mockResolvedValue({ items: [], total: 0 }) });

    await user.click(await screen.findByRole('button', { name: 'Create config' }));
    expect(await screen.findByRole('textbox', { name: /Target name/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /Target name/ })).not.toBeInTheDocument();
    });
  });

  it('dismisses the create dialog on Escape', async () => {
    const user = userEvent.setup();
    renderCrud({ listConversationConfigs: vi.fn().mockResolvedValue({ items: [], total: 0 }) });

    await user.click(await screen.findByRole('button', { name: 'Create config' }));
    expect(await screen.findByRole('textbox', { name: /Target name/ })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /Target name/ })).not.toBeInTheDocument();
    });
  });

  it('dismisses the edit dialog on Escape', async () => {
    const user = userEvent.setup();
    renderCrud({
      listConversationConfigs: vi.fn().mockResolvedValue({ items: [makeConfig()], total: 1 }),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit config agent:assistant' }));
    expect(await screen.findByDisplayValue('assistant')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByDisplayValue('assistant')).not.toBeInTheDocument();
    });
  });

  it('opens the edit dialog with the key pinned read-only', async () => {
    const user = userEvent.setup();
    renderCrud({
      listConversationConfigs: vi.fn().mockResolvedValue({ items: [makeConfig()], total: 1 }),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit config agent:assistant' }));
    // The target name rides in as a read-only const field.
    expect(await screen.findByDisplayValue('assistant')).toBeDisabled();
  });

  it('creates a config and refreshes the list', async () => {
    const user = userEvent.setup();
    const setConversationConfig = vi.fn().mockResolvedValue({
      created: true,
      target_kind: 'agent',
      target_name: 'assistant',
      config: makeConfig(),
    });
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 });
    renderCrud({ listConversationConfigs: list, setConversationConfig });

    await user.click(await screen.findByRole('button', { name: 'Create config' }));
    await user.type(await screen.findByRole('textbox', { name: /Target name/ }), 'assistant');
    // The card button and the dialog's submit share a label; scope to the dialog.
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Create config' }));

    await waitFor(() => {
      expect(setConversationConfig).toHaveBeenCalled();
    });
    // The default target_kind ('agent') and the typed name reach the body.
    expect(setConversationConfig.mock.calls[0]?.[0]).toMatchObject({
      target_name: 'assistant',
      multichannel: false,
      greeting_template: null,
    });
    await waitFor(() => {
      expect(list.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('blocks a create with a blank target name (no API call)', async () => {
    const user = userEvent.setup();
    const setConversationConfig = vi.fn();
    renderCrud({
      listConversationConfigs: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      setConversationConfig,
    });

    await user.click(await screen.findByRole('button', { name: 'Create config' }));
    await screen.findByRole('textbox', { name: /Target name/ });
    // Submit without a name (scope to the dialog — the card button shares the label).
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Create config' }));

    expect(await screen.findByText('A target name is required.')).toBeInTheDocument();
    expect(setConversationConfig).not.toHaveBeenCalled();
  });

  it('deletes a config behind the confirm and refreshes the list', async () => {
    const user = userEvent.setup();
    const deleteConversationConfig = vi
      .fn()
      .mockResolvedValue({ removed: true, target_kind: 'agent', target_name: 'assistant' });
    const list = vi.fn().mockResolvedValue({ items: [makeConfig()], total: 1 });
    renderCrud({ listConversationConfigs: list, deleteConversationConfig });

    await user.click(await screen.findByRole('button', { name: 'Delete config agent:assistant' }));
    expect(screen.getByText(/falls back to the default/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete config' }));
    await waitFor(() => {
      expect(deleteConversationConfig).toHaveBeenCalledWith('agent', 'assistant');
    });
    await waitFor(() => {
      expect(list.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('surfaces a delete failure loudly and keeps the confirm open', async () => {
    const user = userEvent.setup();
    const deleteConversationConfig = vi
      .fn()
      .mockRejectedValue(new ApiError('config is locked', 409));
    renderCrud({
      listConversationConfigs: vi.fn().mockResolvedValue({ items: [makeConfig()], total: 1 }),
      deleteConversationConfig,
    });

    await user.click(await screen.findByRole('button', { name: 'Delete config agent:assistant' }));
    await user.click(screen.getByRole('button', { name: 'Delete config' }));

    expect(await screen.findByText('config is locked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete config' })).toBeInTheDocument();
  });

  it("does not leak a failed delete error into a different config's confirm", async () => {
    const user = userEvent.setup();
    const deleteConversationConfig = vi
      .fn()
      .mockRejectedValue(new ApiError('config is locked', 409));
    renderCrud({
      listConversationConfigs: vi.fn().mockResolvedValue({
        items: [
          makeConfig({ target_kind: 'agent', target_name: 'alpha' }),
          makeConfig({ target_kind: 'tool', target_name: 'beta' }),
        ],
        total: 2,
      }),
      deleteConversationConfig,
    });

    await user.click(await screen.findByRole('button', { name: 'Delete config agent:alpha' }));
    await user.click(screen.getByRole('button', { name: 'Delete config' }));
    expect(await screen.findByText('config is locked')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText(/falls back to the default/)).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Delete config tool:beta' }));

    expect(screen.getByText(/falls back to the default/)).toBeInTheDocument();
    expect(screen.queryByText('config is locked')).not.toBeInTheDocument();
  });

  it('cancels a pending delete without calling the API', async () => {
    const user = userEvent.setup();
    const deleteConversationConfig = vi.fn();
    renderCrud({
      listConversationConfigs: vi.fn().mockResolvedValue({ items: [makeConfig()], total: 1 }),
      deleteConversationConfig,
    });

    await user.click(await screen.findByRole('button', { name: 'Delete config agent:assistant' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByText(/falls back to the default/)).not.toBeInTheDocument();
    });
    expect(deleteConversationConfig).not.toHaveBeenCalled();
  });
});

describe('ConfigsTable — write gating (projection ⊆ gate)', () => {
  it('withdraws create, edit and delete for a read-only projection', async () => {
    // A scoped, non-admin projection reaches no config write door, so every control that
    // could only 403 on submit is withdrawn — the read table itself stays visible.
    renderWithProviders(<ConfigsTable />, {
      client: {
        listConversationConfigs: vi.fn().mockResolvedValue({ items: [makeConfig()], total: 1 }),
      },
      projection: scopedProjection(),
    });

    // The row (a read surface) renders…
    expect(await screen.findByTestId('conversation-configs-table')).toBeInTheDocument();
    expect(screen.getByText('agent: assistant')).toBeInTheDocument();
    // …but no write affordance is offered.
    expect(screen.queryByRole('button', { name: 'Create config' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit config agent:assistant' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Delete config agent:assistant' }),
    ).not.toBeInTheDocument();
  });

  it('offers create, edit and delete for a full (admin) projection', async () => {
    // The harness defaults to a total (admin) projection.
    renderCrud({
      listConversationConfigs: vi.fn().mockResolvedValue({ items: [makeConfig()], total: 1 }),
    });

    expect(
      await screen.findByRole('button', { name: 'Edit config agent:assistant' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create config' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete config agent:assistant' }),
    ).toBeInTheDocument();
  });
});
