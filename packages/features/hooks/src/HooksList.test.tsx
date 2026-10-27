/**
 * Behavioural tests for {@link HooksList}'s per-row Edit door: every row exposes
 * Edit alongside Delete, Edit opens the register form prefilled from that row in a
 * dialog, and a save posts through `registerHook` and closes on success.
 */
import { ApiError } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { HooksList } from './HooksList';
import {
  accountSessionProjection,
  apiKey,
  clickWhenInteractable,
  hook,
  keySessionProjection,
  renderWithProviders,
  type StubApiClient,
} from './test-utils';

describe('HooksList — row doors', () => {
  it('renders an Edit door alongside Delete on every row', async () => {
    const client: StubApiClient = {
      listHooks: vi.fn().mockResolvedValue({
        items: [hook({ name: 'notify-event' })],
        total: 1,
        trigger_auth: {},
      }),
    };
    renderWithProviders(<HooksList topic="" />, { client, projection: accountSessionProjection() });

    expect(
      await screen.findByRole('button', { name: 'Edit hook notify-event' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete hook notify-event' })).toBeInTheDocument();
  });

  it('opens the Edit dialog prefilled from the row and saves it through registerHook', async () => {
    const user = userEvent.setup({ delay: null });
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
    renderWithProviders(<HooksList topic="" />, { client, projection: accountSessionProjection() });

    await user.click(await screen.findByRole('button', { name: 'Edit hook notify-event' }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit hook' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('notify-event');
    expect(within(dialog).getByRole('combobox', { name: 'Tool' })).toHaveTextContent(
      'slack.post_message',
    );

    // Save stays gated until the execution-key list resolves; wait it out.
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeEnabled(),
    );
    await clickWhenInteractable(user, within(dialog).getByRole('button', { name: 'Save changes' }));

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
    renderWithProviders(<HooksList topic="" />, { client, projection: accountSessionProjection() });

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

describe('HooksList — editing a hook bound to an unlisted key', () => {
  const UNLISTED_KEY_SESSION =
    'svc-x is not a listed key. The server accepts an unlisted key only when it is your own identity; any other value is refused on save.';
  const UNLISTED_ACCOUNT =
    'svc-x is not a listed key. The server accepts only an api key you own; any other value is refused on save.';
  const NOT_YOURS =
    "svc-x is not this session's identity (alice), so the server will refuse it on save.";

  function editClient(
    listTokensPayload: StubApiClient['listTokensPayload'],
    registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'notify-event' }),
  ) {
    const client: StubApiClient = {
      listTokensPayload,
      listHooks: vi.fn().mockResolvedValue({
        items: [hook({ name: 'notify-event', execution_key: 'svc-x' })],
        total: 1,
        trigger_auth: {},
      }),
      registerHook,
    };
    return { client, registerHook };
  }

  async function openEdit(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
    await user.click(await screen.findByRole('button', { name: 'Edit hook notify-event' }));
    return screen.findByRole('dialog', { name: 'Edit hook' });
  }

  it('a key session sees both lines, a refused save, and a listed pick clearing them', async () => {
    const user = userEvent.setup({ delay: null });
    const registerHook = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError('you may only bind your own identity or an execution key you own', 403),
      )
      .mockResolvedValue({ registered: true, name: 'notify-event' });
    const { client } = editClient(
      vi.fn().mockResolvedValue([apiKey({ user_id: 'svc-a' })]),
      registerHook,
    );
    renderWithProviders(<HooksList topic="" />, {
      client,
      projection: keySessionProjection({ user_id: 'alice' }),
    });

    const dialog = await openEdit(user);
    const picker = await within(dialog).findByRole('combobox', { name: 'Execution key' });
    await waitFor(() => {
      expect(picker).toHaveTextContent('svc-x (not a listed key)');
    });
    expect(within(dialog).getByText('not a listed key')).toBeInTheDocument();
    expect(within(dialog).getByText(UNLISTED_KEY_SESSION)).toBeInTheDocument();
    expect(within(dialog).getByText('not your identity')).toBeInTheDocument();
    expect(within(dialog).getByText(NOT_YOURS)).toBeInTheDocument();

    const save = within(dialog).getByRole('button', { name: 'Save changes' });
    await clickWhenInteractable(user, save);
    expect(
      await within(dialog).findByText(
        /you may only bind your own identity or an execution key you own/,
      ),
    ).toBeInTheDocument();

    await user.click(picker);
    await user.click(await screen.findByRole('option', { name: /^svc-a/ }));
    expect(within(dialog).queryByText(UNLISTED_KEY_SESSION)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(NOT_YOURS)).not.toBeInTheDocument();
    await clickWhenInteractable(user, save);
    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledTimes(2);
    });
    expect(registerHook.mock.calls[1]?.[0]).toMatchObject({ execution_key: 'svc-a' });
  });

  it('an account session over no keys keeps the stored key as the sole flagged option', async () => {
    const user = userEvent.setup({ delay: null });
    const { client } = editClient(vi.fn().mockResolvedValue([]));
    renderWithProviders(<HooksList topic="" />, {
      client,
      projection: accountSessionProjection(),
    });

    const dialog = await openEdit(user);
    const picker = await within(dialog).findByRole('combobox', { name: 'Execution key' });
    await waitFor(() => {
      expect(picker).toHaveTextContent('svc-x (not a listed key)');
    });
    expect(within(dialog).getByText(UNLISTED_ACCOUNT)).toBeInTheDocument();
    expect(within(dialog).getByText(NOT_YOURS)).toBeInTheDocument();
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeEnabled();
    });
    await user.click(picker);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'svc-x (not a listed key)',
    ]);
  });

  it('under a refused key list the stored key stays unflagged above the no-grant note', async () => {
    const user = userEvent.setup({ delay: null });
    const { client, registerHook } = editClient(
      vi.fn().mockRejectedValue(new ApiError('forbidden', 403)),
    );
    renderWithProviders(<HooksList topic="" />, {
      client,
      projection: keySessionProjection({ user_id: 'alice' }),
    });

    const dialog = await openEdit(user);
    expect(
      await within(dialog).findByText(
        'This session cannot list api keys. Picking one needs read access to GET /api/auth/tokens-payload; ask an administrator to grant it.',
      ),
    ).toBeInTheDocument();
    const picker = within(dialog).getByRole('combobox', { name: 'Execution key' });
    expect(picker).toHaveTextContent('svc-x');
    expect(picker).not.toHaveTextContent('not a listed key');
    expect(within(dialog).queryByText(UNLISTED_KEY_SESSION)).not.toBeInTheDocument();

    await clickWhenInteractable(user, within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledOnce();
    });
    expect(registerHook.mock.calls[0]?.[0]).toMatchObject({ execution_key: 'svc-x' });
  });
});
