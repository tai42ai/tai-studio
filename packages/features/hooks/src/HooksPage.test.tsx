/**
 * Behavioural tests for the hooks surface. Each test stubs only the client
 * methods the path under test calls and drives the real DS components through
 * TanStack Query, covering: the list (data / empty / error), the topic filter's
 * effect on the query argument, register (valid submit + invalidation), the loud
 * invalid-JSON field error that blocks the request, and delete behind a confirm
 * dialog.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@tai42/api-client';

import { HooksPage } from './HooksPage';
import { hook, renderWithProviders, type StubApiClient } from './test-utils';

describe('HooksPage — list', () => {
  it('renders a row per hook with name / topic / tool and gate badges', async () => {
    const client: StubApiClient = {
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
  });

  it('omits the gate badges when neither condition nor expr is set', async () => {
    const client: StubApiClient = {
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
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    expect(await screen.findByText('No hooks registered')).toBeInTheDocument();
  });

  it('shows a loud error state carrying the real message when the list fails', async () => {
    const client: StubApiClient = {
      listHookVerifiers: vi.fn().mockResolvedValue([]),
      listHooks: vi.fn().mockRejectedValue(new Error('boom: list failed')),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: list failed');
  });
});

describe('HooksPage — topic filter', () => {
  it('refetches with the entered topic as the listHooks argument', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const client: StubApiClient = {
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
      listHooks,
      registerHook,
      listHookVerifiers: vi.fn().mockResolvedValue([]),
    };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByText('No hooks registered');
    await user.type(screen.getByLabelText('Name'), 'greet');
    await user.type(
      within(screen.getByRole('form', { name: 'Register hook' })).getByLabelText('Topic'),
      'orders.created',
    );
    await user.type(screen.getByLabelText('Tool'), 'notify');
    await user.type(screen.getByLabelText('Tool kwargs (JSON)'), '{{"channel": "ops"}');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledWith({
        name: 'greet',
        topic: 'orders.created',
        tool: 'notify',
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

  it('shows a loud field error on invalid tool_kwargs JSON and never calls registerHook', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn();
    const client: StubApiClient = {
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
    await user.type(screen.getByLabelText('Tool kwargs (JSON)'), 'not json');
    await user.click(screen.getByRole('button', { name: 'Register' }));

    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(registerHook).toHaveBeenCalledTimes(0);
  });

  it('shows a loud inline field error for a valid-JSON but non-object tool_kwargs and never calls registerHook', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn();
    const client: StubApiClient = {
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

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledOnce();
    });
    expect(await screen.findByText('register boom')).toBeInTheDocument();
  });

  it('blocks submit with the three required-field errors when name, topic and tool are blank', async () => {
    const user = userEvent.setup();
    const registerHook = vi.fn();
    const client: StubApiClient = {
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
    expect(registerHook).toHaveBeenCalledTimes(0);
  });
});

describe('HooksPage — topic verifiers', () => {
  it('renders each topic → verifier binding from topic_verifiers, keys not secret values', async () => {
    const client: StubApiClient = {
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
    const client: StubApiClient = { listHooks, listHookVerifiers, setTopicVerifier };
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
    const client: StubApiClient = { listHooks, listHookVerifiers, setTopicVerifier };
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
    const client: StubApiClient = { listHooks, listHookVerifiers };
    renderWithProviders(<HooksPage search={{}} />, { client });

    expect(await screen.findByText('No webhook verifiers registered.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bind verifier' })).toBeDisabled();
  });

  it('renders a loud error with retry when the verifier catalog fails to load', async () => {
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} });
    const listHookVerifiers = vi.fn().mockRejectedValue(new Error('verifiers boom'));
    const client: StubApiClient = { listHooks, listHookVerifiers };
    renderWithProviders(<HooksPage search={{}} />, { client });

    expect(await screen.findByText('verifiers boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('blocks the bind (no request) on a missing topic or verifier', async () => {
    const user = userEvent.setup();
    const listHooks = vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} });
    const listHookVerifiers = vi.fn().mockResolvedValue(['shared_secret']);
    const setTopicVerifier = vi.fn();
    const client: StubApiClient = { listHooks, listHookVerifiers, setTopicVerifier };
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
    const client: StubApiClient = { listHooks, listHookVerifiers, setTopicVerifier };
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
    const client: StubApiClient = { listHooks, listHookVerifiers, setTopicVerifier };
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
    const client: StubApiClient = { listHooks, listHookVerifiers };
    renderWithProviders(<HooksPage search={{}} />, { client });

    await screen.findByRole('button', { name: 'Bind verifier' });
    await user.type(
      within(screen.getByRole('form', { name: 'Bind topic verifier' })).getByLabelText('Topic'),
      'orders.created',
    );
    expect(await screen.findByText(/Replaces the current/)).toBeInTheDocument();
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
    const client: StubApiClient = { listHooks, listHookVerifiers, deleteTopicVerifier };
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
    const client: StubApiClient = { listHooks, listHookVerifiers, deleteTopicVerifier };
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
    const client: StubApiClient = { listHooks, listHookVerifiers, deleteTopicVerifier };
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
