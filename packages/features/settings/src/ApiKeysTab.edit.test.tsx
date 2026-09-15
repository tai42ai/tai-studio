// The edit dialog mounts the full policy editor plus the template and condition
// seams, so its flows are a heavy render chain — the file gets explicit testTimeout
// headroom, and userEvent runs without its inter-key delay.
import type { ApiClient, TokensPayload } from '@tai42/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiKeysTab } from './ApiKeysTab';
import { fullProjection, renderWithProviders } from './test-utils';

vi.setConfig({ testTimeout: 15_000 });

function tokens(): TokensPayload {
  return [{ user_id: 'alice', description: 'Alice key', scopes: ['admin'], policy_data: {} }];
}
/** A key seeded with both a saved inline condition and policy data, so the edit
 * dialog's "Remove condition" / "Clear policy data" affordances have something to remove. */
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
    ...overrides,
  });
}

function renderTab(
  ui: Parameters<typeof renderWithProviders>[0],
  opts: Parameters<typeof renderWithProviders>[1],
) {
  return renderWithProviders(ui, { projection: fullProjection(), ...opts });
}

describe('ApiKeysTab — edit key', () => {
  it('pre-fills the edit dialog from the stored policy fields', async () => {
    const user = userEvent.setup({ delay: null });
    const withPolicy: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: { limit: 5 },
        condition: { content: '.policy.limit > 0' },
      },
    ];
    renderTab(<ApiKeysTab readOnly={false} />, {
      client: baseStub({ listTokensPayload: vi.fn(() => Promise.resolve(withPolicy)) }),
    });

    await screen.findByText('alice');
    await user.click(screen.getByRole('button', { name: 'Edit key alice' }));

    expect(screen.getByRole('textbox', { name: 'Condition' })).toHaveValue('.policy.limit > 0');
    expect(screen.getByLabelText('Policy data key 1')).toHaveValue('limit');
    expect(screen.getByLabelText('Policy data value 1')).toHaveValue('5');
  });

  it('edits a key description and scopes', async () => {
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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
        expect.objectContaining({ condition: null }),
      );
    });
  });

  it('a plain emptied condition textarea preserves the saved condition (no null clear)', async () => {
    const user = userEvent.setup({ delay: null });
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
    await user.clear(screen.getByRole('textbox', { name: 'Condition' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalled();
    });
    const body = editApiKey.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('condition');
  });

  it('"Clear policy data" sends an explicit policy_data null clear', async () => {
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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
    const user = userEvent.setup({ delay: null });
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

  it('omits an untouched stored-template condition on a description-only save', async () => {
    const user = userEvent.setup({ delay: null });
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    const templateSeed: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: {},
        condition: { id: 'ac_tier', kwargs: { min: '7' } },
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
    // The condition is OMITTED, so the PATCH preserves the stored { id, kwargs } byte
    // for byte — its string "7" is never re-serialized into the number 7.
    expect(body).not.toHaveProperty('condition');
  });

  it('re-emits an untouched inline condition VERBATIM (no whitespace normalization)', async () => {
    const user = userEvent.setup({ delay: null });
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    // A stored condition carrying surrounding whitespace: a pristine save (only the
    // description changed) must NOT trim it into a changed body + phantom version.
    const seed: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: {},
        condition: { content: '  .policy.limit > 0  ' },
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
    // The condition is OMITTED, so the PATCH preserves the stored whitespace verbatim —
    // a save that never touched the condition cannot normalize it into a phantom version.
    expect(body).not.toHaveProperty('condition');
  });

  it('preserves an inline condition AND its stored kwargs on a pristine save', async () => {
    const user = userEvent.setup({ delay: null });
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    // An INLINE condition can be Jinja-templated and legitimately carry render kwargs.
    // A description-only save must OMIT the whole condition (the PATCH preserves the
    // stored content and its kwargs) — re-serializing would risk a phantom version.
    const seed: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: {},
        condition: { content: '.policy.limit > {{ min }}', kwargs: { min: '7' } },
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
    // The whole condition is OMITTED, so the PATCH preserves the stored inline content
    // AND its render kwargs byte for byte — no phantom version, no lost variables.
    expect(body).not.toHaveProperty('condition');
  });

  it('omits a pristine stored-template condition that carries no kwargs', async () => {
    const user = userEvent.setup({ delay: null });
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    // A stored-template condition with no kwargs: a description-only save must OMIT the
    // whole condition (the PATCH preserves it) rather than re-send a re-serialized copy.
    const seed: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: {},
        condition: { id: 'ac_tier' },
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
    expect(body).not.toHaveProperty('condition');
  });

  it('switching a seeded stored-template condition to inline keeps the shared render kwargs', async () => {
    const user = userEvent.setup({ delay: null });
    const editApiKey = vi.fn().mockResolvedValue({ user_id: 'alice', updated: true });
    const templateSeed: TokensPayload = [
      {
        user_id: 'alice',
        description: 'Alice key',
        scopes: ['admin'],
        policy_data: {},
        condition: { id: 'ac_tier', kwargs: { min: '7' } },
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
    // The source toggle is NAMED so a reader entering it hears what the choice is for.
    expect(screen.getByRole('radiogroup')).toHaveAccessibleName('Condition source');
    // Switch to inline mode and author an inline condition; the render kwargs are shared
    // across both sources, so they ride with the now-inline content.
    await user.click(screen.getByRole('radio', { name: 'Inline text' }));
    await user.type(screen.getByRole('textbox', { name: 'Condition' }), '.policy.limit > 0');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(editApiKey).toHaveBeenCalled();
    });
    const body = editApiKey.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body.condition).toEqual({ content: '.policy.limit > 0', kwargs: { min: '7' } });
  });
});
