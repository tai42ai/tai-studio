/**
 * Behavioural tests for the create-trigger-link dialog: the happy path ends in a QR
 * (shown once, no reopen affordance), the params JSON editor lands valid JSON in the
 * body / blocks invalid JSON / omits an empty field, the expiry picker has NO default
 * (submit disabled until picked) and maps presets + a validated custom value, and
 * every server status (400 / 409 / 501, and any other) renders loudly.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiConflictError, ApiError } from '@tai42/api-client';

import { CreateTriggerLinkDialog } from './CreateTriggerLinkDialog';
import { renderWithProviders, type StubApiClient } from './test-utils';

const CREATED = {
  name: 'wall-poster',
  trigger_path: '/trigger/trg-abc',
  token: 'trg-abc',
  topic: 'orders.created',
  expires_at: null,
};

function baseClient(createTriggerLink: ReturnType<typeof vi.fn>): StubApiClient {
  return { baseUrl: '', createTriggerLink };
}

describe('CreateTriggerLinkDialog — create + QR', () => {
  it('creates a permanent link and shows the QR (shown once, no reopen affordance)', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn().mockResolvedValue(CREATED);
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await user.type(screen.getByLabelText('Topic'), 'orders.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(createTriggerLink).toHaveBeenCalledWith({
        topic: 'orders.created',
        name: undefined,
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

  it('maps the expiry presets (1 hour → 3600) into the body', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi
      .fn()
      .mockResolvedValue({ ...CREATED, expires_at: '2026-07-22T10:00:00Z' });
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await user.type(screen.getByLabelText('Topic'), 'orders.created');
    await user.click(screen.getByRole('radio', { name: '1 hour' }));
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

    await user.type(screen.getByLabelText('Topic'), 'orders.created');
    await user.click(screen.getByRole('radio', { name: 'Custom…' }));
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

    await user.type(screen.getByLabelText('Topic'), 'orders.created');
    await user.click(screen.getByRole('radio', { name: 'Custom…' }));
    await user.type(screen.getByLabelText('Custom expiry (seconds)'), '3600.5');
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText(/positive whole number/)).toBeInTheDocument();
    expect(createTriggerLink).not.toHaveBeenCalled();
  });
});

describe('CreateTriggerLinkDialog — params editor', () => {
  it('lands valid JSON in the body tool_kwargs', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi.fn().mockResolvedValue(CREATED);
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await user.type(screen.getByLabelText('Topic'), 'orders.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
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

    await user.type(screen.getByLabelText('Topic'), 'orders.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
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

    await user.type(screen.getByLabelText('Topic'), 'orders.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    await waitFor(() => {
      expect(createTriggerLink).toHaveBeenCalledOnce();
    });
    expect(createTriggerLink.mock.calls[0]?.[0]).toHaveProperty('tool_kwargs', undefined);
  });
});

describe('CreateTriggerLinkDialog — required choices + loud errors', () => {
  it('disables submit until BOTH a topic and an expiry are chosen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(vi.fn()),
    });

    const submit = screen.getByRole('button', { name: 'Create link' });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Topic'), 'orders.created');
    // Still disabled with no expiry chosen (no default).
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    expect(submit).toBeEnabled();
  });

  it('renders a 409 taken-name error loudly', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi
      .fn()
      .mockRejectedValue(new ApiConflictError('trigger link name already exists'));
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await user.type(screen.getByLabelText('Topic'), 'orders.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByText('trigger link name already exists')).toBeInTheDocument();
  });

  it('renders the in-memory 501 refusal (an unenumerated status) loudly', async () => {
    const user = userEvent.setup();
    const createTriggerLink = vi
      .fn()
      .mockRejectedValue(new ApiError('trigger links require the redis hooks backend', 501));
    renderWithProviders(<CreateTriggerLinkDialog onClose={vi.fn()} />, {
      client: baseClient(createTriggerLink),
    });

    await user.type(screen.getByLabelText('Topic'), 'orders.created');
    await user.click(screen.getByRole('radio', { name: 'Permanent' }));
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(
      await screen.findByText('trigger links require the redis hooks backend'),
    ).toBeInTheDocument();
  });
});
