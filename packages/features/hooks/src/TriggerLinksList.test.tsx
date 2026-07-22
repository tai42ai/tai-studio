/**
 * Behavioural tests for the trigger-links section: the table (a permanent row, the
 * non-empty-params Badge and its negative pins), the loud list-error surface, and
 * revoke behind a confirm dialog (cancel is a no-op, confirm calls the API +
 * invalidates, and a rejected revoke keeps the row and shows a loud error — the kill
 * switch never fails silently). Rendered with an admin projection so the write
 * controls are present.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@tai42/api-client';
import type { TriggerLinkRecord } from '@tai42/api-client';

import { TriggerLinksList } from './TriggerLinksList';
import { fullProjection, renderWithProviders, type StubApiClient } from './test-utils';

function record(overrides: Partial<TriggerLinkRecord> = {}): TriggerLinkRecord {
  return {
    name: 'wall-poster',
    topic: 'orders.created',
    tool_kwargs: null,
    created_by: null,
    created_at: '2026-07-22T09:00:00Z',
    expires_at: null,
    token_hash_prefix: 'abc123def456',
    ...overrides,
  };
}

describe('TriggerLinksList — table', () => {
  it('renders a permanent row and a params Badge only for a NON-empty tool_kwargs', async () => {
    const client: StubApiClient = {
      listTriggerLinks: vi.fn().mockResolvedValue({
        items: [
          record({ name: 'with-params', tool_kwargs: { priority: 'high' } }),
          record({ name: 'perma-empty', tool_kwargs: {} }),
          record({ name: 'perma-null', tool_kwargs: null }),
        ],
        total: 3,
      }),
    };
    renderWithProviders(<TriggerLinksList />, { client, projection: fullProjection() });

    const withParams = (await screen.findByText('with-params')).closest('tr');
    expect(within(withParams as HTMLElement).getByText('params')).toBeInTheDocument();

    // `{}` and `null` both read as param-less — no Badge on those rows.
    const emptyRow = screen.getByText('perma-empty').closest('tr');
    const nullRow = screen.getByText('perma-null').closest('tr');
    expect(within(emptyRow as HTMLElement).queryByText('params')).not.toBeInTheDocument();
    expect(within(nullRow as HTMLElement).queryByText('params')).not.toBeInTheDocument();

    // A null expiry renders as "Permanent".
    expect(within(emptyRow as HTMLElement).getByText('Permanent')).toBeInTheDocument();
    // The hash prefix is shown (never a raw token).
    expect(screen.getAllByText('abc123def456').length).toBeGreaterThan(0);
  });

  it('renders a loud error state when the list query rejects', async () => {
    const client: StubApiClient = {
      listTriggerLinks: vi.fn().mockRejectedValue(new Error('boom: links failed')),
    };
    renderWithProviders(<TriggerLinksList />, { client, projection: fullProjection() });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: links failed');
  });

  it('shows the empty state when there are no links', async () => {
    const client: StubApiClient = {
      listTriggerLinks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    renderWithProviders(<TriggerLinksList />, { client, projection: fullProjection() });
    expect(await screen.findByText('No trigger links')).toBeInTheDocument();
  });
});

describe('TriggerLinksList — revoke', () => {
  it('does NOT revoke when the confirm dialog is cancelled; the row stays', async () => {
    const user = userEvent.setup();
    const deleteTriggerLink = vi.fn();
    const client: StubApiClient = {
      listTriggerLinks: vi.fn().mockResolvedValue({ items: [record()], total: 1 }),
      deleteTriggerLink,
    };
    renderWithProviders(<TriggerLinksList />, { client, projection: fullProjection() });

    await user.click(
      await screen.findByRole('button', { name: 'Revoke trigger link wall-poster' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(deleteTriggerLink).not.toHaveBeenCalled();
    expect(screen.getByText('wall-poster')).toBeInTheDocument();
  });

  it('revokes behind the confirm dialog and invalidates the list', async () => {
    const user = userEvent.setup();
    const listTriggerLinks = vi.fn().mockResolvedValue({ items: [record()], total: 1 });
    const deleteTriggerLink = vi.fn().mockResolvedValue({ removed: true, name: 'wall-poster' });
    const client: StubApiClient = { listTriggerLinks, deleteTriggerLink };
    renderWithProviders(<TriggerLinksList />, { client, projection: fullProjection() });

    await user.click(
      await screen.findByRole('button', { name: 'Revoke trigger link wall-poster' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke link' }));

    await waitFor(() => {
      expect(deleteTriggerLink).toHaveBeenCalledWith('wall-poster');
    });
    // Invalidation refetches the list: the first call was the initial load.
    await waitFor(() => {
      expect(listTriggerLinks.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('keeps the row and shows a loud error when the revoke rejects', async () => {
    const user = userEvent.setup();
    const deleteTriggerLink = vi.fn().mockRejectedValue(new ApiError('unknown trigger link', 404));
    const client: StubApiClient = {
      listTriggerLinks: vi.fn().mockResolvedValue({ items: [record()], total: 1 }),
      deleteTriggerLink,
    };
    renderWithProviders(<TriggerLinksList />, { client, projection: fullProjection() });

    await user.click(
      await screen.findByRole('button', { name: 'Revoke trigger link wall-poster' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Revoke link' }));

    expect(await screen.findByText('unknown trigger link')).toBeInTheDocument();
    // The row survives a failed revoke.
    expect(screen.getByText('wall-poster')).toBeInTheDocument();
  });

  it("resets the mutation on open, so one row's failed revoke does not leak its error into the next row's dialog", async () => {
    const user = userEvent.setup();
    // The revoke fails for the first row; the second row never submits.
    const deleteTriggerLink = vi
      .fn()
      .mockRejectedValue(new ApiError('revoke of link-a forbidden', 403));
    const client: StubApiClient = {
      listTriggerLinks: vi.fn().mockResolvedValue({
        items: [record({ name: 'link-a' }), record({ name: 'link-b' })],
        total: 2,
      }),
      deleteTriggerLink,
    };
    renderWithProviders(<TriggerLinksList />, { client, projection: fullProjection() });

    // Row A: open the confirm, revoke, and it fails loudly — the row survives.
    await user.click(await screen.findByRole('button', { name: 'Revoke trigger link link-a' }));
    const dialogA = await screen.findByRole('dialog');
    await user.click(within(dialogA).getByRole('button', { name: 'Revoke link' }));
    expect(await screen.findByText('revoke of link-a forbidden')).toBeInTheDocument();
    expect(screen.getByText('link-a')).toBeInTheDocument();

    // Cancel A's dialog.
    await user.click(within(dialogA).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // Row B: opening the confirm must reset the mutation — A's stale error must NOT
    // leak into the freshly-opened dialog before any action is taken.
    await user.click(screen.getByRole('button', { name: 'Revoke trigger link link-b' }));
    const dialogB = await screen.findByRole('dialog');
    expect(within(dialogB).queryByText('revoke of link-a forbidden')).not.toBeInTheDocument();
    expect(within(dialogB).queryByRole('alert')).not.toBeInTheDocument();
  });
});
