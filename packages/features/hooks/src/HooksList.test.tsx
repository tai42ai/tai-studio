/**
 * Behavioural tests for {@link HooksList}'s per-row Edit door: every row exposes
 * Edit alongside Delete, Edit opens the register form prefilled from that row in a
 * dialog, and a save posts through `registerHook` and closes on success.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HooksList } from './HooksList';
import { apiKey, hook, renderWithProviders, type StubApiClient } from './test-utils';

describe('HooksList — row doors', () => {
  it('renders an Edit door alongside Delete on every row', async () => {
    const client: StubApiClient = {
      listHooks: vi.fn().mockResolvedValue({
        items: [hook({ name: 'notify-event' })],
        total: 1,
        trigger_auth: {},
      }),
    };
    renderWithProviders(<HooksList topic="" />, { client });

    expect(
      await screen.findByRole('button', { name: 'Edit hook notify-event' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete hook notify-event' })).toBeInTheDocument();
  });

  it('opens the Edit dialog prefilled from the row and saves it through registerHook', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'notify-event' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({
        items: [
          hook({
            name: 'notify-event',
            topic: 'events.created',
            tool: 'slack.post_message',
            execution_key: 'svc-events',
          }),
        ],
        total: 1,
        trigger_auth: {},
      }),
      registerHook,
    };
    renderWithProviders(<HooksList topic="" />, { client });

    await user.click(await screen.findByRole('button', { name: 'Edit hook notify-event' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit hook' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('notify-event');
    expect(within(dialog).getByLabelText('Tool')).toHaveValue('slack.post_message');

    // Save stays gated until the execution-key list resolves; wait it out.
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeEnabled(),
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledOnce();
    });
    expect(registerHook).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'notify-event', topic: 'events.created' }),
    );
    // Close-on-success: the dialog is gone once the save resolves.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit hook' })).not.toBeInTheDocument(),
    );
  });
});

describe('HooksList — low-emphasis row destructive controls', () => {
  it('wears the ghost style on the row Delete and the verifier Unbind, not filled danger', async () => {
    const client: StubApiClient = {
      listHooks: vi.fn().mockResolvedValue({
        items: [hook({ name: 'notify-event', topic: 'events.created' })],
        total: 1,
        topic_verifiers: {
          'events.created': { verifier: 'hmac-sha256', config: {} },
        },
      }),
    };
    renderWithProviders(<HooksList topic="" />, { client });

    // Routine destructive controls in a persistent table/list stay low-emphasis; the
    // danger emphasis lives on the confirm dialog's confirm button, not the row control.
    const rowDelete = await screen.findByRole('button', { name: 'Delete hook notify-event' });
    expect(rowDelete).toHaveClass('tai-btn-ghost');
    expect(rowDelete).not.toHaveClass('tai-btn-danger');

    const unbind = screen.getByRole('button', { name: 'Unbind verifier from events.created' });
    expect(unbind).toHaveClass('tai-btn-ghost');
    expect(unbind).not.toHaveClass('tai-btn-danger');
  });
});
