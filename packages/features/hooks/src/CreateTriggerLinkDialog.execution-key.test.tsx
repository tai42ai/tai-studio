/**
 * The execution-key facet of the create-trigger-link dialog: the picker lists api
 * keys with their description and mint fingerprint (and its label fallbacks), a
 * missing key blocks submit, and the loading / empty / failed key-list states all
 * keep the mint out of reach and surface loudly.
 */
import { ApiError } from '@tai42/api-client';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreateTriggerLinkDialog } from './CreateTriggerLinkDialog';
import {
  accountSessionProjection,
  apiKey,
  clickWhenInteractable,
  gateOffProjection,
  keySessionProjection,
  openSelect,
  renderWithProviders,
  type StubApiClient,
} from './test-utils';

function baseClient(
  createTriggerLink: NonNullable<StubApiClient['createTriggerLink']>,
  overrides: StubApiClient = {},
): StubApiClient {
  return {
    baseUrl: '',
    createTriggerLink,
    listTokensPayload: vi.fn().mockResolvedValue([apiKey()]),
    listHooks: vi.fn().mockResolvedValue({ items: [], total: 0, topic_verifiers: {} }),
    listHookVerifiers: vi.fn().mockResolvedValue(['shared_secret']),
    ...overrides,
  };
}

describe('CreateTriggerLinkDialog — execution key', () => {
  it('lists the api keys with their description and mint fingerprint', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(vi.fn()),
    });

    await openSelect(user, 'Execution key');
    expect(
      await screen.findByRole('option', { name: 'svc-events — Event service key · kf-9f2c1d' }),
    ).toBeInTheDocument();
  });

  it('blocks submit with a loud field error when no key is picked; never calls the API', async () => {
    const user = userEvent.setup({ delay: null });
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(createTriggerLink),
    });

    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('An execution key is required.')).toBeInTheDocument();
    expect(createTriggerLink).not.toHaveBeenCalled();
  });

  it('disables the mint and says why when the deployment has no pickable key', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(vi.fn(), { listTokensPayload: vi.fn().mockResolvedValue([]) }),
    });

    expect(
      await screen.findByText(
        /No api keys of yours are listed\. You are signed in as an account, not an api key/,
      ),
    ).toBeInTheDocument();
    // Everything else the mint needs is supplied, so ONLY the key list can disable it.
    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
  });

  it('renders a loud error with retry when the key list fails to load', async () => {
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(vi.fn(), {
        listTokensPayload: vi.fn().mockRejectedValue(new Error('keys boom')),
      }),
    });

    expect(await screen.findByText('keys boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});

describe('CreateTriggerLinkDialog — key list still loading', () => {
  /** Keeps the picker pending. */
  const neverResolves = () => vi.fn().mockReturnValue(new Promise(() => undefined));

  it('keeps the mint out of reach while the key list loads', async () => {
    const user = userEvent.setup({ delay: null });
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(createTriggerLink, { listTokensPayload: neverResolves() }),
    });

    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
    });
    expect(createTriggerLink).not.toHaveBeenCalled();
  });

  it('says the keys are loading and keeps the picker inert', async () => {
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(vi.fn(), { listTokensPayload: neverResolves() }),
    });

    const picker = await screen.findByRole('combobox', { name: 'Execution key' });
    expect(picker).toHaveTextContent('Loading keys…');
    expect(picker).toBeDisabled();
  });
});

describe('CreateTriggerLinkDialog — execution-key errors', () => {
  it('refetches the key list when the error state is retried', async () => {
    const user = userEvent.setup({ delay: null });
    const listTokensPayload = vi.fn().mockRejectedValue(new Error('keys boom'));
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(vi.fn(), { listTokensPayload }),
    });

    await screen.findByText('keys boom');
    const callsBeforeRetry = listTokensPayload.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(listTokensPayload.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
    });
  });

  it('keeps the mint out of reach when the key list FAILED', async () => {
    const user = userEvent.setup({ delay: null });
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(createTriggerLink, {
        listTokensPayload: vi.fn().mockRejectedValue(new Error('keys boom')),
      }),
    });

    await screen.findByText('keys boom');
    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
    });
    expect(createTriggerLink).not.toHaveBeenCalled();
  });
});

describe('CreateTriggerLinkDialog — execution-key label', () => {
  it('falls back to the bare id when a key has neither description nor fingerprint', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(vi.fn(), {
        listTokensPayload: vi
          .fn()
          .mockResolvedValue([apiKey({ description: '', policy_data: {} })]),
      }),
    });

    await openSelect(user, 'Execution key');
    expect(await screen.findByRole('option', { name: 'svc-events' })).toBeInTheDocument();
  });

  it('omits the description segment when a key has only a fingerprint', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(vi.fn(), {
        listTokensPayload: vi.fn().mockResolvedValue([apiKey({ description: '' })]),
      }),
    });

    await openSelect(user, 'Execution key');
    expect(
      await screen.findByRole('option', { name: 'svc-events — kf-9f2c1d' }),
    ).toBeInTheDocument();
  });

  it('offers ONE option per user_id when two mints share it', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(vi.fn(), {
        listTokensPayload: vi
          .fn()
          .mockResolvedValue([apiKey({ policy_data: { key_fingerprint: 'kf-old' } }), apiKey()]),
      }),
    });

    // Both rows name the same binding; two options would collide on the item value.
    await openSelect(user, 'Execution key');
    expect(await screen.findAllByRole('option')).toHaveLength(1);
  });

  it('omits an EMPTY fingerprint, leaving no dangling separator', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(vi.fn(), {
        listTokensPayload: vi
          .fn()
          .mockResolvedValue([apiKey({ policy_data: { key_fingerprint: '' } })]),
      }),
    });

    await openSelect(user, 'Execution key');
    expect(
      await screen.findByRole('option', { name: 'svc-events — Event service key' }),
    ).toBeInTheDocument();
  });

  it('omits the fingerprint segment on a deployment that surfaces none', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(vi.fn(), {
        listTokensPayload: vi.fn().mockResolvedValue([apiKey({ policy_data: {} })]),
      }),
    });

    await openSelect(user, 'Execution key');
    expect(
      await screen.findByRole('option', { name: 'svc-events — Event service key' }),
    ).toBeInTheDocument();
  });
});

describe('CreateTriggerLinkDialog — execution-key binding', () => {
  const forbiddenKeys = (): Promise<never> => Promise.reject(new ApiError('forbidden', 403));
  const minted = {
    name: 'wall-poster',
    trigger_path: '/trigger/trg-abc',
    token: 'trg-abc',
    topic: 'events.created',
    expires_at: null,
  };

  async function fillLink(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
  }

  it('access control off: no key field, Create link mints as the fill identity', async () => {
    const user = userEvent.setup({ delay: null });
    const createTriggerLink = vi.fn().mockResolvedValue(minted);
    const listTokensPayload = vi.fn().mockResolvedValue([apiKey()]);
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: gateOffProjection(),
      client: baseClient(createTriggerLink, { listTokensPayload }),
    });

    await fillLink(user);
    expect(screen.queryByText('Execution key')).not.toBeInTheDocument();
    await clickWhenInteractable(user, screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(createTriggerLink).toHaveBeenCalledOnce();
    });
    expect(createTriggerLink.mock.calls[0]?.[0]).toMatchObject({ execution_key: '__no_auth__' });
    expect(listTokensPayload).not.toHaveBeenCalled();
  });

  for (const [label, read] of [
    ['an empty key list', () => vi.fn().mockResolvedValue([])],
    ['a refused key list', () => vi.fn().mockImplementation(forbiddenKeys)],
  ] as const) {
    it(`a key session over ${label} mints as its own identity`, async () => {
      const user = userEvent.setup({ delay: null });
      const createTriggerLink = vi.fn().mockResolvedValue(minted);
      renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
        projection: keySessionProjection(),
        client: baseClient(createTriggerLink, { listTokensPayload: read() }),
      });

      await fillLink(user);
      await openSelect(user, 'Execution key');
      await user.click(
        await screen.findByRole('option', { name: "alice-key — this session's identity" }),
      );
      await clickWhenInteractable(user, screen.getByRole('button', { name: 'Create link' }));

      await waitFor(() => {
        expect(createTriggerLink).toHaveBeenCalledOnce();
      });
      expect(createTriggerLink.mock.calls[0]?.[0]).toMatchObject({ execution_key: 'alice-key' });
    });

    it(`a key session over ${label} with the key left blank shows the field error`, async () => {
      const user = userEvent.setup({ delay: null });
      const createTriggerLink = vi.fn();
      renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
        projection: keySessionProjection(),
        client: baseClient(createTriggerLink, { listTokensPayload: read() }),
      });

      await fillLink(user);
      await clickWhenInteractable(user, screen.getByRole('button', { name: 'Create link' }));

      expect(await screen.findByText('An execution key is required.')).toBeInTheDocument();
      expect(createTriggerLink).not.toHaveBeenCalled();
    });
  }

  it('a refused key list shows the no-grant note, no Retry; an account session cannot mint', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      projection: accountSessionProjection(),
      client: baseClient(vi.fn(), { listTokensPayload: vi.fn().mockImplementation(forbiddenKeys) }),
    });

    await fillLink(user);
    expect(
      await screen.findByText(
        'This session cannot list api keys. Picking one needs read access to GET /api/auth/tokens-payload; ask an administrator to grant it.',
      ),
    ).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Execution key' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
  });
});
