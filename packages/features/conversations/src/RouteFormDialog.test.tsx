/**
 * The route create/edit dialog: the binding fields (route name, the picked target, the
 * door with its channel and identity hint, the execution key), the schema-driven settings
 * (the five door-contract jq fields of the picked kind, the overlap policy, the reply
 * texts), the flat wire body a submit sends, the inline required-field guard, edit
 * prefill with a read-only name, the pickers' refused and failed reads, and the shown-once
 * `callback_secret` reveal for an api-door write. The execution-key readings are in
 * `RouteFormDialog.execution-key.test.tsx`.
 */
import { ApiError, type MeProjection } from '@tai42/api-client';
import {
  agentsListKey,
  channelsListKey,
  ExpressionFieldContext,
  type ExpressionFieldProps,
} from '@tai42/studio-sdk';
import { StaticToolDisplayNamesProvider } from '@tai42/studio-sdk/testing';
import type { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { RouteFormDialog } from './RouteFormDialog';
import {
  agentListing,
  apiKey,
  channelListing,
  gateOffProjection,
  keySessionProjection,
  makeRoute,
  openSelect,
  pickOption,
  renderWithProviders,
  type StubApiClient,
  toolTag,
} from './test-utils';

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

// Every case drives a full Radix dialog flow — portal mount, combobox pickers, and a
// schema-driven form that re-renders on each keystroke — so userEvent runs without its
// inter-key delay; correctness stays gated by the real assertions and awaited signals below.

type User = ReturnType<typeof userEvent.setup>;

const WHATSAPP_HINT = 'The phone number in E.164 form, for example +15550000000.';
const IDENTITY_FALLBACK = 'The address on this channel that clients message.';
const DOOR_HELP =
  'Where messages arrive and how the answer goes back: a channel answers on its own medium; the API door answers to a callback URL, or the caller polls.';

const never = <T,>(): Promise<T> => new Promise<T>(() => undefined);

/** The pickers' reads: two agents, two tools, a channel with a hint and one without, one key. */
function pickerClient(overrides: StubApiClient = {}): StubApiClient {
  return {
    listAgents: vi.fn().mockResolvedValue(agentListing(['assistant', 'researcher'])),
    listTools: vi.fn().mockResolvedValue(['lookup_record', 'lookup_account']),
    listToolTags: vi
      .fn()
      .mockResolvedValue([
        toolTag('lookup_record', null),
        toolTag('lookup_account', 'Reads one account by its identifier'),
      ]),
    listChannels: vi.fn().mockResolvedValue(
      channelListing([
        ['whatsapp', WHATSAPP_HINT],
        ['telegram', null],
      ]),
    ),
    listTokensPayload: vi.fn().mockResolvedValue([apiKey({ user_id: 'svc-events' })]),
    ...overrides,
  };
}

function renderDialog({
  initial,
  client = {},
  projection = keySessionProjection(),
  seed,
  onClose = vi.fn(),
  expressionField,
  toolDisplayNames = {},
}: {
  readonly initial?: ReturnType<typeof makeRoute>;
  readonly client?: StubApiClient;
  readonly projection?: MeProjection;
  readonly seed?: (queryClient: QueryClient) => void;
  readonly onClose?: () => void;
  readonly expressionField?: (props: ExpressionFieldProps) => ReactNode;
  readonly toolDisplayNames?: Readonly<Record<string, string>>;
} = {}) {
  const dialog = (
    <StaticToolDisplayNamesProvider names={toolDisplayNames}>
      <RouteFormDialog initial={initial} onClose={onClose} />
    </StaticToolDisplayNamesProvider>
  );
  return renderWithProviders(
    expressionField === undefined ? (
      dialog
    ) : (
      <ExpressionFieldContext.Provider value={expressionField}>
        {dialog}
      </ExpressionFieldContext.Provider>
    ),
    { client: pickerClient(client), projection, ...(seed === undefined ? {} : { seed }) },
  );
}

async function pickTarget(user: User, kind: 'Agent' | 'Tool', name: string): Promise<void> {
  await pickOption(user, 'Target kind', kind);
  await pickOption(user, kind, name);
}

async function pickChannelDoor(user: User, channel: string, identity: string): Promise<void> {
  await pickOption(user, 'Door', 'Channel');
  await pickOption(user, 'Channel', channel);
  await user.type(screen.getByRole('textbox', { name: 'Our identity' }), identity);
}

async function pickKey(user: User, key = 'svc-events'): Promise<void> {
  await pickOption(user, 'Execution key', key);
}

const identityBox = (): HTMLElement => screen.getByRole('textbox', { name: 'Our identity' });

describe('RouteFormDialog — create', () => {
  it('renders the blank create form with the identity, target, door, and key fields', async () => {
    renderDialog();

    expect(screen.getByRole('textbox', { name: 'Route name' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Target' })).toHaveAccessibleDescription(
      'What an inbound turn on this route runs.',
    );
    expect(screen.getByRole('combobox', { name: 'Target kind' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Door' })).toHaveAccessibleDescription(DOOR_HELP);
    expect(screen.getByRole('combobox', { name: 'Door' })).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: 'Execution key' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create route' })).toBeInTheDocument();
  });

  it('describes each target kind and shows the five jq fields on both', async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();
    const jqFieldNames = [
      'Start expression',
      'Reply expression',
      'Cancel expression',
      'Resume expression',
      'Extras expression',
    ];
    const target = screen.getByRole('group', { name: 'Target' });

    await pickOption(user, 'Target kind', 'Agent');
    expect(target).toHaveAccessibleDescription(
      'Each turn runs this agent as a threaded conversation.',
    );
    expect(await screen.findByRole('combobox', { name: 'Agent' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Expressions' })).toBeInTheDocument();
    for (const name of jqFieldNames) {
      expect(screen.getByRole('textbox', { name })).toBeInTheDocument();
    }

    await pickOption(user, 'Target kind', 'Tool');
    expect(target).toHaveAccessibleDescription(
      'Each message dispatches this tool on its own, with no thread memory.',
    );
    expect(await screen.findByRole('combobox', { name: 'Tool' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Agent' })).not.toBeInTheDocument();
    for (const name of jqFieldNames) {
      expect(screen.getByRole('textbox', { name })).toBeInTheDocument();
    }
  });

  it('clears the picked name when the target kind changes, keeping the expressions', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn();
    renderDialog({ client: { createOrReplaceConversationRoute } });

    await pickTarget(user, 'Tool', 'lookup_record');
    await user.type(screen.getByRole('textbox', { name: 'Start expression' }), '.message');
    await pickOption(user, 'Target kind', 'Agent');
    expect(screen.getByRole('combobox', { name: 'Agent' })).not.toHaveTextContent('lookup_record');
    expect(screen.getByRole('textbox', { name: 'Start expression' })).toHaveValue('.message');
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    expect(await screen.findByText('An agent name is required.')).toBeInTheDocument();
    expect(createOrReplaceConversationRoute).not.toHaveBeenCalled();
  });

  it('labels the tool options with their display names and searches either name', async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog({ toolDisplayNames: { lookup_record: 'Find Record' } });

    await pickOption(user, 'Target kind', 'Tool');
    await user.click(await screen.findByRole('combobox', { name: 'Tool' }));
    const search = screen.getByRole('combobox', { name: 'Search tools' });
    await user.type(search, 'find');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveAccessibleName('Find Record (lookup_record)');
    await user.clear(search);
    await user.type(search, 'lookup_acc');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveAccessibleName('lookup_account');
  });

  it('finds a tool by a word of its declared description', async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();

    await pickOption(user, 'Target kind', 'Tool');
    await user.click(await screen.findByRole('combobox', { name: 'Tool' }));
    await user.type(screen.getByRole('combobox', { name: 'Search tools' }), 'identifier');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName('lookup_account');
    expect(options[0]).toHaveAccessibleDescription('Reads one account by its identifier');
  });

  it('states a failed tool-description read on the tool field and still lists the tools', async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog({
      client: { listToolTags: vi.fn().mockRejectedValue(new ApiError('boom', 500)) },
    });

    await pickOption(user, 'Target kind', 'Tool');
    const tool = await screen.findByRole('combobox', { name: 'Tool' });
    await waitFor(() => {
      expect(tool).toHaveAccessibleDescription(
        'Could not load tool descriptions: boom. The tool search matches tool names only.',
      );
    });
    await user.click(tool);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'lookup_record',
      'lookup_account',
    ]);
  });

  it('states a failed tool-description read without the tool search while the tools read is pending', async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog({
      client: {
        listTools: vi.fn().mockReturnValue(new Promise<never>(() => undefined)),
        listToolTags: vi.fn().mockRejectedValue(new ApiError('boom', 500)),
      },
    });

    await pickOption(user, 'Target kind', 'Tool');
    const tool = await screen.findByRole('combobox', { name: 'Tool' });
    await waitFor(() => {
      expect(tool).toHaveAccessibleDescription('Could not load tool descriptions: boom.');
    });
    expect(tool).toBeDisabled();
  });

  it('states a failed tool-description read without the tool search when no tool is registered', async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog({
      client: {
        listTools: vi.fn().mockResolvedValue([]),
        listToolTags: vi.fn().mockRejectedValue(new ApiError('boom', 500)),
      },
    });

    await pickOption(user, 'Target kind', 'Tool');
    expect(await screen.findByText('No tools are registered on this deployment.')).toBeVisible();
    expect(await screen.findByText('Could not load tool descriptions: boom.')).toBeVisible();
    expect(document.body).not.toHaveTextContent('The tool search matches tool names only.');
  });

  it('shows only the api door field for the api door and the channel fields for channel', async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();

    await pickOption(user, 'Door', 'API');
    expect(screen.getByRole('textbox', { name: 'Callback URL' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Channel' })).not.toBeInTheDocument();

    await pickOption(user, 'Door', 'Channel');
    expect(await screen.findByRole('combobox', { name: 'Channel' })).toBeInTheDocument();
    expect(identityBox()).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Callback URL' })).not.toBeInTheDocument();
  });

  it('renders the jq expression door through an injected ExpressionFieldContext', async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog({ expressionField: StubExpressionField });

    // No expression fields exist until a target kind is chosen; then all five
    // door-contract jqs render through the injected door.
    expect(screen.queryAllByTestId('jq-stub')).toHaveLength(0);
    await pickOption(user, 'Target kind', 'Tool');

    const doors = screen.getAllByTestId('jq-stub');
    expect(doors).toHaveLength(5);
    expect(screen.getByRole('textbox', { name: 'Start expression' })).toBe(doors[0]);
    expect(screen.getByRole('textbox', { name: 'Reply expression' })).toBe(doors[1]);
  });

  it('sends the flat wire body a tool + channel route composes on submit', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: true,
      route_name: 'events',
      route: makeRoute(),
      callback_secret: null,
    });
    renderDialog({ client: { createOrReplaceConversationRoute } });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'events');
    await pickTarget(user, 'Tool', 'lookup_record');
    await pickChannelDoor(user, 'whatsapp', '+15550000000');
    await pickKey(user);
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledWith({
        route_name: 'events',
        door: 'channel',
        target_kind: 'tool',
        target_name: 'lookup_record',
        start_expr: null,
        reply_expr: null,
        cancel_expr: null,
        resume_expr: null,
        extras_expr: null,
        initial_mode: 'agent',
        execution_key: 'svc-events',
        channel: 'whatsapp',
        our_identity: '+15550000000',
        callback_url: null,
        turns_per_hour_override: null,
        reply_texts: null,
        locale: null,
      });
    });
  });

  it('sends the reply texts the operator filled in, leaving every other reply built-in', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: true,
      route_name: 'events',
      route: makeRoute(),
      callback_secret: null,
    });
    renderDialog({ client: { createOrReplaceConversationRoute } });

    expect(screen.getByRole('group', { name: 'Reply texts' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'events');
    await pickTarget(user, 'Agent', 'assistant');
    await pickOption(user, 'Door', 'API');
    await pickKey(user);
    await user.type(screen.getByRole('textbox', { name: /^Failed turn\b/ }), 'Please try again.');
    await user.type(
      screen.getByRole('textbox', { name: /^Pairing code(?! refused)/ }),
      'Your code is {{pairing_code}.',
    );
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          reply_texts: { error: 'Please try again.', pairing_code: 'Your code is {pairing_code}.' },
        }),
      );
    });
  });

  it("surfaces a server attach-check refusal through the dialog's error state", async () => {
    const user = userEvent.setup({ delay: null });
    const refusal = 'cannot bind agent to route: an asking agent needs a reply or resume path';
    const createOrReplaceConversationRoute = vi.fn().mockRejectedValue(new Error(refusal));
    renderDialog({ client: { createOrReplaceConversationRoute } });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'events');
    await pickTarget(user, 'Agent', 'assistant');
    await pickChannelDoor(user, 'whatsapp', '+15550000000');
    await pickKey(user);
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(refusal);
  });

  it('blocks submit with inline errors and never calls the API when required fields are blank', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn();
    renderDialog({ client: { createOrReplaceConversationRoute } });
    await openSelect(user, 'Execution key');
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Create route' }));

    expect(await screen.findByText('A route name is required.')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Execution key' })).toHaveAccessibleDescription(
      expect.stringContaining('An execution key is required.') as string,
    );
    expect(createOrReplaceConversationRoute).not.toHaveBeenCalled();
  });

  it('names the blank picked fields of a channel route', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn();
    renderDialog({ client: { createOrReplaceConversationRoute } });

    await pickOption(user, 'Target kind', 'Tool');
    await pickOption(user, 'Door', 'Channel');
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    expect(await screen.findByText('A tool name is required.')).toBeInTheDocument();
    expect(screen.getByText('A channel is required.')).toBeInTheDocument();
    expect(screen.getByText('An identity is required.')).toBeInTheDocument();
    expect(createOrReplaceConversationRoute).not.toHaveBeenCalled();
  });

  it('rejects a non-slug route name locally before any request', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn();
    renderDialog({ client: { createOrReplaceConversationRoute } });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'Not A Slug');
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    expect(
      await screen.findByText('Use lowercase letters, digits and hyphens.'),
    ).toBeInTheDocument();
    expect(createOrReplaceConversationRoute).not.toHaveBeenCalled();
  });

  it('rejects a callback URL carrying a user name locally before any request', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn();
    renderDialog({ client: { createOrReplaceConversationRoute } });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'account');
    await pickTarget(user, 'Agent', 'assistant');
    await pickOption(user, 'Door', 'API');
    await user.type(
      screen.getByRole('textbox', { name: 'Callback URL' }),
      'https://user@sink.example/cb',
    );
    await pickKey(user);
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    expect(
      await screen.findByText('Must be an absolute https URL with no user name or password.'),
    ).toBeInTheDocument();
    expect(createOrReplaceConversationRoute).not.toHaveBeenCalled();
  });

  it('creates a poll-only api route with no callback URL', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: true,
      route_name: 'account',
      route: makeRoute({ route_name: 'account', door: 'api', channel: null, our_identity: null }),
      callback_secret: null,
    });
    renderDialog({ client: { createOrReplaceConversationRoute } });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'account');
    await pickTarget(user, 'Agent', 'assistant');
    await pickOption(user, 'Door', 'API');
    await pickKey(user);
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledTimes(1);
    });
    expect(createOrReplaceConversationRoute.mock.calls[0]?.[0]).toMatchObject({
      route_name: 'account',
      door: 'api',
      callback_url: null,
    });
  });

  async function reachSecretReveal(user: User, onClose: () => void): Promise<void> {
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: true,
      route_name: 'account',
      route: makeRoute({ route_name: 'account', door: 'api' }),
      callback_secret: 'super-secret-token',
    });
    renderDialog({ client: { createOrReplaceConversationRoute }, onClose });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'account');
    await pickTarget(user, 'Agent', 'assistant');
    await pickOption(user, 'Door', 'API');
    await user.type(
      screen.getByRole('textbox', { name: 'Callback URL' }),
      'https://sink.example/cb',
    );
    await pickKey(user);
    await user.click(screen.getByRole('button', { name: 'Create route' }));
    expect(await screen.findByText('super-secret-token')).toBeInTheDocument();
  }

  it('reveals the api-door callback secret once, then closes on Done', async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    await reachSecretReveal(user, onClose);

    expect(screen.getByText(/Shown once/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the revealed secret on Escape, then closes only on the explicit Done', async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    await reachSecretReveal(user, onClose);

    // Escape must NOT dismiss the reveal — the secret cannot be re-read.
    await user.keyboard('{Escape}');
    expect(screen.getByText('super-secret-token')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('RouteFormDialog — "Our identity" description', () => {
  it('asks for a channel first, then shows the picked channel hint or the fallback', async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog();

    await pickOption(user, 'Door', 'Channel');
    expect(identityBox()).toHaveAccessibleDescription('Pick a channel to see what to enter here.');
    await pickOption(user, 'Channel', 'whatsapp');
    expect(identityBox()).toHaveAccessibleDescription(WHATSAPP_HINT);
    await user.type(identityBox(), '+15550000000');
    await pickOption(user, 'Channel', 'telegram');
    expect(identityBox()).toHaveAccessibleDescription(IDENTITY_FALLBACK);
    // Changing the channel keeps the identity the operator typed.
    expect(identityBox()).toHaveValue('+15550000000');
  });

  it('reads the loading line while the channel list is pending', () => {
    const initial = makeRoute({ channel: 'whatsapp' });
    renderDialog({ initial, client: { listChannels: vi.fn().mockReturnValue(never()) } });

    expect(identityBox()).toHaveAccessibleDescription("Loading this channel's hint…");
  });

  it('reads the could-not-load line and the error when the channel list fails', async () => {
    const initial = makeRoute({ channel: 'whatsapp' });
    renderDialog({
      initial,
      client: { listChannels: vi.fn().mockRejectedValue(new ApiError('boom', 500)) },
    });

    await waitFor(() => {
      expect(identityBox()).toHaveAccessibleDescription(
        `${IDENTITY_FALLBACK} The channel's hint could not be loaded.`,
      );
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('reads the not-installed line for a stored channel the list does not hold', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi
      .fn()
      .mockRejectedValue(new ApiError("route channel 'sms' is not a registered channel", 400));
    renderDialog({
      initial: makeRoute({ channel: 'sms' }),
      client: { createOrReplaceConversationRoute },
    });

    const channel = await screen.findByRole('combobox', { name: 'Channel' });
    await waitFor(() => {
      expect(channel).toHaveTextContent('sms (not installed)');
    });
    expect(screen.getByText('not installed')).toBeInTheDocument();
    expect(
      screen.getByText('sms is not installed. Pick another, or saving is refused.'),
    ).toBeInTheDocument();
    expect(identityBox()).toHaveAccessibleDescription(
      `${IDENTITY_FALLBACK} This channel is not installed, so it offers no hint.`,
    );

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "route channel 'sms' is not a registered channel",
    );
  });
});

describe('RouteFormDialog — refused and failed picker reads', () => {
  const forbidden = (): Promise<never> => Promise.reject(new ApiError('forbidden', 403));

  it('takes a typed agent name under a 403 and saves it', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: false,
      route_name: 'chat',
      route: makeRoute(),
      callback_secret: null,
    });
    renderDialog({
      initial: makeRoute({ execution_key: 'svc-events' }),
      client: { listAgents: vi.fn(forbidden), createOrReplaceConversationRoute },
    });

    const input = await screen.findByRole('textbox', { name: 'Agent' });
    expect(input).toHaveValue('assistant');
    expect(input).toHaveAccessibleDescription(/cannot list agents, so type the agent's exact name/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'helper');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledWith(
        expect.objectContaining({ target_kind: 'agent', target_name: 'helper' }),
      );
    });
  });

  it('takes a typed tool name under a 403 and saves it', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: false,
      route_name: 'chat',
      route: makeRoute(),
      callback_secret: null,
    });
    renderDialog({
      initial: makeRoute({ target_kind: 'tool', target_name: 'lookup_record' }),
      client: { listTools: vi.fn(forbidden), createOrReplaceConversationRoute },
    });

    const input = await screen.findByRole('textbox', { name: 'Tool' });
    expect(input).toHaveValue('lookup_record');
    expect(input).toHaveAccessibleDescription(/cannot list tools, so type the tool's exact name/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, 'fetch_record');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledWith(
        expect.objectContaining({ target_kind: 'tool', target_name: 'fetch_record' }),
      );
    });
  });

  it('states both failures, without the tool search, when the tool and tool-description reads both fail', async () => {
    renderDialog({
      initial: makeRoute({ target_kind: 'tool', target_name: 'lookup_record' }),
      client: {
        listTools: vi.fn().mockRejectedValue(new ApiError('tools down', 500)),
        listToolTags: vi.fn().mockRejectedValue(new ApiError('tags down', 500)),
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('tools down');
    expect(await screen.findByText('Could not load tool descriptions: tags down.')).toBeVisible();
    expect(document.body).not.toHaveTextContent('The tool search matches tool names only.');
  });

  it('shows the error state when the tool list fails', async () => {
    renderDialog({
      initial: makeRoute({ target_kind: 'tool', target_name: 'lookup_record' }),
      client: { listTools: vi.fn().mockRejectedValue(new ApiError('boom', 500)) },
    });

    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('takes a typed channel name and shows the no-hint identity line under a 403', async () => {
    renderDialog({ initial: makeRoute(), client: { listChannels: vi.fn(forbidden) } });

    const input = await screen.findByRole('textbox', { name: 'Channel' });
    expect(input).toHaveAccessibleDescription(
      /cannot list channels, so type the channel's exact name/,
    );
    expect(identityBox()).toHaveAccessibleDescription(
      `${IDENTITY_FALLBACK} This session cannot read the channel list, so no hint is shown.`,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the api-keys note under a 403', async () => {
    renderDialog({ initial: makeRoute(), client: { listTokensPayload: vi.fn(forbidden) } });

    expect(
      await screen.findByText(
        'This session cannot list api keys. Picking one needs read access to GET /api/auth/tokens-payload; ask an administrator to grant it.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('RouteFormDialog — shared list reads', () => {
  it('draws the channel and agent options from data another screen already read', async () => {
    const user = userEvent.setup({ delay: null });
    const listChannels = vi.fn().mockReturnValue(never());
    const listAgents = vi.fn().mockReturnValue(never());
    renderDialog({
      client: { listChannels, listAgents },
      seed: (queryClient) => {
        queryClient.setQueryData(channelsListKey, channelListing([['signal', null]]));
        queryClient.setQueryData(agentsListKey, agentListing(['planner']));
      },
    });

    await pickOption(user, 'Door', 'Channel');
    await openSelect(user, 'Channel');
    expect(await screen.findByRole('option', { name: 'signal' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await pickOption(user, 'Target kind', 'Agent');
    await openSelect(user, 'Agent');
    expect(await screen.findByRole('option', { name: 'planner' })).toBeInTheDocument();
  });
});

describe('RouteFormDialog — access control off', () => {
  it('shows no execution key field, reads no key list, and creates as the fill identity', async () => {
    const user = userEvent.setup({ delay: null });
    const listTokensPayload = vi.fn();
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: true,
      route_name: 'events',
      route: makeRoute(),
      callback_secret: null,
    });
    renderDialog({
      projection: gateOffProjection(),
      client: { listTokensPayload, createOrReplaceConversationRoute },
    });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'events');
    await pickTarget(user, 'Agent', 'assistant');
    await pickChannelDoor(user, 'whatsapp', '+15550000000');
    expect(screen.queryByRole('combobox', { name: 'Execution key' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledWith(
        expect.objectContaining({ execution_key: '__no_auth__' }),
      );
    });
    expect(listTokensPayload).not.toHaveBeenCalled();
  });

  it('sends the stored key on an edit', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: false,
      route_name: 'chat',
      route: makeRoute(),
      callback_secret: null,
    });
    renderDialog({
      initial: makeRoute({ execution_key: 'svc-chat' }),
      projection: gateOffProjection(),
      client: { createOrReplaceConversationRoute },
    });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledWith(
        expect.objectContaining({ execution_key: 'svc-chat' }),
      );
    });
  });
});

describe('RouteFormDialog — overlap', () => {
  it('renders the blank Overlap group with the two policy radios and the settle field', () => {
    renderDialog();

    const overlap = screen.getByRole('group', { name: 'Overlap' });
    expect(overlap).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Running turn' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Deliver' })).toBeInTheDocument();
    const settle = screen.getByRole('spinbutton', { name: /^Settle window/ });
    expect(settle).toHaveValue(null);
    // Nothing is preselected: the hint carries the defaults.
    for (const radio of within(overlap).getAllByRole('radio')) {
      expect(radio).not.toBeChecked();
    }
  });

  it('shows the settle-window cross-field error inline and blocks submit', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn();
    renderDialog({ client: { createOrReplaceConversationRoute } });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'account');
    await pickTarget(user, 'Agent', 'assistant');
    await pickChannelDoor(user, 'telegram', '+15550000000');
    await pickKey(user);
    // A settle window with the default continue + one policy is refused.
    await user.type(screen.getByRole('spinbutton', { name: /^Settle window/ }), '5');
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    expect(
      await screen.findByText(
        'A settle window needs Deliver set to all or Running turn set to cancel.',
      ),
    ).toBeInTheDocument();
    expect(createOrReplaceConversationRoute).not.toHaveBeenCalled();
  });

  it('sends the set overlap policy in the submit body', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: true,
      route_name: 'account',
      route: makeRoute(),
      callback_secret: null,
    });
    renderDialog({ client: { createOrReplaceConversationRoute } });

    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'account');
    await pickTarget(user, 'Agent', 'assistant');
    await pickChannelDoor(user, 'telegram', '+15550000000');
    await pickKey(user);
    await user.click(
      within(screen.getByRole('group', { name: 'Running turn' })).getByRole('radio', {
        name: 'cancel',
      }),
    );
    await user.click(
      within(screen.getByRole('group', { name: 'Deliver' })).getByRole('radio', { name: 'all' }),
    );
    await user.type(screen.getByRole('spinbutton', { name: /^Settle window/ }), '5');
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          overlap: { running: 'cancel', deliver: 'all', settle_seconds: 5 },
        }),
      );
    });
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
    start_expr: { content: '.message' },
    reply_expr: null,
    initial_mode: 'manual',
    execution_key: 'svc-events',
  });

  it('prefills from the route and shows the name read-only', async () => {
    renderDialog({ initial: existing });

    expect(screen.getByDisplayValue('chat')).toBeDisabled();
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Tool' })).toHaveTextContent('lookup_account');
    });
    expect(screen.getByRole('combobox', { name: 'Target kind' })).toHaveTextContent('Tool');
    expect(screen.getByRole('combobox', { name: 'Door' })).toHaveTextContent('API');
    expect(screen.getByRole('textbox', { name: 'Start expression' })).toHaveValue('.message');
    expect(screen.getByRole('textbox', { name: 'Callback URL' })).toHaveValue(
      'https://sink.example/answers',
    );
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('saves back over the same route on submit', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: false,
      route_name: 'chat',
      route: existing,
      callback_secret: 'rotated-secret',
    });
    renderDialog({ initial: existing, client: { createOrReplaceConversationRoute } });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          route_name: 'chat',
          door: 'api',
          target_kind: 'tool',
          target_name: 'lookup_account',
          start_expr: { content: '.message' },
          initial_mode: 'manual',
          execution_key: 'svc-events',
          callback_url: 'https://sink.example/answers',
        }),
      );
    });
    // An api-door save rotates the secret — the reveal shows the new one.
    expect(await screen.findByText('rotated-secret')).toBeInTheDocument();
  });
});
