/**
 * Behavioural tests for the hooks surface. Each test stubs only the client
 * methods the path under test calls and drives the real DS components through
 * TanStack Query, covering: the list (data / empty / error, incl. each row's
 * execution key, and the topic's door from the list map), the topic filter, register (valid submit +
 * invalidation), the loud invalid-JSON field error, the fire-path authorization
 * choices and the server's typed bind refusals, and delete behind a confirm dialog.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@tai42/api-client';

import { HooksPage } from './HooksPage';
import {
  apiKey,
  fullProjection,
  hook,
  renderWithProviders,
  type StubApiClient,
} from './test-utils';

/** Fill every field a registration requires: name, topic, tool, execution key. */
async function fillRegisterRequired(
  user: ReturnType<typeof userEvent.setup>,
  { name = 'greet', topic = 'orders.created', tool = 'notify' } = {},
): Promise<void> {
  await user.type(screen.getByLabelText('Name'), name);
  await user.type(
    within(screen.getByRole('form', { name: 'Register hook' })).getByLabelText('Topic'),
    topic,
  );
  await user.type(screen.getByLabelText('Tool'), tool);
  await user.click(await screen.findByRole('combobox', { name: 'Execution key' }));
  await user.click(await screen.findByRole('option', { name: /svc-orders/ }));
}

describe('HooksPage — list', () => {
  it('renders a row per hook with name / topic / tool and gate badges', async () => {
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({
        items: [
          hook({
            name: 'notify-order',
            topic: 'orders.created',
            tool: 'slack.post_message',
            condition: 'amount > 100',
            expr_id: 'shape.summary',
          }),
        ],
        total: 1,
        trigger_auth: { 'orders.created': 'public' },
      }),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    const row = (await screen.findByText('notify-order')).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText('orders.created')).toBeInTheDocument();
    expect(cells.getByText('slack.post_message')).toBeInTheDocument();
    expect(cells.getByText('condition')).toBeInTheDocument();
    expect(cells.getByText('expr')).toBeInTheDocument();
    expect(cells.getByText('svc-orders')).toBeInTheDocument();
    expect(cells.getByText('Public')).toBeInTheDocument();
  });

  it("renders each row's execution key and its topic's door, including the token combo", async () => {
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({
        items: [
          hook({
            name: 'keyed-hook',
            topic: 'orders.created',
            execution_key: 'svc-least-privilege',
          }),
        ],
        total: 1,
        trigger_auth: { 'orders.created': 'token+api_key' },
      }),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    const row = (await screen.findByText('keyed-hook')).closest('tr');
    const cells = within(row as HTMLElement);
    expect(cells.getByText('svc-least-privilege')).toBeInTheDocument();
    expect(cells.getByText('QR token + api key')).toBeInTheDocument();

    // By index, not by text: a swapped key/door pair still satisfies a text lookup.
    const bodyCells = cells.getAllByRole('cell');
    expect(bodyCells[3]).toHaveTextContent('svc-least-privilege');
    expect(bodyCells[4]).toHaveTextContent('QR token + api key');

    // Headers, in order — a header/body mismatch would silently mislabel the table.
    const headers = within((row as HTMLElement).closest('table') as HTMLElement).getAllByRole(
      'columnheader',
    );
    expect(headers.map((h) => h.textContent)).toEqual([
      'Name',
      'Topic',
      'Tool',
      'Runs as',
      'Trigger auth',
      'Gates',
      '',
    ]);
  });

  it('omits the gate badges when neither condition nor expr is set', async () => {
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [hook({ name: 'plain-hook' })], total: 1 }),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('plain-hook');
    expect(screen.queryByText('condition')).not.toBeInTheDocument();
    expect(screen.queryByText('expr')).not.toBeInTheDocument();
  });

  it('shows the empty state when there are no hooks', async () => {
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    expect(await screen.findByText('No hooks registered')).toBeInTheDocument();
  });

  it('shows a loud error state carrying the real message when the list fails', async () => {
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockRejectedValue(new Error('boom: list failed')),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    // Scoped to the list card: a sibling form warns on the same failed query.
    const list = (await screen.findByRole('heading', { name: 'Registered hooks' })).closest(
      'div',
    ) as HTMLElement;
    expect(await within(list).findByRole('alert')).toHaveTextContent('boom: list failed');
  });
});

describe('HooksPage — topic filter', () => {
  it('refetches with the entered topic as the listHooks argument', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      listHookVerifiers: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    // Initial load lists all hooks with no topic argument.
    await waitFor(() => {
      expect(listHooks).toHaveBeenCalledWith(undefined, expect.anything());
    });

    await user.type(screen.getByLabelText('Filter by topic'), 'orders');

    await waitFor(() => {
      expect(listHooks).toHaveBeenCalledWith('orders', expect.anything());
    });
  });
});

describe('HooksPage — register', () => {
  it('registers a hook with the built params and invalidates the list', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'greet' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      registerHook,
      listHookVerifiers: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await fillRegisterRequired(user);
    await user.type(screen.getByLabelText('Tool kwargs (JSON)'), '{{"channel": "ops"}');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledWith({
        name: 'greet',
        topic: 'orders.created',
        tool: 'notify',
        execution_key: 'svc-orders',
        tool_kwargs: { channel: 'ops' },
        condition: null,
        condition_id: null,
        condition_kwargs: {},
        expr: null,
        expr_id: null,
        expr_kwargs: {},
      });
    });
    // Invalidation refetches the list: the first call was the initial load.
    await waitFor(() => {
      expect(listHooks.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('disables Register while the POST is IN FLIGHT, so a double click cannot register twice', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn().mockReturnValue(new Promise(() => undefined));
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await fillRegisterRequired(user);
    // Held by node, not by name: the pending button renders a spinner label.
    const submit = screen.getByRole('button', { name: 'Register' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);
    expect(registerHook).toHaveBeenCalledTimes(1);
  });

  it('shows a loud field error on invalid tool_kwargs JSON and never calls registerHook', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await fillRegisterRequired(user);
    await user.type(screen.getByLabelText('Tool kwargs (JSON)'), 'not json');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(registerHook).toHaveBeenCalledTimes(0);
  });

  it('shows a loud inline field error for a valid-JSON but non-object tool_kwargs and never calls registerHook', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await fillRegisterRequired(user);
    // Valid JSON, but a string literal — not the required JSON object.
    await user.type(screen.getByLabelText('Tool kwargs (JSON)'), '"x"');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText(/tool_kwargs must be a JSON object\./)).toBeInTheDocument();
    expect(registerHook).toHaveBeenCalledTimes(0);
  });

  it('renders a loud ErrorState when registerHook fails', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn().mockRejectedValue(new Error('register boom'));
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await fillRegisterRequired(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledOnce();
    });
    expect(await screen.findByText('register boom')).toBeInTheDocument();
  });

  it('blocks submit with every required-field error when the form is blank', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText('A name is required.')).toBeInTheDocument();
    expect(screen.getByText('A topic is required.')).toBeInTheDocument();
    expect(screen.getByText('A tool is required.')).toBeInTheDocument();
    expect(screen.getByText('An execution key is required.')).toBeInTheDocument();
    expect(registerHook).toHaveBeenCalledTimes(0);
  });
});

describe('HooksPage — register: execution key + trigger auth', () => {
  it('lists the api-keys surface in the picker, description and mint fingerprint included', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await user.click(await screen.findByRole('combobox', { name: 'Execution key' }));
    expect(
      await screen.findByRole('option', { name: 'svc-orders — Order service key · kf-9f2c1d' }),
    ).toBeInTheDocument();
  });

  it("surfaces the server's pass-role refusal VERBATIM", async () => {
    const user = userEvent.setup();
    const message = 'execution_key svc-orders is not yours to delegate';
    const registerHook = vi.fn().mockRejectedValue(new ApiError(message, 403, 'pass_role'));
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await fillRegisterRequired(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("surfaces the server's token-free-evaluable refusal VERBATIM", async () => {
    const user = userEvent.setup();
    const message =
      'execution_key svc-orders has a request-context-conditional policy and cannot be bound';
    const registerHook = vi
      .fn()
      .mockRejectedValue(new ApiError(message, 400, 'execution_key_not_token_free'));
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await fillRegisterRequired(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('RESETS the bound key after a successful register', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'greet' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await fillRegisterRequired(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledOnce();
    });
    // A privileged key must NOT carry into the next registration.
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Execution key' })).toHaveTextContent(
        'Select an execution key',
      );
    });
  });

  it('nags about nothing before the operator has submitted', async () => {
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue(['shared_secret']),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} }),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByRole('combobox', { name: 'Execution key' });
    expect(screen.queryByText('An execution key is required.')).not.toBeInTheDocument();
    expect(screen.queryByText('A name is required.')).not.toBeInTheDocument();
  });

  it('clears the required-field errors after a successful register', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'greet' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await fillRegisterRequired(user);
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledOnce();
    });
    // The form blanks itself; it must not then paint the blank fields red.
    await waitFor(() => {
      expect(screen.queryByText('A name is required.')).not.toBeInTheDocument();
      expect(screen.queryByText('An execution key is required.')).not.toBeInTheDocument();
    });
  });

  it('clears a stale kwargs error on the next submit, while still mounted', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await fillRegisterRequired(user);
    await user.type(screen.getByLabelText('Tool kwargs (JSON)'), 'not json');
    await user.click(screen.getByRole('button', { name: 'Register' }));
    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();

    // Blanking the name makes the guard return early — only the per-submit reset clears it.
    await user.clear(screen.getByLabelText('Tool kwargs (JSON)'));
    await user.clear(screen.getByLabelText('Name'));
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText('A name is required.')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
    expect(registerHook).not.toHaveBeenCalled();
  });

  it('blocks submit when every field but the execution key is filled', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await user.type(screen.getByLabelText('Name'), 'greet');
    await user.type(
      within(screen.getByRole('form', { name: 'Register hook' })).getByLabelText('Topic'),
      'orders.created',
    );
    await user.type(screen.getByLabelText('Tool'), 'notify');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText('An execution key is required.')).toBeInTheDocument();
    expect(registerHook).not.toHaveBeenCalled();
  });

  it('keeps Register out of reach while the key list loads', async () => {
    const registerHook = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockReturnValue(new Promise(() => undefined)),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
    });
    expect(registerHook).not.toHaveBeenCalled();
  });

  it('keeps Register out of reach when the key list FAILED', async () => {
    const registerHook = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockRejectedValue(new Error('keys boom')),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    expect(await screen.findByText('keys boom')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
    });
    expect(registerHook).not.toHaveBeenCalled();
  });

  it('the list and the bind form share ONE hooks-list cache entry — no parallel fetch', async () => {
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks,
    };
    const { queryClient } = renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    // One cache entry, observed by both surfaces — never a duplicate/parallel key.
    const entries = queryClient.getQueryCache().findAll({ queryKey: ['hooks', ''] });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.observers.length).toBeGreaterThanOrEqual(2);
  });

  it('disables Register and says why when the deployment has no pickable key', async () => {
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    expect(await screen.findByText(/No api keys available to run as/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
  });
});

describe('HooksPage — the dialog opened over the register form', () => {
  it('makes the register form inert, so the pickers cannot collide', async () => {
    const user = userEvent.setup();
    const listTokensPayload = vi.fn().mockResolvedValue([apiKey()]);
    const client: StubApiClient = {
      baseUrl: '',
      listTokensPayload,
      listHookVerifiers: vi.fn().mockResolvedValue(['shared_secret']),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} }),
      listTriggerLinks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const { queryClient } = renderWithProviders(<HooksPage search={{}} />, {
      client,
      projection: fullProjection(),
    });

    // Both forms mount an "Execution key" picker; the modal hides the background one.
    expect(await screen.findByRole('combobox', { name: 'Execution key' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create trigger link' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('combobox', { name: 'Execution key' })).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Register hook' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('combobox', { name: 'Execution key' })).toHaveLength(1);

    // Both pickers observe ONE api-key cache entry — the entry, not the call count.
    expect(queryClient.getQueryCache().findAll({ queryKey: ['auth-tokens-payload'] })).toHaveLength(
      1,
    );
  });
});

describe('HooksPage — topic verifiers', () => {
  it('renders each topic → verifier binding from topic_verifiers, keys not secret values', async () => {
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({
        items: [hook({ name: 'notify-order', topic: 'orders.created' })],
        total: 1,
        topic_verifiers: {
          'orders.created': { verifier: 'hmac-sha256', config: { secret_env: 'ORDERS_SECRET' } },
        },
      }),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    const binding = await screen.findByTestId('topic-verifier-orders.created');
    expect(within(binding).getByText('orders.created')).toBeInTheDocument();
    expect(within(binding).getByText('hmac-sha256')).toBeInTheDocument();
    // The config KEY is shown; the secret_env value it names is never rendered.
    expect(binding).toHaveTextContent('secret_env');
    expect(screen.queryByText(/ORDERS_SECRET/)).not.toBeInTheDocument();
  });

  it('renders no verifier block when topic_verifiers is absent', async () => {
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [hook({ name: 'plain-hook' })], total: 1 }),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('plain-hook');
    expect(screen.queryByTestId('topic-verifiers')).not.toBeInTheDocument();
  });
});

describe('HooksPage — bind topic verifier', () => {
  it('feeds the verifier picker from listHookVerifiers and binds with the parsed body', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} });
    const listHookVerifiers = vi.fn().mockResolvedValue(['shared_secret', 'hmac_sha256']);
    const setTopicVerifier = vi
      .fn()
      .mockResolvedValue({ topic: 'orders.created', verifier: 'shared_secret' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      listHookVerifiers,
      setTopicVerifier,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await user.type(
      within(screen.getByRole('form', { name: 'Bind topic verifier' })).getByLabelText('Topic'),
      'orders.created',
    );
    await user.click(await screen.findByRole('combobox', { name: 'Verifier' }));
    await user.click(await screen.findByRole('option', { name: 'shared_secret' }));
    await user.type(
      screen.getByLabelText('Config (JSON)'),
      '{{"header": "X-Sig", "secret_env": "ORDERS_SECRET"}',
    );
    await user.click(screen.getByRole('button', { name: 'Bind verifier' }));

    await waitFor(() => {
      expect(setTopicVerifier).toHaveBeenCalledWith('orders.created', {
        verifier: 'shared_secret',
        config: { header: 'X-Sig', secret_env: 'ORDERS_SECRET' },
      });
    });
    // The bind invalidates the hooks list so the display re-renders the binding.
    await waitFor(() => {
      expect(listHooks.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('omits config from the body when the config textarea is blank', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} });
    const listHookVerifiers = vi.fn().mockResolvedValue(['shared_secret']);
    const setTopicVerifier = vi
      .fn()
      .mockResolvedValue({ topic: 'orders.created', verifier: 'shared_secret' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      listHookVerifiers,
      setTopicVerifier,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await user.type(
      within(screen.getByRole('form', { name: 'Bind topic verifier' })).getByLabelText('Topic'),
      'orders.created',
    );
    await user.click(await screen.findByRole('combobox', { name: 'Verifier' }));
    await user.click(await screen.findByRole('option', { name: 'shared_secret' }));
    await user.click(screen.getByRole('button', { name: 'Bind verifier' }));

    await waitFor(() => {
      expect(setTopicVerifier).toHaveBeenCalledWith('orders.created', {
        verifier: 'shared_secret',
      });
    });
  });

  it('renders an honest note and disables the bind when the verifier catalog is empty', async () => {
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} });
    const listHookVerifiers = vi.fn().mockResolvedValue([]);
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      listHookVerifiers,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    expect(await screen.findByText('No webhook verifiers registered.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bind verifier' })).toBeDisabled();
  });

  it('renders a loud error with retry when the verifier catalog fails to load', async () => {
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} });
    const listHookVerifiers = vi.fn().mockRejectedValue(new Error('verifiers boom'));
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      listHookVerifiers,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    expect(await screen.findByText('verifiers boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('blocks the bind (no request) on a missing topic or verifier', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} });
    const listHookVerifiers = vi.fn().mockResolvedValue(['shared_secret']);
    const setTopicVerifier = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      listHookVerifiers,
      setTopicVerifier,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByRole('button', { name: 'Bind verifier' });
    // No topic, no verifier picked.
    await user.click(screen.getByRole('button', { name: 'Bind verifier' }));
    expect(await screen.findByText('A topic is required.')).toBeInTheDocument();
    expect(screen.getByText('A verifier is required.')).toBeInTheDocument();
    expect(setTopicVerifier).not.toHaveBeenCalled();
  });

  it('blocks the bind with a loud field error on malformed config JSON', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} });
    const listHookVerifiers = vi.fn().mockResolvedValue(['shared_secret']);
    const setTopicVerifier = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      listHookVerifiers,
      setTopicVerifier,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await user.type(
      within(screen.getByRole('form', { name: 'Bind topic verifier' })).getByLabelText('Topic'),
      'orders.created',
    );
    await user.click(await screen.findByRole('combobox', { name: 'Verifier' }));
    await user.click(await screen.findByRole('option', { name: 'shared_secret' }));
    await user.type(screen.getByLabelText('Config (JSON)'), 'not json');
    await user.click(screen.getByRole('button', { name: 'Bind verifier' }));

    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(setTopicVerifier).not.toHaveBeenCalled();
  });

  it('surfaces an unknown-verifier 400 verbatim', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} });
    const listHookVerifiers = vi.fn().mockResolvedValue(['shared_secret']);
    const setTopicVerifier = vi
      .fn()
      .mockRejectedValue(new ApiError('unknown webhook verifier: shared_secret', 400));
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      listHookVerifiers,
      setTopicVerifier,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await user.type(
      within(screen.getByRole('form', { name: 'Bind topic verifier' })).getByLabelText('Topic'),
      'orders.created',
    );
    await user.click(await screen.findByRole('combobox', { name: 'Verifier' }));
    await user.click(await screen.findByRole('option', { name: 'shared_secret' }));
    await user.click(screen.getByRole('button', { name: 'Bind verifier' }));

    expect(await screen.findByText('unknown webhook verifier: shared_secret')).toBeInTheDocument();
  });

  it('shows the binding a re-bind will replace on an already-bound topic', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      topic_verifiers: { 'orders.created': { verifier: 'shared_secret', config: {} } },
    });
    const listHookVerifiers = vi.fn().mockResolvedValue(['shared_secret', 'hmac_sha256']);
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      listHookVerifiers,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByRole('button', { name: 'Bind verifier' });
    await user.type(
      within(screen.getByRole('form', { name: 'Bind topic verifier' })).getByLabelText('Topic'),
      'orders.created',
    );
    expect(await screen.findByText(/Replaces the current/)).toBeInTheDocument();
  });

  it('treats a topic named after an Object.prototype member as UNBOUND', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue(['shared_secret']),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} }),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    const topic = within(screen.getByRole('form', { name: 'Bind topic verifier' })).getByLabelText(
      'Topic',
    );
    await user.type(topic, 'constructor');

    expect(topic).toHaveValue('constructor');
    expect(screen.queryByText(/Replaces the current/)).not.toBeInTheDocument();
  });
});

describe('HooksPage — unbind topic verifier', () => {
  it('unbinds a topic behind a confirm dialog and invalidates the list', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      topic_verifiers: { 'orders.created': { verifier: 'shared_secret', config: {} } },
    });
    const listHookVerifiers = vi.fn().mockResolvedValue(['shared_secret']);
    const deleteTopicVerifier = vi
      .fn()
      .mockResolvedValue({ removed: true, topic: 'orders.created' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      listHookVerifiers,
      deleteTopicVerifier,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await user.click(
      await screen.findByRole('button', { name: 'Unbind verifier from orders.created' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/ingress becomes OPEN/);
    await user.click(within(dialog).getByRole('button', { name: 'Unbind verifier' }));

    await waitFor(() => {
      expect(deleteTopicVerifier).toHaveBeenCalledWith('orders.created');
    });
  });

  it('does not unbind when the confirm dialog is cancelled', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      topic_verifiers: { 'orders.created': { verifier: 'shared_secret', config: {} } },
    });
    const listHookVerifiers = vi.fn().mockResolvedValue(['shared_secret']);
    const deleteTopicVerifier = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      listHookVerifiers,
      deleteTopicVerifier,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await user.click(
      await screen.findByRole('button', { name: 'Unbind verifier from orders.created' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(deleteTopicVerifier).not.toHaveBeenCalled();
  });

  it('surfaces a 404 verbatim in the unbind dialog', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      topic_verifiers: { 'orders.created': { verifier: 'shared_secret', config: {} } },
    });
    const listHookVerifiers = vi.fn().mockResolvedValue(['shared_secret']);
    const deleteTopicVerifier = vi
      .fn()
      .mockRejectedValue(new ApiError('no verifier bound to topic', 404));
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks,
      listHookVerifiers,
      deleteTopicVerifier,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await user.click(
      await screen.findByRole('button', { name: 'Unbind verifier from orders.created' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Unbind verifier' }));

    expect(await screen.findByText('no verifier bound to topic')).toBeInTheDocument();
  });
});

describe('HooksPage — delete', () => {
  it('unregisters a hook behind a confirm dialog', async () => {
    const user = userEvent.setup();
    const unregisterHook = vi.fn().mockResolvedValue({ removed: true, name: 'notify-order' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [hook({ name: 'notify-order' })], total: 1 }),
      unregisterHook,
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('notify-order');
    expect(unregisterHook).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete hook notify-order' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete hook' }));

    await waitFor(() => {
      expect(unregisterHook).toHaveBeenCalledWith('notify-order');
    });
  });
});
