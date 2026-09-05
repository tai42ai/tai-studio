/**
 * Behavioural tests for the create-trigger-link dialog: the happy path ends in a QR
 * (shown once, no reopen affordance), the params JSON editor lands valid JSON in the
 * body / blocks invalid JSON / omits an empty field, the expiry picker has NO default
 * and maps presets + a validated custom value, the execution key rides the body,
 * the api-key requirement rides as `require_api_key`, and every server status — the
 * pass-role / token-free-evaluable refusals included — renders verbatim.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiConflictError, ApiError } from '@tai42/api-client';

import { CreateTriggerLinkDialog } from './CreateTriggerLinkDialog';
import { apiKey, renderWithProviders, type StubApiClient } from './test-utils';

const CREATED = {
  name: 'wall-poster',
  trigger_path: '/trigger/trg-abc',
  token: 'trg-abc',
  topic: 'events.created',
  expires_at: null,
};

function baseClient(
  createTriggerLink: ReturnType<typeof vi.fn>,
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

/** Pick the seeded key in the execution-key `Select`. */
async function pickExecutionKey(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('combobox', { name: 'Execution key' }));
  await user.click(await screen.findByRole('option', { name: /svc-events/ }));
}

/** Fill everything a mint requires: topic, execution key, expiry. */
async function fillRequired(
  user: ReturnType<typeof userEvent.setup>,
  { topic = 'events.created', expiry = 'Permanent' }: { topic?: string; expiry?: string } = {},
): Promise<void> {
  await user.type(screen.getByLabelText('Topic'), topic);
  await pickExecutionKey(user);
  await user.click(screen.getByRole('radio', { name: expiry }));
}

describe('CreateTriggerLinkDialog — create + QR', () => {
  it('creates a permanent link and shows the QR (shown once, no reopen affordance)', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn().mockResolvedValue(CREATED);
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(createTriggerLink).toHaveBeenCalledWith({
        topic: 'events.created',
        name: undefined,
        execution_key: 'svc-events',
        require_api_key: false,
        ttl_seconds: null,
        tool_kwargs: undefined,
      });
    });

    const qr = await screen.findByTestId('trigger-link-qr');
    expect(qr.querySelector('svg')).not.toBeNull();
    // Shown-once caption + no way to reopen/regenerate the QR — only Done.
    expect(screen.getByText(/shown once/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Create link/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Topic')).not.toBeInTheDocument();
  });

  it('keeps the revealed QR on Escape, then closes only on the explicit Done', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const createTriggerLink = vi.fn().mockResolvedValue(CREATED);
    renderWithProviders(<CreateTriggerLinkDialog onClose={onClose} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    // Reach the shown-once QR reveal.
    expect(await screen.findByTestId('trigger-link-qr')).toBeInTheDocument();

    // Escape must NOT dismiss the reveal — the link cannot be re-minted.
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('trigger-link-qr')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // The explicit Done is the only way out.
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('rebuilds the QR only when the link changes, not on every re-render', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn().mockResolvedValue(CREATED);
    const { rerender } = renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    const qr = await screen.findByTestId('trigger-link-qr');
    const svg = qr.querySelector('svg');
    expect(svg).not.toBeNull();

    // A re-render carrying the SAME link: React compares the
    // `dangerouslySetInnerHTML` prop by IDENTITY, so a fresh `{ __html }` literal
    // re-encodes the QR and re-writes the container's innerHTML, replacing every
    // node under it. Held by identity, the encode and the write do not happen.
    rerender(<CreateTriggerLinkDialog onClose={vi.fn()} />);

    expect(screen.getByTestId('trigger-link-qr').querySelector('svg')).toBe(svg);
  });

  it('disables submit while the mint is IN FLIGHT, so a double click cannot mint twice', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn().mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    // Held by node, not by name: the pending button renders a "Creating" spinner label.
    const submit = screen.getByRole('button', { name: 'Create link' });
    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);
    expect(createTriggerLink).toHaveBeenCalledTimes(1);
  });

  it('maps the expiry presets (1 hour → 3600) into the body', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi
      .fn()
      .mockResolvedValue({ ...CREATED, expires_at: '2026-07-22T10:00:00Z' });
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user, { expiry: '1 hour' });
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(createTriggerLink).toHaveBeenCalledWith(
        expect.objectContaining({ ttl_seconds: 3600 }),
      );
    });
  });

  it('sends a validated custom seconds value', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn().mockResolvedValue(CREATED);
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user, { expiry: 'Custom…' });
    await user.type(screen.getByLabelText('Custom expiry (seconds)'), '1800');
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(createTriggerLink).toHaveBeenCalledWith(
        expect.objectContaining({ ttl_seconds: 1800 }),
      );
    });
  });

  it('blocks submit with a loud error on a fractional custom value; never calls the API', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user, { expiry: 'Custom…' });
    await user.type(screen.getByLabelText('Custom expiry (seconds)'), '3600.5');
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText(/positive whole number/)).toBeInTheDocument();
    expect(createTriggerLink).not.toHaveBeenCalled();
  });
});

describe('CreateTriggerLinkDialog — execution key', () => {
  it('lists the api keys with their description and mint fingerprint', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(vi.fn()),
    });

    await user.click(await screen.findByRole('combobox', { name: 'Execution key' }));
    expect(
      await screen.findByRole('option', { name: 'svc-events — Event service key · kf-9f2c1d' }),
    ).toBeInTheDocument();
  });

  it('blocks submit with a loud field error when no key is picked; never calls the API', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('An execution key is required.')).toBeInTheDocument();
    expect(createTriggerLink).not.toHaveBeenCalled();
  });

  it('disables the mint and says why when the deployment has no pickable key', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(vi.fn(), { listTokensPayload: vi.fn().mockResolvedValue([]) }),
    });

    expect(await screen.findByText(/No api keys available to run as/)).toBeInTheDocument();
    // Everything else the mint needs is supplied, so ONLY the key list can disable it.
    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
  });

  it('renders a loud error with retry when the key list fails to load', async () => {
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
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
    const user = userEvent.setup();
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
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
      client: baseClient(vi.fn(), { listTokensPayload: neverResolves() }),
    });

    const picker = await screen.findByRole('combobox', { name: 'Execution key' });
    expect(picker).toHaveTextContent('Loading keys…');
    expect(picker).toBeDisabled();
  });
});

describe('CreateTriggerLinkDialog — execution-key errors', () => {
  it('refetches the key list when the error state is retried', async () => {
    const user = userEvent.setup();
    const listTokensPayload = vi.fn().mockRejectedValue(new Error('keys boom'));
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
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
    const user = userEvent.setup();
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
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

describe('CreateTriggerLinkDialog — require api key', () => {
  it('a link is a token door, so the api-key toggle is always present and starts off', () => {
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(vi.fn()),
    });
    expect(screen.getByRole('checkbox', { name: 'Also require an api key' })).not.toBeChecked();
  });

  it('sends require_api_key: true when the toggle is on (never a trigger_auth object)', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn().mockResolvedValue(CREATED);
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.click(screen.getByRole('checkbox', { name: 'Also require an api key' }));
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(createTriggerLink).toHaveBeenCalledWith(
        expect.objectContaining({ require_api_key: true }),
      );
    });
    expect(createTriggerLink.mock.calls[0]?.[0]).not.toHaveProperty('trigger_auth');
  });

  it('sends require_api_key: false when the toggle is left off', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn().mockResolvedValue(CREATED);
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(createTriggerLink).toHaveBeenCalledWith(
        expect.objectContaining({ require_api_key: false }),
      );
    });
  });
});

describe('CreateTriggerLinkDialog — execution-key label', () => {
  it('falls back to the bare id when a key has neither description nor fingerprint', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(vi.fn(), {
        listTokensPayload: vi
          .fn()
          .mockResolvedValue([apiKey({ description: '', policy_data: {} })]),
      }),
    });

    await user.click(await screen.findByRole('combobox', { name: 'Execution key' }));
    expect(await screen.findByRole('option', { name: 'svc-events' })).toBeInTheDocument();
  });

  it('omits the description segment when a key has only a fingerprint', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(vi.fn(), {
        listTokensPayload: vi.fn().mockResolvedValue([apiKey({ description: '' })]),
      }),
    });

    await user.click(await screen.findByRole('combobox', { name: 'Execution key' }));
    expect(
      await screen.findByRole('option', { name: 'svc-events — kf-9f2c1d' }),
    ).toBeInTheDocument();
  });

  it('offers ONE option per user_id when two mints share it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(vi.fn(), {
        listTokensPayload: vi
          .fn()
          .mockResolvedValue([apiKey({ policy_data: { key_fingerprint: 'kf-old' } }), apiKey()]),
      }),
    });

    // Both rows name the same binding; two options would collide on the item value.
    await user.click(await screen.findByRole('combobox', { name: 'Execution key' }));
    expect(await screen.findAllByRole('option')).toHaveLength(1);
  });

  it('omits an EMPTY fingerprint, leaving no dangling separator', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(vi.fn(), {
        listTokensPayload: vi
          .fn()
          .mockResolvedValue([apiKey({ policy_data: { key_fingerprint: '' } })]),
      }),
    });

    await user.click(await screen.findByRole('combobox', { name: 'Execution key' }));
    expect(
      await screen.findByRole('option', { name: 'svc-events — Event service key' }),
    ).toBeInTheDocument();
  });

  it('omits the fingerprint segment on a deployment that surfaces none', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(vi.fn(), {
        listTokensPayload: vi.fn().mockResolvedValue([apiKey({ policy_data: {} })]),
      }),
    });

    await user.click(await screen.findByRole('combobox', { name: 'Execution key' }));
    expect(
      await screen.findByRole('option', { name: 'svc-events — Event service key' }),
    ).toBeInTheDocument();
  });
});

describe('CreateTriggerLinkDialog — params editor', () => {
  it('lands valid JSON in the body tool_kwargs', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn().mockResolvedValue(CREATED);
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.type(screen.getByLabelText('Tool params (JSON)'), '{{"priority": "high"}');
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(createTriggerLink).toHaveBeenCalledWith(
        expect.objectContaining({ tool_kwargs: { priority: 'high' } }),
      );
    });
  });

  it('blocks submit with a loud error on invalid JSON; never calls the API', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.type(screen.getByLabelText('Tool params (JSON)'), 'not json');
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(createTriggerLink).not.toHaveBeenCalled();
  });

  it('omits tool_kwargs from the body when the params editor is blank', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn().mockResolvedValue(CREATED);
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(createTriggerLink).toHaveBeenCalledOnce();
    });
    expect(createTriggerLink.mock.calls[0]?.[0]).toHaveProperty('tool_kwargs', undefined);
  });
});

describe('CreateTriggerLinkDialog — required choices + loud errors', () => {
  it('names the missing TOPIC when everything else is supplied', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await pickExecutionKey(user);
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('A topic is required.')).toBeInTheDocument();
    expect(screen.queryByText('Choose an expiry.')).not.toBeInTheDocument();
    expect(createTriggerLink).not.toHaveBeenCalled();
  });

  it('names the missing EXPIRY when everything else is supplied', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await pickExecutionKey(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('Choose an expiry.')).toBeInTheDocument();
    expect(screen.queryByText('A topic is required.')).not.toBeInTheDocument();
    expect(createTriggerLink).not.toHaveBeenCalled();
  });

  it('shows no required-field error before the operator submits', async () => {
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(vi.fn()),
    });

    await screen.findByRole('combobox', { name: 'Execution key' });
    expect(screen.queryByText('An execution key is required.')).not.toBeInTheDocument();
  });

  it('blocks a non-object params value locally, never shipping it', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    // Valid JSON, but not an object — a distinct branch from a parse failure.
    await user.type(screen.getByLabelText('Tool params (JSON)'), '"x"');
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText(/tool params must be a JSON object\./)).toBeInTheDocument();
    expect(createTriggerLink).not.toHaveBeenCalled();
  });

  it('clears a stale params error on the next submit, while still mounted', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.type(screen.getByLabelText('Tool params (JSON)'), 'not json');
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();

    // Blanking the topic makes the guard return early — only the per-submit reset clears it.
    await user.clear(screen.getByLabelText('Tool params (JSON)'));
    await user.clear(screen.getByLabelText('Topic'));
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('A topic is required.')).toBeInTheDocument();
    expect(screen.queryByText(/Invalid JSON/)).not.toBeInTheDocument();
    expect(createTriggerLink).not.toHaveBeenCalled();
  });

  it('clears a stale EXPIRY error on the next submit, while still mounted', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await user.type(screen.getByLabelText('Topic'), 'events.created');
    await pickExecutionKey(user);
    await user.click(screen.getByRole('radio', { name: 'Custom…' }));
    await user.type(screen.getByLabelText('Custom expiry (seconds)'), '3600.5');
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    expect(await screen.findByText(/positive whole number/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Custom expiry (seconds)'));
    await user.type(screen.getByLabelText('Custom expiry (seconds)'), '1800');
    await user.clear(screen.getByLabelText('Topic'));
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('A topic is required.')).toBeInTheDocument();
    expect(screen.queryByText(/positive whole number/)).not.toBeInTheDocument();
    expect(createTriggerLink).not.toHaveBeenCalled();
  });

  it('renders a 409 taken-name error loudly', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi
      .fn()
      .mockRejectedValue(new ApiConflictError('trigger link name already exists'));
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('trigger link name already exists')).toBeInTheDocument();
  });

  it("surfaces the server's pass-role refusal VERBATIM", async () => {
    const user = userEvent.setup();
    const message = 'execution_key svc-events is not yours to delegate';
    const createTriggerLink = vi.fn().mockRejectedValue(new ApiError(message, 403, 'pass_role'));
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("surfaces the server's token-free-evaluable refusal VERBATIM", async () => {
    const user = userEvent.setup();
    const message =
      'execution_key svc-events has a request-context-conditional policy and cannot be bound';
    const createTriggerLink = vi
      .fn()
      .mockRejectedValue(new ApiError(message, 400, 'execution_key_not_token_free'));
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('renders the in-memory 501 refusal (an unenumerated status) loudly', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi
      .fn()
      .mockRejectedValue(new ApiError('trigger links require the redis hooks backend', 501));
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(
      await screen.findByText('trigger links require the redis hooks backend'),
    ).toBeInTheDocument();
  });
});
