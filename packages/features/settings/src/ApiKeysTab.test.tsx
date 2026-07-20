import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ApiClient, type TokensPayload } from '@tai42/api-client';

import { ApiKeysTab } from './ApiKeysTab';
import { fullProjection, renderWithProviders, scopedProjection } from './test-utils';

/** The mint route entry a projection carries when the caller can reach it. */
const MINT_ROUTE = { path: '/api/auth/api-keys', methods: ['POST'] };

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
      condition: '.policy.limit > 0',
      condition_id: null,
      condition_kwargs: null,
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
    // The mapper mounted on this tab reads these; an empty catalog keeps the
    // key-focused assertions here unaffected (the mapper has its own test file).
    listAuthRoutes: vi.fn(() => Promise.resolve([])),
    listPublicRoutes: vi.fn(() => Promise.resolve([])),
    listSubMcp: vi.fn(() => Promise.resolve({})),
    ...overrides,
  });
}

/** Render the tab under an ADMIN projection by default so the write controls (mint,
 * Edit, Revoke, mapper) show — the behavioural tests exercise those. A test that pins a
 * scoped or not-ready projection passes its own `projection`, which overrides. */
function renderTab(
  ui: Parameters<typeof renderWithProviders>[0],
  opts: Parameters<typeof renderWithProviders>[1],
) {
  return renderWithProviders(ui, { projection: fullProjection(), ...opts });
}

describe('ApiKeysTab', () => {
  it('lists keys with their scopes', async () => {
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub() });

    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.getByText('Alice key')).toBeInTheDocument();
    const row = screen.getByText('alice').closest('tr') as HTMLElement;
    expect(within(row).getByText('admin')).toBeInTheDocument();
  });

  it('creates a key and shows the minted key once', async () => {
    const user = userEvent.setup();
    const createApiKey = vi.fn().mockResolvedValue('sk-generated-123');
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ createApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.type(screen.getByLabelText('Description'), 'Bob key');
    await user.click(screen.getByRole('checkbox', { name: 'admin' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith({
        user_id: 'bob',
        description: 'Bob key',
        scopes: ['admin'],
      });
    });

    // The raw key is shown once…
    expect(await screen.findByText('sk-generated-123')).toBeInTheDocument();
    // …and is gone from the DOM after the dialog is dismissed (show-once).
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await waitFor(() => {
      expect(screen.queryByText('sk-generated-123')).not.toBeInTheDocument();
    });
  });

  it('reopens a blank create form with the minted key cleared', async () => {
    const user = userEvent.setup();
    const createApiKey = vi.fn().mockResolvedValue('sk-generated-123');
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ createApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.type(screen.getByLabelText('Description'), 'Bob key');
    await user.click(screen.getByRole('checkbox', { name: 'admin' }));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    // Dismiss the show-once minted-key dialog.
    await user.click(await screen.findByRole('button', { name: 'Done' }));
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

  it('surfaces a 404 on revoke loudly (unknown user_id)', async () => {
    const user = userEvent.setup();
    const revokeApiKey = vi.fn().mockRejectedValue(new ApiError('unknown user_id', 404));
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ revokeApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Revoke key alice' }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(await screen.findByText('unknown user_id')).toBeInTheDocument();
  });

  it('round-trips policy_data key/value rows into the create body', async () => {
    const user = userEvent.setup();
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
        policy_data: { limit: 7 },
      });
    });
  });

  it('does not block save when an inline jq condition fails its Test — warns, and saves anyway', async () => {
    const user = userEvent.setup();
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
    await user.type(screen.getByLabelText('jq condition'), '.policy.limit >');

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
          condition: '.policy.limit >',
          condition_id: null,
        }),
      );
    });
  });

  it('clears the failed-Test warning once the condition is edited', async () => {
    const user = userEvent.setup();
    const validateCondition = vi
      .fn()
      .mockRejectedValue(new ApiError('jq: syntax error, unexpected end of file', 400));
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('jq condition'), '.policy.limit >');
    await user.click(screen.getByRole('button', { name: 'Test condition' }));
    expect(await screen.findByText(/failed its last test/)).toBeInTheDocument();

    // Editing the condition clears the last Test result and its Save warning.
    await user.type(screen.getByLabelText('jq condition'), ' 0');
    expect(screen.queryByText(/failed its last test/)).not.toBeInTheDocument();
  });

  it('the Test button sends {condition, sample_context} and badges an allowed sample', async () => {
    const user = userEvent.setup();
    const validateCondition = vi.fn().mockResolvedValue({ ok: true, result: true });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('jq condition'), '.policy.limit > 0');
    await user.click(screen.getByRole('button', { name: 'Test condition' }));

    expect(await screen.findByText('allows sample')).toBeInTheDocument();
    await waitFor(() => {
      expect(validateCondition).toHaveBeenCalled();
    });
    const body = validateCondition.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.condition).toBe('.policy.limit > 0');
    // The sample context is sent so enforcement-faithful allow/deny is evaluated…
    expect(body.sample_context).toMatchObject({ sub: 'anon', scopes: [] });
    // …and the inline/template either-or is honored by construction (no condition_id).
    expect(body).not.toHaveProperty('condition_id');
  });

  it('the Test button badges a denied sample when the guard returns result false', async () => {
    const user = userEvent.setup();
    const validateCondition = vi.fn().mockResolvedValue({ ok: true, result: false });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('jq condition'), '.policy.limit > 0');
    await user.click(screen.getByRole('button', { name: 'Test condition' }));

    expect(await screen.findByText('denies sample')).toBeInTheDocument();
  });

  it('the Test button badges compile-only (no sample) when the sample editor is blank', async () => {
    const user = userEvent.setup();
    const validateCondition = vi.fn().mockResolvedValue({ ok: true, result: null });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('jq condition'), '.policy.limit > 0');
    await user.clear(screen.getByLabelText('Sample context (JSON)'));
    await user.click(screen.getByRole('button', { name: 'Test condition' }));

    expect(await screen.findByText('compiles (no sample evaluated)')).toBeInTheDocument();
    const body = validateCondition.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.condition).toBe('.policy.limit > 0');
    // A blank sample editor sends NO sample_context — the guard compiles only.
    expect(body).not.toHaveProperty('sample_context');
  });

  it('surfaces the guard 400 lock-out message VERBATIM and never rephrases it', async () => {
    const user = userEvent.setup();
    const lockout =
      'condition rendered empty — this would lock the key out of every request; refusing to save';
    const validateCondition = vi.fn().mockRejectedValue(new ApiError(lockout, 400));
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('jq condition'), '.policy.missing');
    await user.click(screen.getByRole('button', { name: 'Test condition' }));

    expect(await screen.findByText(lockout)).toBeInTheDocument();
  });

  it('blocks the Test with a loud field error on malformed sample-context JSON (no request)', async () => {
    const user = userEvent.setup();
    const validateCondition = vi.fn();
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ validateCondition }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('jq condition'), '.policy.limit > 0');
    const sample = screen.getByLabelText('Sample context (JSON)');
    await user.clear(sample);
    await user.type(sample, 'not json');
    await user.click(screen.getByRole('button', { name: 'Test condition' }));

    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(validateCondition).not.toHaveBeenCalled();
  });

  it('template mode sends condition_id + condition_kwargs and never an inline condition', async () => {
    const user = userEvent.setup();
    const createApiKey = vi.fn().mockResolvedValue('sk-x');
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ createApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.click(screen.getByRole('radio', { name: 'Named template' }));

    await user.click(await screen.findByRole('combobox', { name: 'Condition template' }));
    await user.click(await screen.findByRole('option', { name: 'ac_tier' }));

    await user.click(screen.getByRole('button', { name: 'Add Condition kwargs row' }));
    await user.type(screen.getByLabelText('Condition kwargs key 1'), 'tier');
    await user.type(screen.getByLabelText('Condition kwargs value 1'), 'pro');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(createApiKey).toHaveBeenCalledWith(
        expect.objectContaining({
          condition_id: 'ac_tier',
          condition: null,
          condition_kwargs: { tier: 'pro' },
        }),
      );
    });
    // Mutually exclusive: the inline condition is never a string alongside a template.
    const body = createApiKey.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(body.condition).toBeNull();
  });

  it('pre-fills the edit dialog from the stored policy fields', async () => {
    const user = userEvent.setup();
    const withPolicy: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: { limit: 5 },
        condition: '.policy.limit > 0',
        condition_id: null,
        condition_kwargs: null,
      },
    ];
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ listTokensPayload: vi.fn(() => Promise.resolve(withPolicy)) }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));

    expect(screen.getByLabelText('jq condition')).toHaveValue('.policy.limit > 0');
    expect(screen.getByLabelText('Policy data key 1')).toHaveValue('limit');
    expect(screen.getByLabelText('Policy data value 1')).toHaveValue('5');
  });

  it('edits a key description and scopes', async () => {
    const user = userEvent.setup();
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ editApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));
    const desc = screen.getByLabelText('Description');
    await user.clear(desc);
    await user.type(desc, 'Alice v2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalledWith('alice', {
        description: 'Alice v2',
        scopes: ['admin'],
      });
    });
  });

  it('"Remove condition" sends an explicit null clear for the whole condition', async () => {
    const user = userEvent.setup();
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({
        editApiKey,
        listTokensPayload: vi.fn(() => Promise.resolve(seededTokens())),
      }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));

    // Behind an inline confirm: the trigger reveals a Confirm/Cancel prompt in place.
    await user.click(screen.getByRole('button', { name: 'Remove condition' }));
    await user.click(screen.getByRole('button', { name: 'Yes, remove condition' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalledWith(
        'alice',
        expect.objectContaining({ condition: null, condition_id: null, condition_kwargs: null }),
      );
    });
  });

  it('a plain emptied condition textarea preserves the saved condition (no null clear)', async () => {
    const user = userEvent.setup();
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({
        editApiKey,
        listTokensPayload: vi.fn(() => Promise.resolve(seededTokens())),
      }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));

    // Emptying the textarea alone is NOT a delete — the field is omitted, not nulled.
    await user.clear(screen.getByLabelText('jq condition'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalled();
    });
    const body = editApiKey.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('condition');
    expect(body).not.toHaveProperty('condition_id');
  });

  it('"Clear policy data" sends an explicit policy_data null clear', async () => {
    const user = userEvent.setup();
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({
        editApiKey,
        listTokensPayload: vi.fn(() => Promise.resolve(seededTokens())),
      }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));

    await user.click(screen.getByRole('button', { name: 'Clear policy data' }));
    await user.click(screen.getByRole('button', { name: 'Yes, clear policy data' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalledWith(
        'alice',
        expect.objectContaining({ policy_data: null }),
      );
    });
  });

  it('removing all policy_data rows without the explicit clear preserves the saved value', async () => {
    const user = userEvent.setup();
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({
        editApiKey,
        listTokensPayload: vi.fn(() => Promise.resolve(seededTokens())),
      }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));

    // Emptying the editor rows is NOT a delete — policy_data is omitted, not nulled.
    await user.click(screen.getByRole('button', { name: 'Remove Policy data row 1' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalled();
    });
    const body = editApiKey.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('policy_data');
  });

  it('re-emits untouched string-valued policy_data VERBATIM (no JSON-type coercion)', async () => {
    const user = userEvent.setup();
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    // A stored STRING that LOOKS like a JSON literal — the row editor cannot tell it
    // from the number 7, so re-serializing an untouched editor would coerce it and
    // silently change the enforced `.policy.*` value (and append a phantom version).
    const stringSeed: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: { limit: '7' },
        condition: null,
        condition_id: null,
        condition_kwargs: null,
      },
    ];
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ editApiKey, listTokensPayload: vi.fn(() => Promise.resolve(stringSeed)) }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));
    // Touch ONLY the description; the policy-data editor stays pristine.
    const desc = screen.getByLabelText('Description');
    await user.clear(desc);
    await user.type(desc, 'Alice v2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalled();
    });
    const body = editApiKey.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.policy_data).toEqual({ limit: '7' });
  });

  it('re-emits untouched template condition_kwargs VERBATIM (no JSON-type coercion)', async () => {
    const user = userEvent.setup();
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    const templateSeed: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: {},
        condition: null,
        condition_id: 'ac_tier',
        condition_kwargs: { min: '7' },
      },
    ];
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({
        editApiKey,
        listTokensPayload: vi.fn(() => Promise.resolve(templateSeed)),
      }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));
    // Touch ONLY the description; the kwargs editor stays pristine.
    const desc = screen.getByLabelText('Description');
    await user.clear(desc);
    await user.type(desc, 'Alice v2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalled();
    });
    const body = editApiKey.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.condition_id).toBe('ac_tier');
    expect(body.condition).toBeNull();
    // The string "7" survives as a string — never coerced to the number 7.
    expect(body.condition_kwargs).toEqual({ min: '7' });
  });

  it('re-emits an untouched inline condition VERBATIM (no whitespace normalization)', async () => {
    const user = userEvent.setup();
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    // A stored condition carrying surrounding whitespace: a pristine save (only the
    // description changed) must NOT trim it into a changed body + phantom version.
    const seed: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: {},
        condition: '  .policy.limit > 0  ',
        condition_id: null,
        condition_kwargs: null,
      },
    ];
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ editApiKey, listTokensPayload: vi.fn(() => Promise.resolve(seed)) }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));
    // Touch ONLY the description; the condition textarea stays pristine.
    const desc = screen.getByLabelText('Description');
    await user.clear(desc);
    await user.type(desc, 'Alice v2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalled();
    });
    const body = editApiKey.mock.calls[0]?.[1] as Record<string, unknown>;
    // The stored whitespace survives verbatim — not normalized on a save that never
    // touched the condition.
    expect(body.condition).toBe('  .policy.limit > 0  ');
  });

  it('preserves an inline condition AND its stored kwargs on a pristine save', async () => {
    const user = userEvent.setup();
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    // An INLINE condition can be Jinja-templated and legitimately carry condition_kwargs
    // (enforcement renders inline conditions with kwargs). A description-only save must
    // re-emit the condition verbatim and OMIT condition_kwargs (the PATCH preserves the
    // stored kwargs) — nulling them would wipe the inline condition's variables, alter
    // the enforced body, and append a phantom version.
    const seed: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: {},
        condition: '.policy.limit > {{ min }}',
        condition_id: null,
        condition_kwargs: { min: '7' },
      },
    ];
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ editApiKey, listTokensPayload: vi.fn(() => Promise.resolve(seed)) }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));
    // Touch ONLY the description; the condition textarea stays pristine.
    const desc = screen.getByLabelText('Description');
    await user.clear(desc);
    await user.type(desc, 'Alice v2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalled();
    });
    const body = editApiKey.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.condition).toBe('.policy.limit > {{ min }}');
    expect(body.condition_id).toBeNull();
    // condition_kwargs is OMITTED, so the PATCH preserves the stored { min: '7' } — the
    // enforced body is unchanged and no phantom version is appended.
    expect(body).not.toHaveProperty('condition_kwargs');
  });

  it('omits condition_kwargs on a pristine template whose stored kwargs are null', async () => {
    const user = userEvent.setup();
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    // A template-mode key whose stored condition_kwargs is null: a description-only save
    // must OMIT condition_kwargs (the PATCH preserves the stored null) rather than send
    // `{}`, which would coerce null→{} and append a phantom version.
    const seed: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: {},
        condition: null,
        condition_id: 'ac_tier',
        condition_kwargs: null,
      },
    ];
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ editApiKey, listTokensPayload: vi.fn(() => Promise.resolve(seed)) }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));
    // Touch ONLY the description; the (empty) kwargs editor stays pristine.
    const desc = screen.getByLabelText('Description');
    await user.clear(desc);
    await user.type(desc, 'Alice v2');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalled();
    });
    const body = editApiKey.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.condition_id).toBe('ac_tier');
    expect(body).not.toHaveProperty('condition_kwargs');
  });

  it('switching a seeded template condition to inline mode clears the orphaned kwargs', async () => {
    const user = userEvent.setup();
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    const templateSeed: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: {},
        condition: null,
        condition_id: 'ac_tier',
        condition_kwargs: { min: '7' },
      },
    ];
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({
        editApiKey,
        listTokensPayload: vi.fn(() => Promise.resolve(templateSeed)),
      }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));
    // Switch to inline mode and author an inline condition.
    await user.click(screen.getByRole('radio', { name: 'Inline jq expression' }));
    await user.type(screen.getByLabelText('jq condition'), '.policy.limit > 0');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalled();
    });
    const body = editApiKey.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.condition).toBe('.policy.limit > 0');
    expect(body.condition_id).toBeNull();
    // The template's kwargs are not left orphaned alongside the inline condition.
    expect(body.condition_kwargs).toBeNull();
  });

  it('the clear affordances are absent in create mode (nothing to clear)', async () => {
    const user = userEvent.setup();
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ listTokensPayload: vi.fn(() => Promise.resolve(seededTokens())) }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));

    expect(screen.queryByRole('button', { name: 'Remove condition' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear policy data' })).not.toBeInTheDocument();
  });

  it('revokes a key after confirming', async () => {
    const user = userEvent.setup();
    const revokeApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', revoked: true });
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ revokeApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Revoke key alice' }));
    await user.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(revokeApiKey).toHaveBeenCalledWith('alice');
    });
  });

  it('surfaces a create failure loudly', async () => {
    const user = userEvent.setup();
    const createApiKey = vi.fn().mockRejectedValue(new Error('user_id already exists'));
    renderTab(<ApiKeysTab readOnly={false} />, { client: baseStub({ createApiKey }) });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Create key' }));
    await user.type(screen.getByLabelText('User ID'), 'bob');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('user_id already exists')).toBeInTheDocument();
  });

  it('keeps History reachable in readOnly mode while hiding Edit, Revoke and Create', async () => {
    renderTab(<ApiKeysTab readOnly />, { client: baseStub() });

    await screen.findByText('alice');
    // History is a read surface — still available…
    expect(screen.getByRole('button', { name: 'Policy history for alice' })).toBeInTheDocument();
    // …but every mutation entry point is hidden.
    expect(screen.queryByRole('button', { name: 'Edit key alice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke key alice' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create key' })).not.toBeInTheDocument();
  });

  it('disables Create with a note when the deployment cannot mint keys', async () => {
    const createApiKey = vi.fn();
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({
        createApiKey,
        getAuthCapabilities: vi.fn(() =>
          Promise.resolve({
            mintable: false,
            providers: [{ name: 'oidc-external', mintable: false }],
          }),
        ),
      }),
    });

    await screen.findByText('alice');
    const create = screen.getByRole('button', { name: 'Create key' });
    expect(create).toBeDisabled();
    expect(screen.getByText('Keys are managed at the external issuer')).toBeInTheDocument();
    // The create dialog is unreachable — no mint request is possible.
    expect(screen.queryByLabelText('User ID')).not.toBeInTheDocument();
    expect(createApiKey).not.toHaveBeenCalled();
  });

  it('keeps Create enabled and the create flow intact when minting is available', async () => {
    const user = userEvent.setup();
    const createApiKey = vi.fn().mockResolvedValue('sk-mintable-1');
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({
        createApiKey,
        getAuthCapabilities: vi.fn(() => Promise.resolve({ mintable: true, providers: [] })),
      }),
    });

    await screen.findByText('alice');
    const create = screen.getByRole('button', { name: 'Create key' });
    expect(create).toBeEnabled();
    expect(screen.queryByText('Keys are managed at the external issuer')).not.toBeInTheDocument();
    await user.click(create);
    expect(screen.getByLabelText('User ID')).toBeInTheDocument();
  });

  it('surfaces a capabilities-fetch failure loudly (never a silent enable/disable guess)', async () => {
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({
        getAuthCapabilities: vi.fn(() =>
          Promise.reject(new ApiError('capabilities unavailable', 500)),
        ),
      }),
    });

    expect(await screen.findByText('capabilities unavailable')).toBeInTheDocument();
    // No key table renders behind the loud error state.
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
  });

  it('renders the key list in readOnly mode even when capabilities would fail', async () => {
    const getAuthCapabilities = vi.fn(() =>
      Promise.reject(new ApiError('capabilities unavailable', 500)),
    );
    renderTab(<ApiKeysTab readOnly />, { client: baseStub({ getAuthCapabilities }) });

    // A read-only viewer never consumes mint capabilities, so a failing (or here
    // never-fetched) capabilities endpoint must not gate the list they can view.
    expect(await screen.findByText('alice')).toBeInTheDocument();
    expect(screen.queryByText('capabilities unavailable')).not.toBeInTheDocument();
    // The mint control is hidden in readOnly regardless, and the query never runs.
    expect(screen.queryByRole('button', { name: 'Create key' })).not.toBeInTheDocument();
    expect(getAuthCapabilities).not.toHaveBeenCalled();
  });

  it('renders the owner column from policy_data owner_user_id, dashing ownerless keys', async () => {
    const mixed: TokensPayload = [
      {
        user_id: 'svc',
        description: 'Delegated key',
        scopes: ['read'],
        policy_data: { owner_user_id: 'alice' },
      },
      { user_id: 'plain', description: 'Ownerless key', scopes: ['read'], policy_data: {} },
    ];
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ listTokensPayload: vi.fn(() => Promise.resolve(mixed)) }),
    });

    const ownedRow = (await screen.findByText('svc')).closest('tr') as HTMLElement;
    expect(within(ownedRow).getByText('alice')).toBeInTheDocument();
    const plainRow = screen.getByText('plain').closest('tr') as HTMLElement;
    expect(within(plainRow).getByText('—')).toBeInTheDocument();
  });

  it('hides the mint button for an owned-key caller even with "*" scopes', async () => {
    // The owned-cannot-mint rule is a per-request handler check invisible to the
    // route table, so a "*"-scoped owned key carries the mint route yet 403s on mint.
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: scopedProjection({
        owner_user_id: 'alice',
        scopes: ['*'],
        routes: [MINT_ROUTE],
      }),
    });

    await screen.findByText('alice');
    expect(
      await screen.findByText('Your access does not permit minting keys.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create key' })).not.toBeInTheDocument();
  });

  it('hides the mint button for a non-owned caller whose projection lacks the mint route', async () => {
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: scopedProjection({ owner_user_id: null, routes: [] }),
    });

    await screen.findByText('alice');
    expect(
      await screen.findByText('Your access does not permit minting keys.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create key' })).not.toBeInTheDocument();
  });

  it('shows the mint button to a viewer (non-owned, mint route present) with capped scopes', async () => {
    const user = userEvent.setup();
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: scopedProjection({ owner_user_id: null, routes: [MINT_ROUTE], scopes: ['read'] }),
    });

    await screen.findByText('alice');
    const create = await screen.findByRole('button', { name: 'Create key' });
    await user.click(create);

    // The scope picker offers ONLY the projected scope; the un-projected `admin`
    // scope from the map is dropped once the projection is ready.
    await waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: 'admin' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('checkbox', { name: 'read' })).toBeInTheDocument();
  });

  it('offers the WHOLE scope map to a "*"-scoped session (wildcard, not a concrete id)', async () => {
    const user = userEvent.setup();
    // A `"*"` in the projection's scopes is the universal wildcard — it must expand
    // to every scope for minting, not intersect the concrete map to nothing.
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: scopedProjection({ owner_user_id: null, routes: [MINT_ROUTE], scopes: ['*'] }),
    });

    await screen.findByText('alice');
    await user.click(await screen.findByRole('button', { name: 'Create key' }));

    expect(await screen.findByRole('checkbox', { name: 'admin' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'read' })).toBeInTheDocument();
  });

  it('shows the mint button with the full scope map for a full projection', async () => {
    const user = userEvent.setup();
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: fullProjection(),
    });

    await screen.findByText('alice');
    expect(screen.queryByText('Your access does not permit minting keys.')).not.toBeInTheDocument();
    const create = await screen.findByRole('button', { name: 'Create key' });
    await user.click(create);
    // A full session keeps every scope in the map.
    expect(screen.getByRole('checkbox', { name: 'admin' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'read' })).toBeInTheDocument();
  });

  it('shows the mint button for a gate-off synthetic projection (admin, empty routes)', async () => {
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: fullProjection({ routes: [] }),
    });

    await screen.findByText('alice');
    expect(await screen.findByRole('button', { name: 'Create key' })).toBeInTheDocument();
    expect(screen.queryByText('Your access does not permit minting keys.')).not.toBeInTheDocument();
  });

  it('hides the access-control mapper for an editor/viewer-shaped scoped projection (own-key surface only)', async () => {
    // A seeded editor/viewer reaches the always-shown API keys tab (its fence carves in
    // `/api/auth/api-keys` + `/api/auth/scopes`) but is DENIED `/api/auth/routes` and
    // `/api/auth/public-routes`, the admin reads the mapper mounts. The mapper must be
    // absent — the keys table stays reachable and no ErrorState walls the tab.
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: scopedProjection({
        routes: [
          { path: '/api/auth/api-keys', methods: ['GET', 'POST'] },
          { path: '/api/auth/scopes', methods: ['GET'] },
          { path: '/api/auth/tokens-payload', methods: ['GET'] },
          { path: '/api/auth/capabilities', methods: ['GET'] },
        ],
      }),
    });

    // The own-key keys table renders…
    expect(await screen.findByText('alice')).toBeInTheDocument();
    // …but the deployment-wide access-control mapper (and its would-be 403 wall) is gone.
    expect(screen.queryByText('Access control')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the access-control mapper for a full projection', async () => {
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub(),
      projection: fullProjection(),
    });

    expect(await screen.findByText('alice')).toBeInTheDocument();
    // A full (admin / gate-off) projection reaches every mapper read, so it renders
    // (its reads resolve asynchronously, so await the card heading).
    expect(await screen.findByText('Access control')).toBeInTheDocument();
  });

  it('escapes server-supplied user_id and scope strings', async () => {
    const injected: TokensPayload = [
      {
        user_id: '<script>alert(1)</script>',
        description: '<img src=x onerror=alert(2)>',
        scopes: ['<b>scope</b>'],
        policy_data: {},
      },
    ];
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ listTokensPayload: vi.fn(() => Promise.resolve(injected)) }),
    });

    expect(await screen.findByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(screen.getByText('<b>scope</b>')).toBeInTheDocument();
    // The injected markup never became live DOM.
    expect(document.querySelector('img[onerror]')).toBeNull();
  });
});
