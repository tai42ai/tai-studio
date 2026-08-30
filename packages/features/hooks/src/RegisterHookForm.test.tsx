/**
 * Behavioural tests for {@link RegisterHookForm} across its create and edit modes:
 * the inline replace (overwrite) notice when a typed name hits an existing hook,
 * prefill and id-gate preservation on save, the inline charset-400 surface, the
 * edit-dialog Cancel/close contract, and the honest "list unavailable" fallback.
 */
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@tai42/api-client';
import {
  EXPRESSION_EDITOR_CONTRACT_VERSION,
  ExpressionEditorsProvider,
  type ExpressionEditorContribution,
} from '@tai42/studio-sdk';

import { RegisterHookForm } from './RegisterHookForm';
import { apiKey, hook, renderWithProviders, type StubApiClient } from './test-utils';

/** A registered fake jq editor: enough for a field to grow its visual-editor door. */
function withJqEditor(node: ReactElement): ReactElement {
  const editors = new Map<string, ExpressionEditorContribution>([
    [
      'jq',
      {
        language: 'jq',
        contractVersion: EXPRESSION_EDITOR_CONTRACT_VERSION,
        load: () => Promise.resolve({ Editor: () => null }),
      },
    ],
  ]);
  return <ExpressionEditorsProvider editors={editors}>{node}</ExpressionEditorsProvider>;
}

/** Open the execution-key Select and pick the seeded svc-events key. */
async function pickExecutionKey(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('combobox', { name: 'Execution key' }));
  await user.click(await screen.findByRole('option', { name: /svc-events/ }));
}

describe('RegisterHookForm — overwrite notice (create)', () => {
  it('warns that a register replaces an existing hook once the typed name collides', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({ items: [hook({ name: 'notify-event' })], total: 1 }),
    };
    renderWithProviders(<RegisterHookForm />, { client });

    // The list must load before overwrite detection is live.
    await waitFor(() => {
      expect(client.listHooks).toHaveBeenCalled();
    });
    expect(screen.queryByText(/current registration is overwritten/)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Name'), 'notify-event');
    expect(await screen.findByText(/current registration is overwritten/)).toBeInTheDocument();

    // A fresh name that hits no existing hook clears the notice.
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'brand-new');
    await waitFor(() =>
      expect(screen.queryByText(/current registration is overwritten/)).not.toBeInTheDocument(),
    );
  });

  it('still allows a register when the hooks list cannot load, with a loud fallback', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'greet' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockRejectedValue(new Error('list boom')),
      registerHook,
    };
    renderWithProviders(<RegisterHookForm />, { client });

    expect(await screen.findByText(/Overwrite detection is/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Name'), 'greet');
    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await user.type(screen.getByLabelText('Tool'), 'notify');
    await pickExecutionKey(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledOnce();
    });
  });
});

describe('RegisterHookForm — edit mode', () => {
  it('prefills from the hook and saves back over it, carrying id-based gates through', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'notify-event' });
    const onClose = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    const initial = hook({
      name: 'notify-event',
      topic: 'events.created',
      tool: 'slack.post_message',
      execution_key: 'svc-events',
      tool_kwargs: { channel: 'ops' },
      // An id-based condition gate the form never renders a control for; it must
      // survive an edit that only touches the inline fields.
      condition_id: 'shape.big-event',
      condition_kwargs: { threshold: 100 },
    });
    renderWithProviders(<RegisterHookForm initial={initial} onClose={onClose} />, { client });

    expect(screen.getByLabelText('Name')).toHaveValue('notify-event');
    expect(screen.getByLabelText('Topic')).toHaveValue('events.created');
    expect(screen.getByLabelText('Tool')).toHaveValue('slack.post_message');
    expect(screen.getByLabelText('Tool kwargs (JSON)')).toHaveValue('{\n  "channel": "ops"\n}');

    // Save stays gated until the execution-key list resolves (an empty list would
    // leave nothing to run as); wait for it before submitting.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledOnce();
    });
    expect(registerHook).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'notify-event',
        topic: 'events.created',
        tool: 'slack.post_message',
        execution_key: 'svc-events',
        tool_kwargs: { channel: 'ops' },
        condition: null,
        condition_id: 'shape.big-event',
        condition_kwargs: { threshold: 100 },
      }),
    );
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it('does not warn on the edited hook itself, only when renamed onto another hook', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({
        items: [hook({ name: 'notify-event' }), hook({ name: 'other-hook' })],
        total: 2,
      }),
      registerHook: vi.fn(),
    };
    renderWithProviders(
      <RegisterHookForm initial={hook({ name: 'notify-event' })} onClose={vi.fn()} />,
      { client },
    );

    await waitFor(() => {
      expect(client.listHooks).toHaveBeenCalled();
    });
    expect(screen.getByLabelText('Name')).toHaveValue('notify-event');
    // Saving over its own name is the edit's whole point — no overwrite notice.
    expect(screen.queryByText(/current registration is overwritten/)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'other-hook');
    expect(await screen.findByText(/current registration is overwritten/)).toBeInTheDocument();
  });

  it('Cancel closes the edit dialog through onClose without registering', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const registerHook = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<RegisterHookForm initial={hook()} onClose={onClose} />, { client });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(registerHook).not.toHaveBeenCalled();
  });
});

describe('RegisterHookForm — jq condition/expr expression fields', () => {
  it('round-trips the inline condition and expr through the jq expression fields', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'greet' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<RegisterHookForm />, { client });

    await user.type(screen.getByLabelText('Name'), 'greet');
    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await user.type(screen.getByLabelText('Tool'), 'notify');
    await user.click(await screen.findByRole('combobox', { name: 'Execution key' }));
    await user.click(await screen.findByRole('option', { name: /svc-events/ }));
    await user.type(screen.getByLabelText('Condition'), '.amount > 100');
    await user.type(screen.getByLabelText('Expr'), '.message.text');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledOnce();
    });
    expect(registerHook).toHaveBeenCalledWith(
      expect.objectContaining({ condition: '.amount > 100', expr: '.message.text' }),
    );
  });

  it('grows a visual-editor door on each jq field only when a jq editor is registered', async () => {
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    // No provider: the fields stay plain inputs, no launcher.
    const { unmount } = renderWithProviders(<RegisterHookForm />, { client });
    expect(
      screen.queryByRole('button', { name: /open the visual editor for condition/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /open the visual editor for expr/i }),
    ).not.toBeInTheDocument();
    unmount();

    // With a registered jq editor: each field grows its door.
    renderWithProviders(withJqEditor(<RegisterHookForm />), { client });
    expect(
      await screen.findByRole('button', { name: /open the visual editor for condition/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /open the visual editor for expr/i }),
    ).toBeInTheDocument();
  });
});

describe('RegisterHookForm — charset rule', () => {
  it("surfaces the backend's name/topic charset 400 loudly and inline", async () => {
    const user = userEvent.setup();
    const message = 'hook name may only contain letters, digits, ., _ and -';
    const registerHook = vi.fn().mockRejectedValue(new ApiError(message, 400));
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<RegisterHookForm />, { client });

    await user.type(screen.getByLabelText('Name'), 'bad/name');
    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await user.type(screen.getByLabelText('Tool'), 'notify');
    await pickExecutionKey(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledOnce();
    });
    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});
