/**
 * PolicyVersionsDialog — the AC-policy version history render (current badge) and
 * the rollback confirm flow. It projects the policy-version rows into the shared
 * `VersionHistoryPanel` and wires its rollback to `rollbackPolicy`, invalidating
 * both the policy-versions and tokens-payload queries on success.
 */
import { QueryClient } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, ApiSchemaError, type ApiClient, type PolicyVersion } from '@tai42/api-client';

import { PolicyVersionsDialog } from './PolicyVersionsDialog';
import { renderWithProviders } from './test-utils';

const v1: PolicyVersion = {
  version: 1,
  body: {
    scopes: ['deploy'],
    policy_data: { limit: 7 },
    condition: '.context.used < .policy.limit',
    condition_id: null,
    condition_kwargs: { tier: 'pro' },
  },
  tags: [],
  created_at: '2024-01-01T00:00:01+00:00',
  is_current: false,
};

const v2: PolicyVersion = {
  version: 2,
  body: {
    scopes: ['deploy'],
    policy_data: { limit: 7 },
    condition: '.context.used < .policy.limit and (.scopes | index("deploy"))',
    condition_id: null,
    condition_kwargs: { tier: 'pro' },
  },
  tags: [],
  created_at: '2024-01-01T00:00:02+00:00',
  is_current: true,
};

const VERSIONS: PolicyVersion[] = [v1, v2];

type Stub = Partial<Record<keyof ApiClient, unknown>>;
function stubClient(methods: Stub): ApiClient {
  return methods as unknown as ApiClient;
}
function baseStub(overrides: Stub = {}): ApiClient {
  return stubClient({
    listPolicyVersions: vi.fn(() => Promise.resolve(VERSIONS)),
    rollbackPolicy: vi.fn(() => Promise.resolve({ user_id: 'u1', active_version: 1 })),
    ...overrides,
  });
}

describe('PolicyVersionsDialog', () => {
  it('renders the policy version history with a current badge', async () => {
    renderWithProviders(<PolicyVersionsDialog userId="u1" onClose={vi.fn()} />, {
      client: baseStub(),
    });
    expect(await screen.findByTestId('version-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('version-row-2')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
  });

  it('renders versions newest-first regardless of server order', async () => {
    const scrambled: PolicyVersion[] = [
      { ...v1, version: 1, is_current: false },
      { ...v2, version: 3, is_current: true },
      { ...v1, version: 2, is_current: false },
    ];
    renderWithProviders(<PolicyVersionsDialog userId="u1" onClose={vi.fn()} />, {
      client: baseStub({ listPolicyVersions: vi.fn(() => Promise.resolve(scrambled)) }),
    });

    await screen.findByTestId('version-row-3');
    const order = screen
      .getAllByTestId(/^version-row-/)
      .map((row) => row.getAttribute('data-testid'));
    expect(order).toEqual(['version-row-3', 'version-row-2', 'version-row-1']);
  });

  it('rolls back only after the confirm dialog is confirmed', async () => {
    const user = userEvent.setup();
    const rollbackPolicy = vi.fn(() => Promise.resolve({ user_id: 'u1', active_version: 1 }));
    renderWithProviders(<PolicyVersionsDialog userId="u1" onClose={vi.fn()} />, {
      client: baseStub({ rollbackPolicy }),
    });

    await user.click(await screen.findByRole('button', { name: 'Roll back to version 1' }));
    expect(rollbackPolicy).not.toHaveBeenCalled();

    const confirmDialog = screen.getByRole('dialog');
    await user.click(within(confirmDialog).getByRole('button', { name: 'Roll back' }));

    await waitFor(() => {
      expect(rollbackPolicy).toHaveBeenCalledWith('u1', 1);
    });
  });

  it('does not roll back when the confirm dialog is cancelled', async () => {
    const user = userEvent.setup();
    const rollbackPolicy = vi.fn(() => Promise.resolve({ user_id: 'u1', active_version: 1 }));
    renderWithProviders(<PolicyVersionsDialog userId="u1" onClose={vi.fn()} />, {
      client: baseStub({ rollbackPolicy }),
    });

    await user.click(await screen.findByRole('button', { name: 'Roll back to version 1' }));
    const confirmDialog = screen.getByRole('dialog', { name: 'Roll back version' });
    await user.click(within(confirmDialog).getByRole('button', { name: 'Cancel' }));

    expect(rollbackPolicy).not.toHaveBeenCalled();
  });

  it('invalidates both the policy-versions and tokens-payload queries after rollback', async () => {
    const user = userEvent.setup();
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const rollbackPolicy = vi.fn(() => Promise.resolve({ user_id: 'u1', active_version: 1 }));
    renderWithProviders(<PolicyVersionsDialog userId="u1" onClose={vi.fn()} />, {
      client: baseStub({ rollbackPolicy }),
    });

    await user.click(await screen.findByRole('button', { name: 'Roll back to version 1' }));
    const confirmDialog = screen.getByRole('dialog', { name: 'Roll back version' });
    await user.click(within(confirmDialog).getByRole('button', { name: 'Roll back' }));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth-policy-versions', 'u1'] });
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['auth-tokens-payload'] });
    invalidateSpy.mockRestore();
  });

  it('closes the confirm dialog after a successful rollback', async () => {
    const user = userEvent.setup();
    // Resolve on a later tick so the mutation's pending render actually commits: the
    // panel closes the confirm on the pending true→false success edge.
    const rollbackPolicy = vi.fn(
      () =>
        new Promise<{ user_id: string; active_version: number }>((resolve) => {
          setTimeout(() => {
            resolve({ user_id: 'u1', active_version: 1 });
          }, 0);
        }),
    );
    renderWithProviders(<PolicyVersionsDialog userId="u1" onClose={vi.fn()} />, {
      client: baseStub({ rollbackPolicy }),
    });

    await user.click(await screen.findByRole('button', { name: 'Roll back to version 1' }));
    const confirmDialog = screen.getByRole('dialog', { name: 'Roll back version' });
    await user.click(within(confirmDialog).getByRole('button', { name: 'Roll back' }));

    await waitFor(() => {
      expect(rollbackPolicy).toHaveBeenCalledWith('u1', 1);
    });
    // On success the confirm dialog closes; the outer versions dialog stays open.
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Roll back version' })).not.toBeInTheDocument();
    });
  });

  it('surfaces a rollback failure loudly inside the confirm dialog', async () => {
    const user = userEvent.setup();
    const rollbackPolicy = vi
      .fn()
      .mockRejectedValue(new ApiError('user has no policy version 1', 404));
    renderWithProviders(<PolicyVersionsDialog userId="u1" onClose={vi.fn()} />, {
      client: baseStub({ rollbackPolicy }),
    });

    await user.click(await screen.findByRole('button', { name: 'Roll back to version 1' }));
    const confirmDialog = screen.getByRole('dialog');
    await user.click(within(confirmDialog).getByRole('button', { name: 'Roll back' }));

    expect(await screen.findByText('user has no policy version 1')).toBeInTheDocument();
  });

  it('renders a 404 (no history) as the empty state, not an error', async () => {
    const listPolicyVersions = vi.fn().mockRejectedValue(new ApiError('no policy history', 404));
    renderWithProviders(<PolicyVersionsDialog userId="ghost" onClose={vi.fn()} />, {
      client: baseStub({ listPolicyVersions }),
    });

    expect(await screen.findByText('No policy versions recorded')).toBeInTheDocument();
    // A 404 is the honest empty state — never the loud error surface.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('no policy history')).not.toBeInTheDocument();
  });

  it('surfaces a non-404 load failure loudly as an error state', async () => {
    const listPolicyVersions = vi.fn().mockRejectedValue(new ApiError('boom: server error', 500));
    renderWithProviders(<PolicyVersionsDialog userId="u1" onClose={vi.fn()} />, {
      client: baseStub({ listPolicyVersions }),
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: server error');
    expect(screen.queryByText('No policy versions recorded')).not.toBeInTheDocument();
  });

  it('keeps history visible but hides Rollback in readOnly mode', async () => {
    renderWithProviders(<PolicyVersionsDialog userId="u1" readOnly onClose={vi.fn()} />, {
      client: baseStub(),
    });

    // The read surface (version rows) stays visible…
    expect(await screen.findByTestId('version-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('version-row-2')).toBeInTheDocument();
    // …but the mutation (Rollback) is gone.
    expect(
      screen.queryByRole('button', { name: 'Roll back to version 1' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces a zod schema drift (ApiSchemaError) loudly, never a silent default', async () => {
    const listPolicyVersions = vi
      .fn()
      .mockRejectedValue(new ApiSchemaError('/api/auth/api-keys/u1/policy/versions', 'drift'));
    renderWithProviders(<PolicyVersionsDialog userId="u1" onClose={vi.fn()} />, {
      client: baseStub({ listPolicyVersions }),
    });

    expect(await screen.findByText(/did not match its expected schema/)).toBeInTheDocument();
  });
});
