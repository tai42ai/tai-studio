/**
 * Behavioural tests for {@link RegisterHookForm} across its create and edit modes:
 * the inline replace (overwrite) notice when a typed name hits an existing hook,
 * prefill and id-gate preservation on save, the inline charset-400 surface, the
 * edit-dialog Cancel/close contract, and the honest "list unavailable" fallback.
 */
import { ApiError } from '@tai42/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RegisterHookForm } from './RegisterHookForm';
import {
  accountSessionProjection,
  apiKey,
  clickWhenInteractable,
  gateOffProjection,
  hook,
  keySessionProjection,
  openSelect,
  renderWithProviders,
  type StubApiClient,
} from './test-utils';

/** Open the execution-key Select and pick the seeded svc-events key. */
async function pickExecutionKey(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await openSelect(user, 'Execution key');
  await user.click(await screen.findByRole('option', { name: /svc-events/ }));
}

describe('RegisterHookForm — overwrite notice (create)', () => {
  it('warns that a register replaces an existing hook once the typed name collides', async () => {
    const user = userEvent.setup({ delay: null });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({ items: [hook({ name: 'notify-event' })], total: 1 }),
    };
    renderWithProviders(<RegisterHookForm />, { client, projection: accountSessionProjection() });

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
    const user = userEvent.setup({ delay: null });
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'greet' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockRejectedValue(new Error('list boom')),
      registerHook,
    };
    renderWithProviders(<RegisterHookForm />, { client, projection: accountSessionProjection() });

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

  it('attaches a subject built from the optional Subject group', async () => {
    const user = userEvent.setup({ delay: null });
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'greet' });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      listConversationRoutes: vi.fn().mockResolvedValue({
        items: [{ target_kind: 'agent', target_name: 'assistant' }],
        total: 1,
      }),
      registerHook,
    };
    renderWithProviders(<RegisterHookForm />, { client, projection: accountSessionProjection() });

    await user.type(await screen.findByLabelText('Name'), 'greet');
    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await user.type(screen.getByLabelText('Tool'), 'notify');
    await pickExecutionKey(user);

    // Expand the Subject group and fill it.
    await user.click(screen.getByText('Subject (optional)'));
    await user.click(await screen.findByLabelText('Target'));
    await user.click(await screen.findByRole('option', { name: 'agent · assistant' }));
    await user.type(screen.getByLabelText('Subject kind'), 'person');
    await user.type(screen.getByLabelText('Key expression'), '.actor.id');

    await user.click(screen.getByRole('button', { name: 'Register' }));
    await waitFor(() => {
      expect(registerHook).toHaveBeenCalled();
    });
    expect(registerHook.mock.calls[0]?.[0]).toMatchObject({
      subject: {
        target_kind: 'agent',
        target_name: 'assistant',
        kind: 'person',
        key_expr: { content: '.actor.id' },
      },
    });
  });
});

describe('RegisterHookForm — edit mode', () => {
  it('prefills from the hook and saves back over it, carrying id-based gates through', async () => {
    const user = userEvent.setup({ delay: null });
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
      // A stored-template condition prefilled into the control; an edit that never
      // touches it must save it back verbatim.
      condition: { id: 'shape.big-event', kwargs: { threshold: 100 } },
    });
    renderWithProviders(<RegisterHookForm initial={initial} onClose={onClose} />, {
      client,
      projection: accountSessionProjection(),
    });

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
        condition: { id: 'shape.big-event', kwargs: { threshold: 100 } },
      }),
    );
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it('does not warn on the edited hook itself, only when renamed onto another hook', async () => {
    const user = userEvent.setup({ delay: null });
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
      { client, projection: accountSessionProjection() },
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
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    const registerHook = vi.fn();
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<RegisterHookForm initial={hook()} onClose={onClose} />, {
      client,
      projection: accountSessionProjection(),
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(registerHook).not.toHaveBeenCalled();
  });
});

describe('RegisterHookForm — jq condition and door-contract expression fields', () => {
  // Three code editors typed keystroke by keystroke: each key re-renders the editor, so the
  // round-trip legitimately outlasts the suite's default budget on a loaded runner.
  const ROUND_TRIP_TIMEOUT_MS = 60_000;

  it(
    'round-trips the inline condition and the door jqs through the jq expression fields',
    async () => {
      const user = userEvent.setup({ delay: null });
      const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'greet' });
      const client: StubApiClient = {
        listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
        listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        registerHook,
      };
      renderWithProviders(<RegisterHookForm />, { client, projection: accountSessionProjection() });

      await user.type(screen.getByLabelText('Name'), 'greet');
      await user.type(screen.getByLabelText('Topic'), 'events.created');
      await user.type(screen.getByLabelText('Tool'), 'notify');
      await openSelect(user, 'Execution key');
      await user.click(await screen.findByRole('option', { name: /svc-events/ }));
      await user.type(screen.getByRole('textbox', { name: 'Condition' }), '.amount > 100');
      await user.type(screen.getByRole('textbox', { name: 'Start' }), '.message.text');
      await user.type(screen.getByRole('textbox', { name: 'Cancel' }), '$parked | first | .id');
      await user.click(screen.getByRole('button', { name: 'Register' }));

      await waitFor(() => {
        expect(registerHook).toHaveBeenCalledOnce();
      });
      expect(registerHook).toHaveBeenCalledWith(
        expect.objectContaining({
          condition: { content: '.amount > 100' },
          start_expr: { content: '.message.text' },
          cancel_expr: { content: '$parked | first | .id' },
          resume_expr: null,
          extras_expr: null,
        }),
      );
    },
    ROUND_TRIP_TIMEOUT_MS,
  );

  it('offers an always-present visual-editor door on EACH jq field (condition + the four door jqs)', async () => {
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    // JqField is a direct dependency now (no editor-registry door): the visual
    // editor is always available, so every jq field renders its door unconditionally.
    // The door folds its field label into its accessible name
    // ("Open the visual editor for <label>"), so each door is pinned to its own field
    // by name — a bare count could not tell WHICH fields got one.
    renderWithProviders(<RegisterHookForm />, { client, projection: accountSessionProjection() });

    for (const label of ['Condition', 'Start', 'Cancel', 'Resume', 'Extras']) {
      expect(
        await screen.findByRole('button', { name: `Open the visual editor for ${label}` }),
      ).toBeInTheDocument();
    }

    // And exactly five doors total across the form — no other field grew one.
    expect(screen.getAllByRole('button', { name: /Open the visual editor for/i })).toHaveLength(5);
  });
});

describe('RegisterHookForm — charset rule', () => {
  it("surfaces the backend's name/topic charset 400 loudly and inline", async () => {
    const user = userEvent.setup({ delay: null });
    const message = 'hook name may only contain letters, digits, ., _ and -';
    const registerHook = vi.fn().mockRejectedValue(new ApiError(message, 400));
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      registerHook,
    };
    renderWithProviders(<RegisterHookForm />, { client, projection: accountSessionProjection() });

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

describe('RegisterHookForm — state binding source resolution', () => {
  it("resolves the hook tool's schema into the binding field pickers", async () => {
    const user = userEvent.setup({ delay: null });
    const getToolSchema = vi.fn().mockResolvedValue({
      input: { type: 'object', properties: { memo: { type: 'string' } } },
      output: { type: 'object', properties: { total: { type: 'number' } } },
      description: null,
    });
    const client: StubApiClient = {
      listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
      listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      listStates: vi.fn().mockResolvedValue([]),
      listStateTemplates: vi.fn().mockResolvedValue([]),
      getToolSchema,
    };
    renderWithProviders(<RegisterHookForm />, { client, projection: accountSessionProjection() });
    await user.type(screen.getByLabelText('Tool'), 'notify');
    await waitFor(() => {
      expect(getToolSchema.mock.calls.some((call) => call[0] === 'notify')).toBe(true);
    });
  });
});

describe('RegisterHookForm — inherited advisory + binding serialization', () => {
  const boundHook = () =>
    hook({
      name: 'tally-hook',
      tool: 'tally-preset',
      state_binding: {
        states: [
          {
            state: 'counters',
            templates: [],
            subject_expr: { content: '.k' },
            scope_expr: null,
            input_injections: [],
            updates: [],
          },
        ],
      },
    });

  const presetClient = (
    registerHook: NonNullable<StubApiClient['registerHook']>,
  ): StubApiClient => ({
    listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
    listHooks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    listStates: vi.fn().mockResolvedValue([]),
    listStateTemplates: vi.fn().mockResolvedValue([]),
    listPresets: vi.fn().mockResolvedValue([{ name: 'tally-preset' }]),
    listPresetVersions: vi.fn().mockResolvedValue([
      {
        version: 1,
        is_current: true,
        tags: [],
        created_at: '',
        body: {
          base_tool: 'echo',
          description: '',
          fixed_kwargs: {},
          extensions: [],
          output_schema: null,
          input_schema: null,
          state_binding: {
            states: [
              {
                state: 'counters',
                templates: [],
                subject_expr: { content: '.preset_key' },
                scope_expr: null,
                input_injections: [],
                updates: [],
              },
            ],
          },
        },
      },
    ]),
    getToolSchema: vi.fn().mockResolvedValue({ input: {}, output: null, description: null }),
    registerHook,
  });

  it('shows the override advisory when the hook and the target preset name the same state', async () => {
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'tally-hook' });
    renderWithProviders(<RegisterHookForm initial={boundHook()} onClose={vi.fn()} />, {
      client: presetClient(registerHook),
      projection: accountSessionProjection(),
    });
    expect(await screen.findByText('Overrides the preset’s subject')).toBeInTheDocument();
    expect(screen.getByText('Preset default:')).toBeInTheDocument();
  });

  it('serializes a SET binding into the register body', async () => {
    const user = userEvent.setup({ delay: null });
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'tally-hook' });
    renderWithProviders(<RegisterHookForm initial={boundHook()} onClose={vi.fn()} />, {
      client: presetClient(registerHook),
      projection: accountSessionProjection(),
    });
    // The fire gate is unsatisfiable — and submit a no-op — until the key list
    // resolves, which is exactly when the picker sheds its disabled state.
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Execution key' })).toBeEnabled();
    });
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(registerHook).toHaveBeenCalled();
    });
    const params = registerHook.mock.calls[0]?.[0] as { state_binding: unknown };
    expect(params.state_binding).toEqual({
      states: [
        {
          state: 'counters',
          templates: [],
          subject_expr: { content: '.k' },
          scope_expr: null,
          input_injections: [],
          updates: [],
        },
      ],
    });
  });
});

describe('RegisterHookForm — execution-key binding', () => {
  const forbiddenKeys = (): Promise<never> => Promise.reject(new ApiError('forbidden', 403));

  async function fillIdentity(
    user: ReturnType<typeof userEvent.setup>,
    name = 'greet',
  ): Promise<void> {
    await user.type(await screen.findByLabelText('Name'), name);
    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await user.type(screen.getByLabelText('Tool'), 'notify');
  }

  function keyClient(listTokensPayload: StubApiClient['listTokensPayload']) {
    const registerHook = vi.fn().mockResolvedValue({ registered: true, name: 'greet' });
    const client: StubApiClient = {
      listTokensPayload,
      listHooks: vi.fn().mockResolvedValue({ items: [hook({ name: 'taken' })], total: 1 }),
      registerHook,
    };
    return { client, registerHook };
  }

  it('access control off: no key field, no key read, registers as the fill identity', async () => {
    const user = userEvent.setup({ delay: null });
    const { client, registerHook } = keyClient(vi.fn().mockResolvedValue([apiKey()]));
    renderWithProviders(<RegisterHookForm />, { client, projection: gateOffProjection() });

    await fillIdentity(user);
    expect(screen.queryByText('Execution key')).not.toBeInTheDocument();
    await clickWhenInteractable(user, screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledOnce();
    });
    expect(registerHook.mock.calls[0]?.[0]).toMatchObject({ execution_key: '__no_auth__' });
    expect(client.listTokensPayload).not.toHaveBeenCalled();
  });

  it('access control off: an edit keeps the stored key; a taken name still warns', async () => {
    const user = userEvent.setup({ delay: null });
    const { client, registerHook } = keyClient(vi.fn().mockResolvedValue([]));
    renderWithProviders(
      <RegisterHookForm
        initial={hook({ name: 'greet', execution_key: 'svc' })}
        onClose={vi.fn()}
      />,
      { client, projection: gateOffProjection() },
    );

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'taken');
    const notice = await screen.findByText(/current registration is/);
    expect(notice).toHaveTextContent(
      'Replaces the existing hook taken — its current registration is overwritten.',
    );
    await clickWhenInteractable(user, screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(registerHook).toHaveBeenCalledOnce();
    });
    expect(registerHook.mock.calls[0]?.[0]).toMatchObject({ execution_key: 'svc' });
  });

  it('with no projection the key field is pending, unread, and Register is off', async () => {
    const user = userEvent.setup({ delay: null });
    const { client } = keyClient(vi.fn().mockResolvedValue([apiKey()]));
    renderWithProviders(<RegisterHookForm />, { client });

    await fillIdentity(user);
    const picker = screen.getByRole('combobox', { name: 'Execution key' });
    expect(picker).toBeDisabled();
    expect(picker).toHaveTextContent('Loading keys…');
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
    expect(client.listTokensPayload).not.toHaveBeenCalled();
  });

  for (const [label, read] of [
    ['an empty key list', () => vi.fn().mockResolvedValue([])],
    ['a refused key list', () => vi.fn().mockImplementation(forbiddenKeys)],
  ] as const) {
    it(`a key session over ${label} registers as its own identity`, async () => {
      const user = userEvent.setup({ delay: null });
      const { client, registerHook } = keyClient(read());
      renderWithProviders(<RegisterHookForm />, { client, projection: keySessionProjection() });

      await fillIdentity(user);
      await openSelect(user, 'Execution key');
      await user.click(
        await screen.findByRole('option', { name: "alice-key — this session's identity" }),
      );
      await clickWhenInteractable(user, screen.getByRole('button', { name: 'Register' }));

      await waitFor(() => {
        expect(registerHook).toHaveBeenCalledOnce();
      });
      expect(registerHook.mock.calls[0]?.[0]).toMatchObject({ execution_key: 'alice-key' });
    });

    it(`a key session over ${label} with the key left blank shows the field error`, async () => {
      const user = userEvent.setup({ delay: null });
      const { client, registerHook } = keyClient(read());
      renderWithProviders(<RegisterHookForm />, { client, projection: keySessionProjection() });

      await fillIdentity(user);
      await clickWhenInteractable(user, screen.getByRole('button', { name: 'Register' }));

      expect(await screen.findByText('An execution key is required.')).toBeInTheDocument();
      expect(registerHook).not.toHaveBeenCalled();
    });
  }

  it('an account session over an empty key list reads the account note; Register is off', async () => {
    const user = userEvent.setup({ delay: null });
    const { client } = keyClient(vi.fn().mockResolvedValue([]));
    renderWithProviders(<RegisterHookForm />, { client, projection: accountSessionProjection() });

    await fillIdentity(user);
    expect(
      await screen.findByText(
        'No api keys of yours are listed. You are signed in as an account, not an api key, so your own identity cannot be picked here. Mint a key on the settings API-keys tab first.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
  });

  it('a refused key list shows the no-grant note, no Retry; an account session cannot register', async () => {
    const user = userEvent.setup({ delay: null });
    const { client } = keyClient(vi.fn().mockImplementation(forbiddenKeys));
    renderWithProviders(<RegisterHookForm />, { client, projection: accountSessionProjection() });

    await fillIdentity(user);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'This session cannot list api keys. Picking one needs read access to GET /api/auth/tokens-payload; ask an administrator to grant it.',
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Execution key' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register' })).toBeDisabled();
  });
});
