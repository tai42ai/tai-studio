// The create/mint dialog mounts the full policy editor plus the template and
// condition-validate seams, so its flows are a genuinely heavy render chain — race-free
// but slow. The whole file gets explicit testTimeout headroom; correctness stays gated
// by real assertions and awaited signals. userEvent runs without its inter-key delay so
// a loaded runner cannot push a keystroke chain past the suite timeout.
import { type ApiClient, ApiError, type TokensPayload } from '@tai42/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiKeysTab } from './ApiKeysTab';
import {
  clickWhenInteractable,
  fullProjection,
  renderWithProviders,
  scopedProjection,
} from './test-utils';

/** A service-principal row as `listPrincipals` returns it. */
function servicePrincipal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    user_id: 'svc-1',
    kind: 'service' as const,
    display_name: 'Acme Bot',
    created_by: 'u-test',
    disabled: false,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** An editable role body as `listRoles` returns it. */
function role(name: string) {
  return {
    name,
    allow_all: false,
    base_tier: 'editor',
    condition: null,
    description: '',
    grants: {},
    scopes: [],
  };
}

vi.setConfig({ testTimeout: 15_000 });

function tokens(): TokensPayload {
  return [{ user_id: 'alice', description: 'Alice key', scopes: ['admin'], policy_data: {} }];
}
/** A key seeded with both a saved inline condition and policy data, so the
 * edit-dialog "Remove condition" / "Clear policy data" affordances have something
 * to remove. */
function seededTokens(): TokensPayload {
  return [
    {
      user_id: 'alice',
      description: 'Alice key',
      scopes: ['admin'],
      policy_data: { limit: 5 },
      condition: { content: '.policy.limit > 0' },
    },
  ];
}
function scopes(): Record<string, string> {
  return {
    'https://a.com': 'admin',
    'https://b.com': 'admin',
    'https://c.com': 'read',
    'https://pub': 'public',
  };
}

type Stub = Partial<Record<keyof ApiClient, unknown>>;
function stubClient(methods: Stub): ApiClient {
  return methods as unknown as ApiClient;
}
function baseStub(overrides: Stub = {}): ApiClient {
  return stubClient({
    listTokensPayload: vi.fn(() => Promise.resolve(tokens())),
    listScopes: vi.fn(() => Promise.resolve(scopes())),
    getAuthCapabilities: vi.fn(() => Promise.resolve({ mintable: true, providers: [] })),
    listTemplates: vi.fn(() => Promise.resolve(['ac_tier', 'ac_rate_limit'])),
    validateCondition: vi.fn(() => Promise.resolve({ ok: true, result: null })),
    listAuthRoutes: vi.fn(() => Promise.resolve([])),
    listPublicRoutes: vi.fn(() => Promise.resolve([])),
    listSubMcp: vi.fn(() => Promise.resolve({})),
    listPrincipals: vi.fn(() => Promise.resolve([])),
    listRoles: vi.fn(() => Promise.resolve([])),
    ...overrides,
  });
}

function renderTab(
  ui: Parameters<typeof renderWithProviders>[0],
  opts: Parameters<typeof renderWithProviders>[1],
) {
  return renderWithProviders(ui, { projection: fullProjection(), ...opts });
}

describe('ApiKeysTab — create key', () => {
  it('creates a key and shows the minted key once', async () => {
    const user = userEvent.setup({ delay: null });
    const createApiKey = vi.fn().mockResolvedValue('sk-generated-123');
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ createApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.type(screen.getByLabelText('Description'), 'Bob key');
    await user.click(screen.getByRole('checkbox', { name: 'admin' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      // Under an admin projection the picker defaults to the caller's own principal,
      // so the mint body carries that owner explicitly.
      expect(createApiKey).toHaveBeenCalledWith({
        user_id: 'bob',
        description: 'Bob key',
        scopes: ['admin'],
        owner_user_id: 'u-test',
      });
    });

    // The raw key is shown once…
    expect(await screen.findByText('sk-generated-123')).toBeInTheDocument();
    // …and is gone from the DOM after the dialog is dismissed (show-once).
    await clickWhenInteractable(user, screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByText('sk-generated-123')).not.toBeInTheDocument();
    });
  });

  it('reopens a blank create form with the minted key cleared', async () => {
    const user = userEvent.setup({ delay: null });
    const createApiKey = vi.fn().mockResolvedValue('sk-generated-123');
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ createApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.type(screen.getByLabelText('Description'), 'Bob key');
    await user.click(screen.getByRole('checkbox', { name: 'admin' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    // Dismiss the show-once minted-key dialog.
    await clickWhenInteractable(user, await screen.findByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByText('sk-generated-123')).not.toBeInTheDocument();
    });

    // Reopen: the form is blank (no pre-filled user_id/description/scopes) and the
    // minted key never resurfaces from stale mutation state.
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    expect(screen.getByLabelText('User ID')).toHaveValue('');
    expect(screen.getByLabelText('Description')).toHaveValue('');
    expect(screen.getByRole('checkbox', { name: 'admin' })).not.toBeChecked();
    expect(screen.queryByText('sk-generated-123')).not.toBeInTheDocument();
  });

  it('round-trips policy_data key/value rows into the create body', async () => {
    const user = userEvent.setup({ delay: null });
    const createApiKey = vi.fn().mockResolvedValue('sk-x');
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ createApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.click(screen.getByRole('button', { name: 'Add Policy data row' }));
    await user.type(screen.getByLabelText('Policy data key 1'), 'limit');
    await user.type(screen.getByLabelText('Policy data value 1'), '7');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    // A JSON-parseable value becomes its typed value (number 7), not the string "7".
    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith({
        user_id: 'bob',
        description: '',
        scopes: [],
        owner_user_id: 'u-test',
        policy_data: { limit: 7 },
      });
    });
  });

  it('does not block save when an inline jq condition fails its Test — warns, and saves anyway', async () => {
    const user = userEvent.setup({ delay: null });
    const createApiKey = vi.fn().mockResolvedValue('sk-x');
    const validateCondition = vi
      .fn()
      .mockRejectedValue(new ApiError('jq: syntax error, unexpected end of file', 400));
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ createApiKey, validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.type(screen.getByRole('textbox', { name: 'Condition' }), '.policy.limit >');

    // A failed Test surfaces the guard's compiler error verbatim…
    await user.click(screen.getByRole('button', { name: 'Test condition' }));
    expect(await screen.findByText('jq: syntax error, unexpected end of file')).toBeInTheDocument();
    // …and raises a NON-BLOCKING warning next to Save — the Test never gates the POST.
    expect(await screen.findByText(/failed its last test/)).toBeInTheDocument();

    // Saving proceeds despite the failed Test; the server re-validates at enforcement.
    await user.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'bob',
          condition: { content: '.policy.limit >' },
        }),
      );
    });
  });

  it('clears the failed-Test warning once the condition is edited', async () => {
    const user = userEvent.setup({ delay: null });
    const validateCondition = vi
      .fn()
      .mockRejectedValue(new ApiError('jq: syntax error, unexpected end of file', 400));
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByRole('textbox', { name: 'Condition' }), '.policy.limit >');
    await user.click(screen.getByRole('button', { name: 'Test condition' }));
    expect(await screen.findByText(/failed its last test/)).toBeInTheDocument();

    // Editing the condition clears the last Test result and its Save warning.
    await user.type(screen.getByRole('textbox', { name: 'Condition' }), ' 0');
    expect(screen.queryByText(/failed its last test/)).not.toBeInTheDocument();
  });

  it('the Test button sends {condition, sample_context} and badges an allowed sample', async () => {
    const user = userEvent.setup({ delay: null });
    const validateCondition = vi.fn().mockResolvedValue({ ok: true, result: true });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByRole('textbox', { name: 'Condition' }), '.policy.limit > 0');
    await user.click(screen.getByRole('button', { name: 'Test condition' }));

    expect(await screen.findByText('allows sample')).toBeInTheDocument();
    await waitFor(() => {
      expect(validateCondition).toHaveBeenCalled();
    });
    const body = validateCondition.mock.calls[0]?.[0] as Record<string, unknown>;
    // The Test compiles the inline jq the author typed, with the sample context so an
    // enforcement-faithful allow/deny is evaluated — and carries nothing else.
    expect(body.condition).toBe('.policy.limit > 0');
    expect(body.sample_context).toMatchObject({ sub: 'anon', scopes: [] });
    expect(Object.keys(body).sort()).toEqual(['condition', 'sample_context']);
  });

  it('the Test button badges a denied sample when the guard returns result false', async () => {
    const user = userEvent.setup({ delay: null });
    const validateCondition = vi.fn().mockResolvedValue({ ok: true, result: false });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByRole('textbox', { name: 'Condition' }), '.policy.limit > 0');
    await user.click(screen.getByRole('button', { name: 'Test condition' }));

    expect(await screen.findByText('denies sample')).toBeInTheDocument();
  });

  it('the Test button badges compile-only (no sample) when the sample editor is blank', async () => {
    const user = userEvent.setup({ delay: null });
    const validateCondition = vi.fn().mockResolvedValue({ ok: true, result: null });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByRole('textbox', { name: 'Condition' }), '.policy.limit > 0');
    await user.clear(screen.getByLabelText('Sample context (JSON)'));
    await user.click(screen.getByRole('button', { name: 'Test condition' }));

    expect(await screen.findByText('compiles (no sample evaluated)')).toBeInTheDocument();
    const body = validateCondition.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.condition).toBe('.policy.limit > 0');
    // A blank sample editor sends NO sample_context — the guard compiles only.
    expect(body).not.toHaveProperty('sample_context');
  });

  it('surfaces the guard 400 lock-out message VERBATIM and never rephrases it', async () => {
    const user = userEvent.setup({ delay: null });
    const lockout =
      'condition rendered empty — this would lock the key out of every request; refusing to save';
    const validateCondition = vi.fn().mockRejectedValue(new ApiError(lockout, 400));
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByRole('textbox', { name: 'Condition' }), '.policy.missing');
    await user.click(screen.getByRole('button', { name: 'Test condition' }));

    expect(await screen.findByText(lockout)).toBeInTheDocument();
  });

  it('blocks the Test with a loud field error on malformed sample-context JSON (no request)', async () => {
    const user = userEvent.setup({ delay: null });
    const validateCondition = vi.fn();
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByRole('textbox', { name: 'Condition' }), '.policy.limit > 0');
    const sample = screen.getByLabelText('Sample context (JSON)');
    await user.clear(sample);
    await user.type(sample, 'not json');
    await user.click(screen.getByRole('button', { name: 'Test condition' }));

    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(validateCondition).not.toHaveBeenCalled();
  });

  it('stored-template mode sends a condition with an id + kwargs and no inline content', async () => {
    const user = userEvent.setup({ delay: null });
    const createApiKey = vi.fn().mockResolvedValue('sk-x');
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ createApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.click(screen.getByRole('radio', { name: 'Stored template' }));

    await user.click(await screen.findByRole('combobox', { name: 'Condition' }));
    await user.click(await screen.findByRole('option', { name: 'ac_tier' }));

    await user.click(screen.getByRole('button', { name: 'Add render parameters' }));
    await user.type(screen.getByLabelText('Condition render parameters key 1'), 'tier');
    await user.type(screen.getByLabelText('Condition render parameters value 1'), 'pro');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          condition: { id: 'ac_tier', kwargs: { tier: 'pro' } },
        }),
      );
    });
    // Mutually exclusive by construction: no inline content rides alongside the id.
    const body = createApiKey.mock.calls[0]?.[0] as { condition: { content?: string } };
    expect(body.condition.content).toBeUndefined();
  });

  it('the clear affordances are absent in create mode (nothing to clear)', async () => {
    const user = userEvent.setup({ delay: null });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ listTokensPayload: vi.fn(() => Promise.resolve(seededTokens())) }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));

    expect(screen.queryByRole('button', { name: 'Remove condition' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear policy data' })).not.toBeInTheDocument();
  });

  it('admin picker lists self and every service principal, and the mint body carries the chosen owner', async () => {
    const user = userEvent.setup({ delay: null });
    const createApiKey = vi.fn().mockResolvedValue('sk-svc');
    const listPrincipals = vi.fn(() => Promise.resolve([servicePrincipal()]));
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ createApiKey, listPrincipals }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));

    // The caller's own principal leads the list, then every service principal.
    await user.click(await screen.findByRole('combobox', { name: 'Principal' }));
    expect(await screen.findByRole('option', { name: 'Test User (you)' })).toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Acme Bot' }));

    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'bob', owner_user_id: 'svc-1' }),
      );
    });
  });

  it('creates a service principal inline, selects it, and mints the key owned by it', async () => {
    const user = userEvent.setup({ delay: null });
    const createApiKey = vi.fn().mockResolvedValue('sk-new');
    const createPrincipal = vi
      .fn()
      .mockResolvedValue(servicePrincipal({ user_id: 'svc-new', display_name: 'New Bot' }));
    const listRoles = vi.fn(() => Promise.resolve([role('editor')]));
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ createApiKey, createPrincipal, listRoles }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));

    await user.click(await screen.findByRole('combobox', { name: 'Principal' }));
    await user.click(await screen.findByRole('option', { name: 'Create a service principal…' }));

    await user.type(screen.getByLabelText('Display name'), 'New Bot');
    await user.click(await screen.findByRole('combobox', { name: 'Role' }));
    await user.click(await screen.findByRole('option', { name: 'editor' }));
    await user.click(screen.getByRole('button', { name: 'Create principal' }));

    await waitFor(() => {
      expect(createPrincipal).toHaveBeenCalledWith({
        kind: 'service',
        display_name: 'New Bot',
        role: 'editor',
      });
    });

    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'bob', owner_user_id: 'svc-new' }),
      );
    });
  });

  it('a non-admin sees a fixed owner line, no picker, and mints without an owner_user_id', async () => {
    const user = userEvent.setup({ delay: null });
    const createApiKey = vi.fn().mockResolvedValue('sk-self');
    const listPrincipals = vi.fn();
    renderWithProviders(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ createApiKey, listPrincipals }),
      projection: scopedProjection({
        owner_user_id: null,
        routes: [{ path: '/api/auth/api-keys', methods: ['POST'] }],
      }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));

    // No picker — the server forces self-ownership; the owner is shown read-only.
    expect(screen.queryByRole('combobox', { name: 'Principal' })).not.toBeInTheDocument();
    expect(screen.getByText('Owned by Test User (human)')).toBeInTheDocument();

    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith({ user_id: 'bob', description: '', scopes: [] });
    });
    // A non-admin never fetches the admin-only principals list.
    expect(listPrincipals).not.toHaveBeenCalled();
  });

  it('surfaces a create failure loudly', async () => {
    const user = userEvent.setup({ delay: null });
    const createApiKey = vi.fn().mockRejectedValue(new Error('user_id already exists'));
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ createApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('user_id already exists')).toBeInTheDocument();
  });
});
