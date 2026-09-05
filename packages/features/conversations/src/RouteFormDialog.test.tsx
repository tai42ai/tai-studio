/**
 * The route create/edit dialog: the blank render, the target/door conditional
 * fields (an agent target hides the tool-only jq fields; each door shows only its
 * own delivery fields), the jq expression door rendering through an injected
 * `ExpressionFieldContext`, the flat wire body a submit sends, the inline
 * required-field guard, edit prefill with a read-only name, and the shown-once
 * `callback_secret` reveal for an api-door write.
 */
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExpressionFieldContext, type ExpressionFieldProps } from '@tai42/studio-sdk';

import { RouteFormDialog } from './RouteFormDialog';
import { makeRoute, renderWithProviders } from './test-utils';

/**
 * A stable stub expression door: it satisfies `ExpressionFieldProps` and renders a
 * plain labelled textarea, so a test can prove the form routed an
 * `x-tai42-expression` field through the injected door WITHOUT pulling in the real
 * jq subgraph.
 */
function StubExpressionField({ label, value, onChange }: ExpressionFieldProps): ReactNode {
  return (
    <label>
      {label}
      <textarea
        data-testid="jq-stub"
        aria-label={label}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </label>
  );
}

// Every case drives a full Radix dialog flow (portal mount, combobox pickers,
// multi-field typing); loaded CI runners overrun the default timeout, so the
// whole file gets explicit headroom.
vi.setConfig({ testTimeout: 15_000 });

/** Open a discriminated-union variant picker inside the named field group. */
async function pickVariant(
  user: ReturnType<typeof userEvent.setup>,
  groupName: string,
  optionName: string,
): Promise<void> {
  // The picker's accessible name derives from the union's discriminator (e.g.
  // "Target kind", "Door"), so scope to the group's single combobox instead of
  // pinning a label.
  const group = screen.getByRole('group', { name: groupName });
  await user.click(within(group).getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: optionName }));
}

describe('RouteFormDialog — create', () => {
  it('renders the blank create form with the identity, target, door, and key fields', () => {
    renderWithProviders(<RouteFormDialog onClose={vi.fn()} />, { client: {} });

    expect(screen.getByRole('textbox', { name: 'Route name' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Target' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Door' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Execution key' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create route' })).toBeInTheDocument();
  });

  it('shows the tool-only jq fields for a tool target and hides them for an agent', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RouteFormDialog onClose={vi.fn()} />, { client: {} });

    await pickVariant(user, 'Target', 'agent');
    expect(screen.getByRole('textbox', { name: /^Agent name\b/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Payload expression' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Reply expression' })).not.toBeInTheDocument();

    await pickVariant(user, 'Target', 'tool');
    expect(screen.getByRole('textbox', { name: /^Tool name\b/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Payload expression' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reply expression' })).toBeInTheDocument();
  });

  it('shows only the api door field for the api door and the channel fields for channel', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RouteFormDialog onClose={vi.fn()} />, { client: {} });

    await pickVariant(user, 'Door', 'api');
    expect(screen.getByRole('textbox', { name: /^Callback URL\b/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^Channel\b/ })).not.toBeInTheDocument();

    await pickVariant(user, 'Door', 'channel');
    expect(screen.getByRole('textbox', { name: /^Channel\b/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Our identity\b/ })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^Callback URL\b/ })).not.toBeInTheDocument();
  });

  it('renders the jq expression door through an injected ExpressionFieldContext', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ExpressionFieldContext.Provider value={StubExpressionField}>
        <RouteFormDialog onClose={vi.fn()} />
      </ExpressionFieldContext.Provider>,
      { client: {} },
    );

    // No expression fields exist until a tool target is chosen.
    expect(screen.queryAllByTestId('jq-stub')).toHaveLength(0);
    await pickVariant(user, 'Target', 'tool');

    const doors = screen.getAllByTestId('jq-stub');
    expect(doors).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: 'Payload expression' })).toBe(doors[0]);
    expect(screen.getByRole('textbox', { name: 'Reply expression' })).toBe(doors[1]);
  });

  it('sends the flat wire body a tool + channel route composes on submit', async () => {
    const user = userEvent.setup();
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: true,
      route_name: 'support',
      route: makeRoute(),
      callback_secret: null,
    });
    renderWithProviders(<RouteFormDialog onClose={vi.fn()} />, {
      client: { createOrReplaceConversationRoute },
    });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'support');
    await pickVariant(user, 'Target', 'tool');
    await user.type(screen.getByRole('textbox', { name: /^Tool name\b/ }), 'lookup_order');
    await pickVariant(user, 'Door', 'channel');
    await user.type(screen.getByRole('textbox', { name: /^Channel\b/ }), 'whatsapp');
    await user.type(screen.getByRole('textbox', { name: /^Our identity\b/ }), '+15550000000');
    await user.type(screen.getByRole('textbox', { name: 'Execution key' }), 'svc-support');
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledWith({
        route_name: 'support',
        door: 'channel',
        target_kind: 'tool',
        target_name: 'lookup_order',
        payload_expr: null,
        reply_expr: null,
        initial_mode: 'agent',
        execution_key: 'svc-support',
        channel: 'whatsapp',
        our_identity: '+15550000000',
        callback_url: null,
        turns_per_hour_override: null,
        error_reply_text: null,
      });
    });
  });

  it('blocks submit with inline errors and never calls the API when required fields are blank', async () => {
    const user = userEvent.setup();
    const createOrReplaceConversationRoute = vi.fn();
    renderWithProviders(<RouteFormDialog onClose={vi.fn()} />, {
      client: { createOrReplaceConversationRoute },
    });

    await user.click(screen.getByRole('button', { name: 'Create route' }));

    expect(
      await screen.findByText('A route name is required.', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('An execution key is required.')).toBeInTheDocument();
    expect(createOrReplaceConversationRoute).not.toHaveBeenCalled();
  });

  it('rejects a non-slug route name locally before any request', async () => {
    const user = userEvent.setup();
    const createOrReplaceConversationRoute = vi.fn();
    renderWithProviders(<RouteFormDialog onClose={vi.fn()} />, {
      client: { createOrReplaceConversationRoute },
    });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'Not A Slug');
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    expect(
      await screen.findByText(
        'Use a ":"-free slug: lowercase letters, digits, and hyphens only.',
        undefined,
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(createOrReplaceConversationRoute).not.toHaveBeenCalled();
  });

  it('rejects a non-https callback URL locally before any request', async () => {
    const user = userEvent.setup();
    const createOrReplaceConversationRoute = vi.fn();
    renderWithProviders(<RouteFormDialog onClose={vi.fn()} />, {
      client: { createOrReplaceConversationRoute },
    });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'account');
    await pickVariant(user, 'Target', 'agent');
    await user.type(screen.getByRole('textbox', { name: /^Agent name\b/ }), 'assistant');
    await pickVariant(user, 'Door', 'api');
    await user.type(
      screen.getByRole('textbox', { name: /^Callback URL\b/ }),
      'http://sink.example/cb',
    );
    await user.type(screen.getByRole('textbox', { name: 'Execution key' }), 'svc-account');
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    expect(
      await screen.findByText('Must be an absolute https URL.', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(createOrReplaceConversationRoute).not.toHaveBeenCalled();
  });

  it('reveals the api-door callback secret once, then closes on Done', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: true,
      route_name: 'account',
      route: makeRoute({ route_name: 'account', door: 'api' }),
      callback_secret: 'super-secret-token',
    });
    renderWithProviders(<RouteFormDialog onClose={onClose} />, {
      client: { createOrReplaceConversationRoute },
    });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'account');
    await pickVariant(user, 'Target', 'agent');
    await user.type(screen.getByRole('textbox', { name: /^Agent name\b/ }), 'assistant');
    await pickVariant(user, 'Door', 'api');
    await user.type(
      screen.getByRole('textbox', { name: /^Callback URL\b/ }),
      'https://sink.example/cb',
    );
    await user.type(screen.getByRole('textbox', { name: 'Execution key' }), 'svc-account');
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    expect(await screen.findByText('super-secret-token')).toBeInTheDocument();
    expect(screen.getByText(/Shown once/)).toBeInTheDocument();
    // The reveal did not auto-close; Done does.
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the revealed secret on Escape, then closes only on the explicit Done', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: true,
      route_name: 'account',
      route: makeRoute({ route_name: 'account', door: 'api' }),
      callback_secret: 'super-secret-token',
    });
    renderWithProviders(<RouteFormDialog onClose={onClose} />, {
      client: { createOrReplaceConversationRoute },
    });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'account');
    await pickVariant(user, 'Target', 'agent');
    await user.type(screen.getByRole('textbox', { name: /^Agent name\b/ }), 'assistant');
    await pickVariant(user, 'Door', 'api');
    await user.type(
      screen.getByRole('textbox', { name: /^Callback URL\b/ }),
      'https://sink.example/cb',
    );
    await user.type(screen.getByRole('textbox', { name: 'Execution key' }), 'svc-account');
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    // Reach the shown-once callback-secret reveal.
    expect(await screen.findByText('super-secret-token')).toBeInTheDocument();

    // Escape must NOT dismiss the reveal — the secret cannot be re-read.
    await user.keyboard('{Escape}');
    expect(screen.getByText('super-secret-token')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // The explicit Done is the only way out.
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('RouteFormDialog — edit', () => {
  const existing = makeRoute({
    route_name: 'chat',
    door: 'api',
    channel: null,
    our_identity: null,
    callback_url: 'https://sink.example/answers',
    target_kind: 'tool',
    target_name: 'lookup_account',
    payload_expr: '.message',
    reply_expr: null,
    initial_mode: 'manual',
    execution_key: 'svc-chat',
  });

  it('prefills from the route and shows the name read-only', () => {
    renderWithProviders(<RouteFormDialog initial={existing} onClose={vi.fn()} />, { client: {} });

    const name = screen.getByDisplayValue('chat');
    expect(name).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /^Tool name\b/ })).toHaveValue('lookup_account');
    expect(screen.getByRole('textbox', { name: 'Payload expression' })).toHaveValue('.message');
    expect(screen.getByRole('textbox', { name: /^Callback URL\b/ })).toHaveValue(
      'https://sink.example/answers',
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('saves back over the same route on submit', async () => {
    const user = userEvent.setup();
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: false,
      route_name: 'chat',
      route: existing,
      callback_secret: 'rotated-secret',
    });
    renderWithProviders(<RouteFormDialog initial={existing} onClose={vi.fn()} />, {
      client: { createOrReplaceConversationRoute },
    });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          route_name: 'chat',
          door: 'api',
          target_kind: 'tool',
          target_name: 'lookup_account',
          payload_expr: '.message',
          initial_mode: 'manual',
          callback_url: 'https://sink.example/answers',
        }),
      );
    });
    // An api-door save rotates the secret — the reveal shows the new one.
    expect(await screen.findByText('rotated-secret')).toBeInTheDocument();
  });
});
