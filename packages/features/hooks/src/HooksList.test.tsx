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
        items: [hook({ name: 'notify-order' })],
        total: 1,
        trigger_auth: {},
      }),
    };
    renderWithProviders(<HooksList topic="" />, { client });

    expect(
      await screen.findByRole('button', { name: 'Edit hook notify-order' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete hook notify-order' })).toBeInTheDocument();
  });

  it('opens the Edit dialog prefilled from the row and saves it through registerHook', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'notify-order' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({
        items: [
          hook({
            name: 'notify-order',
            topic: 'orders.created',
            tool: 'slack.post_message',
            execution_key: 'svc-orders',
          }),
        ],
        total: 1,
        trigger_auth: {},
      }),
      registerHook,
    };
    renderWithProviders(<HooksList topic="" />, { client });

    await user.click(await screen.findByRole('button', { name: 'Edit hook notify-order' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit hook' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('notify-order');
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
      expect.objectContaining({ name: 'notify-order', topic: 'orders.created' }),
    );
    // Close-on-success: the dialog is gone once the save resolves.
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Edit hook' })).not.toBeInTheDocument(),
    );
  });
});
