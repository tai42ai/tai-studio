// The create and edit key dialogs' field guidance and scope choice: every field's
// one-line description reaches its control, Full access grants exactly the universal
// scope, and a key the server would refuse is refused before any request is sent.
import type { ApiClient, TokensPayload } from '@tai42/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiKeysTab } from './ApiKeysTab';
import { DESCRIPTION_REQUIRED, scopeOrConditionRequired } from './key-form-rules';
import {
  DESCRIPTION_HINT,
  KEY_USER_ID_FIXED_HINT,
  KEY_USER_ID_HINT,
  scopesHint,
} from './KeyFormFields';
import { CONDITION_HINT, POLICY_DATA_HINT } from './PolicySection';
import { FULL_ACCESS_LABEL, FULL_ACCESS_WARNING } from './ScopePicker';
import { fullProjection, renderWithProviders, scopedProjection } from './test-utils';

function key(overrides: Partial<TokensPayload[number]> = {}): TokensPayload[number] {
  return {
    condition: null,
    principal: null,
    orphaned: false,
    user_id: 'alice',
    description: 'Alice key',
    scopes: ['admin'],
    policy_data: {},
    ...overrides,
  };
}

type Stub = Partial<Record<keyof ApiClient, unknown>>;
function baseStub(overrides: Stub = {}): ApiClient {
  return {
    listTokensPayload: vi.fn(() => Promise.resolve([key()])),
    listScopes: vi.fn(() =>
      Promise.resolve({
        'https://a.com': 'admin',
        'https://c.com': 'read',
        'https://pub': 'public',
      }),
    ),
    getAuthCapabilities: vi.fn(() => Promise.resolve({ mintable: true, providers: [] })),
    listTemplates: vi.fn(() => Promise.resolve([])),
    validateCondition: vi.fn(() => Promise.resolve({ ok: true, result: null })),
    listAuthRoutes: vi.fn(() => Promise.resolve([])),
    listPublicRoutes: vi.fn(() => Promise.resolve([])),
    listSubMcp: vi.fn(() => Promise.resolve({})),
    listPrincipals: vi.fn(() => Promise.resolve([])),
    listRoles: vi.fn(() => Promise.resolve([])),
    ...overrides,
  } as unknown as ApiClient;
}

async function openCreate(client: ApiClient, projection = fullProjection()) {
  const user = userEvent.setup({ delay: null });
  renderWithProviders(<ApiKeysTab publicId="public" />, { client, projection });
  await screen.findByText('alice');
  await user.click(screen.getByRole('button', { name: 'Create key' }));
  return user;
}

describe('ApiKeysTab — key field guidance', () => {
  it('describes every create-dialog field through its control', async () => {
    const user = await openCreate(baseStub());

    expect(screen.getByRole('textbox', { name: 'Key user ID' })).toHaveAccessibleDescription(
      KEY_USER_ID_HINT,
    );
    expect(screen.getByRole('textbox', { name: 'Description' })).toHaveAccessibleDescription(
      DESCRIPTION_HINT,
    );
    expect(screen.getByRole('group', { name: 'Scopes' })).toHaveAccessibleDescription(
      scopesHint(true),
    );
    expect(await screen.findByRole('combobox', { name: 'Principal' })).toHaveAccessibleDescription(
      /^Required\. Who owns the key/,
    );
    expect(screen.getByRole('group', { name: 'Condition' })).toHaveAccessibleDescription(
      CONDITION_HINT,
    );
    await user.click(screen.getByRole('button', { name: 'Add Policy data row' }));
    expect(screen.getByLabelText('Policy data key 1')).toHaveAccessibleDescription(
      POLICY_DATA_HINT,
    );
  });

  it("tells the key's user ID apart from the inline principal's optional user ID", async () => {
    const user = await openCreate(baseStub());
    await user.click(await screen.findByRole('combobox', { name: 'Principal' }));
    await user.click(await screen.findByRole('option', { name: 'Create a service principal…' }));

    const keyUserId = screen.getByRole('textbox', { name: 'Key user ID' });
    const principalUserId = screen.getByRole('textbox', { name: 'Principal user ID' });
    expect(keyUserId).not.toBe(principalUserId);
    expect(keyUserId).toHaveAccessibleDescription(KEY_USER_ID_HINT);
    expect(principalUserId).toHaveAccessibleDescription('Optional. Leave empty to generate one.');
    expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveAccessibleDescription(
      'Required. The name shown for this principal.',
    );
  });
});

describe('ApiKeysTab — scope choice and refusals', () => {
  it('Full access hides the individual scopes, warns, and mints exactly ["*"]', async () => {
    const createApiKey = vi.fn().mockResolvedValue('sk-full');
    const user = await openCreate(baseStub({ createApiKey }));

    await user.type(screen.getByLabelText('Key user ID'), 'bob');
    await user.type(screen.getByLabelText('Description'), 'Bob key');
    await user.click(screen.getByRole('checkbox', { name: 'read' }));
    expect(screen.queryByText(FULL_ACCESS_WARNING)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: FULL_ACCESS_LABEL }));
    expect(screen.getByText(FULL_ACCESS_WARNING).closest('[role="status"]')).not.toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'read' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith({
        user_id: 'bob',
        description: 'Bob key',
        scopes: ['*'],
        owner_user_id: 'u-test',
      });
    });
  });

  it('refuses a key with no scope and no condition before sending', async () => {
    const createApiKey = vi.fn();
    const user = await openCreate(baseStub({ createApiKey }));

    await user.type(screen.getByLabelText('Key user ID'), 'bob');
    await user.type(screen.getByLabelText('Description'), 'Bob key');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(scopeOrConditionRequired(true));
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('leaves Full access out of the hint and the refusal when the box is not offered', async () => {
    const createApiKey = vi.fn();
    const routes = [{ path: '/api/auth/api-keys', methods: ['POST'] }];
    const user = await openCreate(
      baseStub({ createApiKey }),
      scopedProjection({ scopes: ['read'], routes }),
    );
    expect(screen.queryByRole('checkbox', { name: FULL_ACCESS_LABEL })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Scopes' })).toHaveAccessibleDescription(
      'What the key may call. Pick at least one scope, unless you set a condition under Policy.',
    );

    await user.type(screen.getByLabelText('Key user ID'), 'bob');
    await user.type(screen.getByLabelText('Description'), 'Bob key');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Choose at least one scope, or set a condition under Policy. A key with neither grants nothing.',
    );
    expect(alert).not.toHaveTextContent('Full access');
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('names Full access in the hint and the refusal when the box is offered', async () => {
    const createApiKey = vi.fn();
    const user = await openCreate(baseStub({ createApiKey }));
    expect(screen.getByRole('checkbox', { name: FULL_ACCESS_LABEL })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Scopes' })).toHaveAccessibleDescription(
      'What the key may call. Pick at least one scope or Full access, unless you set a condition under Policy.',
    );

    await user.type(screen.getByLabelText('Key user ID'), 'bob');
    await user.type(screen.getByLabelText('Description'), 'Bob key');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose at least one scope or Full access, or set a condition under Policy. ' +
        'A key with none of them grants nothing.',
    );
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it("warns that Full access reaches no further than the owner's access", async () => {
    const user = await openCreate(baseStub());
    await user.click(screen.getByRole('checkbox', { name: FULL_ACCESS_LABEL }));

    const warning = screen.getByText(/This key has every scope/).closest('[role="status"]');
    expect(warning).not.toBeNull();
    expect(warning).toHaveTextContent(
      "It reaches no further than its owner's access. If the owner is an administrator and " +
        'the key has no condition, the key is an administrator too',
    );
    expect(warning).not.toHaveTextContent(/not make its holder an administrator/);
  });

  it('refuses a key with no description before sending', async () => {
    const createApiKey = vi.fn();
    const user = await openCreate(baseStub({ createApiKey }));

    await user.type(screen.getByLabelText('Key user ID'), 'bob');
    await user.click(screen.getByRole('checkbox', { name: 'read' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(DESCRIPTION_REQUIRED);
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('mints a key that carries a condition and no scope', async () => {
    const createApiKey = vi.fn().mockResolvedValue('sk-cond');
    const user = await openCreate(baseStub({ createApiKey }));

    await user.type(screen.getByLabelText('Key user ID'), 'bob');
    await user.type(screen.getByLabelText('Description'), 'Bob key');
    await user.type(screen.getByRole('textbox', { name: 'Condition' }), '.policy.limit > 0');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({ scopes: [], condition: { content: '.policy.limit > 0' } }),
      );
    });
  });

  it('offers Full access to a scoped session only when it holds "*" itself', async () => {
    const routes = [{ path: '/api/auth/api-keys', methods: ['POST'] }];
    const { unmount } = renderWithProviders(<ApiKeysTab publicId="public" />, {
      client: baseStub(),
      projection: scopedProjection({ scopes: ['read'], routes }),
    });
    const user = userEvent.setup({ delay: null });
    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    expect(screen.getByRole('checkbox', { name: 'read' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: FULL_ACCESS_LABEL })).not.toBeInTheDocument();
    unmount();

    await openCreate(baseStub(), scopedProjection({ scopes: ['*'], routes }));
    expect(screen.getByRole('checkbox', { name: FULL_ACCESS_LABEL })).toBeInTheDocument();
  });

  it('lists a "*" key as Full access in the keys table', async () => {
    renderWithProviders(<ApiKeysTab publicId="public" />, {
      client: baseStub({
        listTokensPayload: vi.fn(() => Promise.resolve([key({ scopes: ['*'] })])),
      }),
      projection: fullProjection(),
    });
    expect(await screen.findByText('Full access')).toBeInTheDocument();
  });
});

describe('ApiKeysTab — edit with Full access', () => {
  function editStub(stored: TokensPayload[number], editApiKey: unknown): ApiClient {
    return baseStub({ editApiKey, listTokensPayload: vi.fn(() => Promise.resolve([stored])) });
  }

  async function openEdit(client: ApiClient) {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<ApiKeysTab publicId="public" />, { client, projection: fullProjection() });
    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));
    return user;
  }

  it('opens a "*" key as Full access and keeps its stored scopes on an untouched save', async () => {
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    const user = await openEdit(editStub(key({ scopes: ['*'] }), editApiKey));

    expect(screen.getByRole('textbox', { name: 'Key user ID' })).toHaveAccessibleDescription(
      KEY_USER_ID_FIXED_HINT,
    );
    expect(screen.getByRole('checkbox', { name: FULL_ACCESS_LABEL })).toBeChecked();
    expect(screen.getByText(FULL_ACCESS_WARNING).closest('[role="status"]')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalledWith('alice', { description: 'Alice key' });
    });
  });

  it('turning Full access off saves the chosen scopes instead', async () => {
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    const user = await openEdit(editStub(key({ scopes: ['*'] }), editApiKey));

    await user.click(screen.getByRole('checkbox', { name: FULL_ACCESS_LABEL }));
    await user.click(screen.getByRole('checkbox', { name: 'read' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalledWith('alice', {
        description: 'Alice key',
        scopes: ['read'],
      });
    });
  });

  it('refuses an edit that leaves no scope and no condition before sending', async () => {
    const editApiKey = vi.fn();
    const user = await openEdit(editStub(key(), editApiKey));

    await user.click(screen.getByRole('checkbox', { name: 'admin' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(scopeOrConditionRequired(true));
    expect(editApiKey).not.toHaveBeenCalled();
  });

  it('allows an edit that removes every scope while the stored condition stays', async () => {
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    const stored = key({ condition: { content: '.policy.limit > 0' } });
    const user = await openEdit(editStub(stored, editApiKey));

    await user.click(screen.getByRole('checkbox', { name: 'admin' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalledWith('alice', { description: 'Alice key', scopes: [] });
    });
  });
});
