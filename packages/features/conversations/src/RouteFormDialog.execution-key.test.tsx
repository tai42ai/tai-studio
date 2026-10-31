/**
 * The route dialog's execution key: a stored key the list does not hold and how it
 * compares with the session's own identity, the session's identity offered as a choice,
 * the account session that has nothing to pick, and the blank-key check.
 */
import { ApiError, type MeProjection } from '@tai42/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RouteFormDialog } from './RouteFormDialog';
import {
  accountSessionProjection,
  adminKeySessionProjection,
  agentListing,
  apiKey,
  channelListing,
  keySessionProjection,
  makeRoute,
  openSelect,
  pickOption,
  renderWithProviders,
  type StubApiClient,
} from './test-utils';

/** A non-admin key session whose own `user_id` is `alice` (owned by the account `alice-owner`). */
const aliceKey = (): MeProjection =>
  keySessionProjection({
    user_id: 'alice',
    owner_user_id: 'alice-owner',
    principal: { user_id: 'alice-owner', display_name: 'Alice', kind: 'human' },
  });

const saved = () =>
  vi.fn().mockResolvedValue({
    created: false,
    route_name: 'chat',
    route: makeRoute(),
    callback_secret: null,
  });

function renderDialog({
  keys,
  projection,
  boundTo,
  client = {},
  onClose = vi.fn(),
}: {
  readonly keys: readonly string[] | 'forbidden';
  readonly projection: MeProjection;
  readonly boundTo?: string;
  readonly client?: StubApiClient;
  readonly onClose?: () => void;
}) {
  const listTokensPayload =
    keys === 'forbidden'
      ? vi.fn().mockRejectedValue(new ApiError('forbidden', 403))
      : vi.fn().mockResolvedValue(keys.map((user_id) => apiKey({ user_id })));
  return renderWithProviders(
    <RouteFormDialog
      initial={boundTo === undefined ? undefined : makeRoute({ execution_key: boundTo })}
      onClose={onClose}
    />,
    {
      client: {
        listAgents: vi.fn().mockResolvedValue(agentListing(['assistant'])),
        listTools: vi.fn().mockResolvedValue([]),
        listToolTags: vi.fn().mockResolvedValue([]),
        listChannels: vi.fn().mockResolvedValue(channelListing([['whatsapp', null]])),
        listTokensPayload,
        ...client,
      },
      projection,
    },
  );
}

const keyBox = (): Promise<HTMLElement> => screen.findByRole('combobox', { name: 'Execution key' });

async function expectTrigger(text: string): Promise<void> {
  const trigger = await keyBox();
  await waitFor(() => {
    expect(trigger).toHaveTextContent(text);
  });
}

describe('RouteFormDialog — a stored key the list does not hold', () => {
  it('reads the non-admin hint and the not-your-identity line, and shows the refusal on save', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi
      .fn()
      .mockRejectedValue(
        new ApiError('you may only bind your own identity or an execution key you own', 403),
      );
    renderDialog({
      keys: ['svc-a'],
      projection: aliceKey(),
      boundTo: 'svc-x',
      client: { createOrReplaceConversationRoute },
    });

    await expectTrigger('svc-x (not a listed key)');
    expect(
      screen.getByText(
        'svc-x is not a listed key. The server accepts an unlisted key only when it is your own identity; any other value is refused on save.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('not your identity')).toBeInTheDocument();
    expect(
      screen.getByText(
        "svc-x is not this session's identity (alice), so the server will refuse it on save.",
      ),
    ).toBeInTheDocument();

    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeEnabled();
    await user.click(save);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'you may only bind your own identity or an execution key you own',
    );
  });

  it("selects the session's own identity when the route is bound to it, with neither line", async () => {
    renderDialog({ keys: ['svc-a'], projection: aliceKey(), boundTo: 'alice' });

    await expectTrigger("alice — this session's identity");
    expect(screen.queryByText(/is not a listed key/)).not.toBeInTheDocument();
    expect(screen.queryByText(/is not this session's identity/)).not.toBeInTheDocument();
  });

  it('reads the admin hint and the plain identity line, and saves', async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    const createOrReplaceConversationRoute = saved();
    renderDialog({
      keys: ['root-key', 'svc-a'],
      projection: adminKeySessionProjection(),
      boundTo: 'ops-human',
      client: { createOrReplaceConversationRoute },
      onClose,
    });

    await expectTrigger('ops-human (not a listed key)');
    expect(
      screen.getByText(
        'ops-human is not a listed key. As an admin you may bind another identity; the server checks it on save.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("ops-human is not this session's identity (root-key)."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/accepts an unlisted key only/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(createOrReplaceConversationRoute).toHaveBeenCalledWith(
      expect.objectContaining({ execution_key: 'ops-human' }),
    );
  });

  it('clears both lines once the admin picks their own key, and sends it', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = saved();
    renderDialog({
      keys: ['root-key', 'svc-a'],
      projection: adminKeySessionProjection(),
      boundTo: 'ops-human',
      client: { createOrReplaceConversationRoute },
    });

    await expectTrigger('ops-human (not a listed key)');
    await pickOption(user, 'Execution key', 'root-key');
    expect(screen.queryByText(/is not a listed key/)).not.toBeInTheDocument();
    expect(screen.queryByText(/is not this session's identity/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledWith(
        expect.objectContaining({ execution_key: 'root-key' }),
      );
    });
  });

  it('shows neither line when the key list is refused', async () => {
    renderDialog({ keys: 'forbidden', projection: aliceKey(), boundTo: 'svc-x' });

    expect(
      await screen.findByText(
        'This session cannot list api keys. Picking one needs read access to GET /api/auth/tokens-payload; ask an administrator to grant it.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/is not a listed key/)).not.toBeInTheDocument();
    expect(screen.queryByText(/is not this session's identity/)).not.toBeInTheDocument();
  });
});

describe("RouteFormDialog — the session's own identity", () => {
  async function fillAllButKey(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.type(screen.getByRole('textbox', { name: 'Route name' }), 'events');
    await pickOption(user, 'Target kind', 'Agent');
    await pickOption(user, 'Agent', 'assistant');
    await pickOption(user, 'Door', 'API');
  }

  it('offers a key session its own identity over an empty list and creates with it', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn().mockResolvedValue({
      created: true,
      route_name: 'events',
      route: makeRoute(),
      callback_secret: null,
    });
    renderDialog({
      keys: [],
      projection: keySessionProjection(),
      client: { createOrReplaceConversationRoute },
    });

    await fillAllButKey(user);
    await pickOption(user, 'Execution key', "alice-key — this session's identity");
    expect(
      screen.getByText(
        "This runs as this session's own identity, alice-key, with its live grants.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    await waitFor(() => {
      expect(createOrReplaceConversationRoute).toHaveBeenCalledWith(
        expect.objectContaining({ execution_key: 'alice-key' }),
      );
    });
  });

  it('opens a route stored with the own identity selected, with no unlisted or identity line', async () => {
    renderDialog({ keys: [], projection: keySessionProjection(), boundTo: 'alice-key' });

    await expectTrigger("alice-key — this session's identity");
    expect(screen.queryByText(/is not a listed key/)).not.toBeInTheDocument();
    expect(screen.queryByText(/is not this session's identity/)).not.toBeInTheDocument();
  });

  it('offers an admin whose list holds their key exactly one option for it', async () => {
    const user = userEvent.setup({ delay: null });
    renderDialog({ keys: ['root-key', 'svc-a'], projection: adminKeySessionProjection() });

    await openSelect(user, 'Execution key');
    expect(await screen.findAllByRole('option', { name: /root-key/ })).toHaveLength(1);
    expect(
      screen.queryByRole('option', { name: /this session's identity/ }),
    ).not.toBeInTheDocument();
  });

  it('reads the account note over an empty list, and a blank save shows no key line and sends nothing', async () => {
    const user = userEvent.setup({ delay: null });
    const createOrReplaceConversationRoute = vi.fn();
    renderDialog({
      keys: [],
      projection: accountSessionProjection(),
      client: { createOrReplaceConversationRoute },
    });

    expect(
      await screen.findByText(
        'No api keys of yours are listed. You are signed in as an account, not an api key, so your own identity cannot be picked here. Mint a key on the settings API-keys tab first.',
      ),
    ).toBeInTheDocument();
    await fillAllButKey(user);
    await user.click(screen.getByRole('button', { name: 'Create route' }));

    expect(screen.getByText(/You are signed in as an account, not an api key/)).toBeInTheDocument();
    expect(screen.queryByText('An execution key is required.')).not.toBeInTheDocument();
    expect(createOrReplaceConversationRoute).not.toHaveBeenCalled();
  });

  it("reads the account lines for a route bound to the session's account, and the refusal on save", async () => {
    const user = userEvent.setup({ delay: null });
    const refusal =
      "execution key 'alice' is an account, not an api key; a route, hook, trigger link or schedule runs as an api key, so bind an api key instead";
    const createOrReplaceConversationRoute = vi.fn().mockRejectedValue(new ApiError(refusal, 400));
    renderDialog({
      keys: [],
      projection: accountSessionProjection(),
      boundTo: 'alice',
      client: { createOrReplaceConversationRoute },
    });

    await expectTrigger('alice (not a listed key)');
    expect(
      screen.getByText(
        'alice is not a listed key. The server accepts only an api key you own; any other value is refused on save.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('not an api key')).toBeInTheDocument();
    expect(
      screen.getByText(
        "alice is this session's account, not an api key, so the server will refuse it on save.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(refusal);
  });

  it('reads the account hint and the identity line for a route bound to another key', async () => {
    renderDialog({ keys: [], projection: accountSessionProjection(), boundTo: 'svc-x' });

    await expectTrigger('svc-x (not a listed key)');
    expect(
      screen.getByText(
        'svc-x is not a listed key. The server accepts only an api key you own; any other value is refused on save.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "svc-x is not this session's identity (alice), so the server will refuse it on save.",
      ),
    ).toBeInTheDocument();
  });

  for (const keys of [[], 'forbidden'] as const) {
    it(`shows the required line for a blank key over ${keys === 'forbidden' ? 'a refused' : 'an empty'} list`, async () => {
      const user = userEvent.setup({ delay: null });
      const createOrReplaceConversationRoute = vi.fn();
      renderDialog({
        keys,
        projection: keySessionProjection(),
        client: { createOrReplaceConversationRoute },
      });

      await fillAllButKey(user);
      await waitFor(async () => {
        expect(await keyBox()).toBeEnabled();
      });
      await user.click(screen.getByRole('button', { name: 'Create route' }));

      expect(await keyBox()).toHaveAccessibleDescription(
        expect.stringContaining('An execution key is required.') as string,
      );
      expect(createOrReplaceConversationRoute).not.toHaveBeenCalled();
    });
  }
});
