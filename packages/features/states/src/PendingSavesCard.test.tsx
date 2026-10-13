/**
 * The pending-saves card: every state (loading, error, empty, rows), the default tab, the row
 * cells, Retry's success and failure lines, the Discard confirmation, and Load more.
 */
import { ApiError, type PendingSave } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PendingSavesCard } from './PendingSavesCard';
import { renderWithProviders, type StubApiClient } from './test-utils';

const subject = { target_kind: 'agent', target_name: 'assistant', kind: 'thread', key: 't-1' };

function save(over: Partial<PendingSave> = {}): PendingSave {
  return {
    id: '17',
    status: 'failed',
    run_id: 'run-0123456789abcdef',
    states: ['profile'],
    subjects: [
      { state: 'profile', subject },
      { state: 'profile', subject: { ...subject, key: 't-2' } },
    ],
    calls: [{ kind: 'tool', target: 'notify' }],
    attempts: 2,
    last_error: `ValueValidationError: ${'x'.repeat(100)}`,
    failed_phase: 'records',
    created_at: new Date(Date.now() - 180_000).toISOString(),
    failed_at: new Date().toISOString(),
    ...over,
  } as PendingSave;
}

function page(items: PendingSave[], over: Record<string, unknown> = {}) {
  return {
    items,
    next_cursor: null,
    outstanding: items.length,
    failed: items.filter((i) => i.status === 'failed').length,
    ...over,
  };
}

function client(over: Partial<StubApiClient> = {}): StubApiClient {
  return {
    listPendingSaves: vi.fn().mockResolvedValue(page([save()])),
    retryPendingSave: vi.fn().mockResolvedValue({ id: '17', status: 'applied', last_error: null }),
    discardPendingSave: vi.fn().mockResolvedValue({ discarded: '17' }),
    ...over,
  };
}

describe('PendingSavesCard', () => {
  it('shows a skeleton while loading', () => {
    renderWithProviders(<PendingSavesCard />, {
      client: client({ listPendingSaves: vi.fn().mockReturnValue(new Promise(() => undefined)) }),
    });
    expect(screen.getByText('Pending saves')).toBeInTheDocument();
    expect(document.querySelector('.tai-skeleton')).not.toBeNull();
  });

  it('shows the error with a retry', async () => {
    renderWithProviders(<PendingSavesCard />, {
      client: client({
        listPendingSaves: vi.fn().mockRejectedValue(new ApiError('store down', 503)),
      }),
    });
    expect(await screen.findByText(/store down/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows one muted line when nothing is pending', async () => {
    renderWithProviders(<PendingSavesCard />, {
      client: client({ listPendingSaves: vi.fn().mockResolvedValue(page([])) }),
    });
    expect(
      await screen.findByText('No pending saves. Every state write has been applied.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('says no save failed on an empty Failed tab', async () => {
    const pending = save({ id: '1', status: 'pending', last_error: null, attempts: 0 });
    const list = vi
      .fn()
      .mockImplementation(({ status }: { status: string }) =>
        Promise.resolve(
          status === 'failed' ? page([], { outstanding: 1, failed: 0 }) : page([pending]),
        ),
      );
    renderWithProviders(<PendingSavesCard />, { client: client({ listPendingSaves: list }) });
    expect(await screen.findByText('Pending')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Failed' }));
    expect(
      await screen.findByText('No failed saves. Every outstanding save is still being applied.'),
    ).toBeInTheDocument();
  });

  // The totals and the rows are two reads: a save applied or discarded between them leaves the
  // list empty under a non-zero summary until the next refresh.
  it('says every write applied on an empty All outstanding tab', async () => {
    const failed = save({ id: '17' });
    const list = vi
      .fn()
      .mockImplementation(({ status }: { status: string }) =>
        Promise.resolve(
          status === 'failed' ? page([failed]) : page([], { outstanding: 1, failed: 1 }),
        ),
      );
    renderWithProviders(<PendingSavesCard />, { client: client({ listPendingSaves: list }) });
    expect(await screen.findByText('17')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'All outstanding' }));
    expect(
      await screen.findByText('No pending saves. Every state write has been applied.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/No failed saves/)).toBeNull();
  });

  it('opens on the failed saves and renders every cell of a row', async () => {
    const list = vi.fn().mockResolvedValue(page([save()], { outstanding: 3, failed: 1 }));
    renderWithProviders(<PendingSavesCard />, { client: client({ listPendingSaves: list }) });
    expect(await screen.findByTestId('pending-saves-summary')).toHaveTextContent(
      '3 outstanding · 1 failed',
    );
    expect(screen.getByRole('tab', { name: 'Failed' })).toHaveAttribute('data-state', 'active');
    expect(list).toHaveBeenCalledWith(
      { status: 'failed', limit: 50, cursor: undefined },
      expect.anything(),
    );
    const row = screen.getByText('17').closest('tr');
    if (row === null) throw new Error('no row');
    const cells = within(row);
    expect(cells.getByText('Failed')).toBeInTheDocument();
    expect(cells.getByText('profile · thread/t-1')).toBeInTheDocument();
    expect(cells.getByText(/\+1 more/)).toBeInTheDocument();
    expect(cells.getByText('notify')).toBeInTheDocument();
    expect(cells.getByText('run-01234567…')).toHaveAttribute('title', 'run-0123456789abcdef');
    expect(cells.getByText(/3 minutes ago/)).toBeInTheDocument();
    expect(cells.getByText('2')).toBeInTheDocument();
    expect(cells.getByText(/^ValueValidationError: x+…$/)).toBeInTheDocument();
  });

  it('opens on all outstanding saves when none failed, with a badge per status', async () => {
    const outstanding = [
      save({ id: '1', status: 'pending', run_id: null, calls: [], last_error: null, attempts: 0 }),
      save({ id: '2', status: 'calls' }),
      save({ id: '3', status: 'running' }),
    ];
    const list = vi
      .fn()
      .mockImplementation(({ status }: { status: string }) =>
        Promise.resolve(
          status === 'failed'
            ? page([], { outstanding: 3, failed: 0 })
            : page(outstanding, { failed: 0 }),
        ),
      );
    renderWithProviders(<PendingSavesCard />, { client: client({ listPendingSaves: list }) });
    expect(await screen.findByText('Calls queued')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All outstanding' })).toHaveAttribute(
      'data-state',
      'active',
    );
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Calling')).toBeInTheDocument();
    const pendingRow = screen.getByText('1').closest('tr');
    if (pendingRow === null) throw new Error('no row');
    expect(within(pendingRow).getAllByText('—')).toHaveLength(3); // calls, run, last error
    expect(within(pendingRow).queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('retries a failed save and reports it applied', async () => {
    const user = userEvent.setup({ delay: null });
    const api = client();
    renderWithProviders(<PendingSavesCard />, { client: api });
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Save 17 applied.')).toBeInTheDocument();
    expect(api.retryPendingSave).toHaveBeenCalledWith('17');
  });

  it('reports a requeued save and a save that failed again', async () => {
    const user = userEvent.setup({ delay: null });
    const retry = vi
      .fn()
      .mockResolvedValueOnce({ id: '17', status: 'calls', last_error: null })
      .mockResolvedValueOnce({
        id: '17',
        status: 'failed',
        last_error: 'ValueValidationError: still refused',
      });
    renderWithProviders(<PendingSavesCard />, { client: client({ retryPendingSave: retry }) });
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Save 17 is queued again.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByText('Save 17 failed again: ValueValidationError: still refused'),
    ).toBeInTheDocument();
  });

  it('shows a failed retry under its row', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<PendingSavesCard />, {
      client: client({
        retryPendingSave: vi
          .fn()
          .mockRejectedValue(new ApiError('pending save 17 is not failed', 409)),
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('pending save 17 is not failed');
    expect(alert).toHaveStyle({ color: 'var(--tai-color-err-text)' });
  });

  it('discards a failed save after the confirmation', async () => {
    const user = userEvent.setup({ delay: null });
    const api = client();
    renderWithProviders(<PendingSavesCard />, { client: api });
    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard pending save 17?' });
    expect(dialog).toHaveTextContent(
      'Its record writes and deferred calls are dropped and will never be applied. The held subjects are released.',
    );
    expect(api.discardPendingSave).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Discard save' }));
    await waitFor(() => {
      expect(api.discardPendingSave).toHaveBeenCalledWith('17');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('loads the next page and hides Load more at the end', async () => {
    const user = userEvent.setup({ delay: null });
    const list = vi
      .fn()
      .mockResolvedValueOnce(
        page([save({ id: '20' })], { next_cursor: '20', outstanding: 2, failed: 2 }),
      )
      .mockResolvedValueOnce(page([save({ id: '19' })], { outstanding: 2, failed: 2 }));
    renderWithProviders(<PendingSavesCard />, { client: client({ listPendingSaves: list }) });
    await user.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('19')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith(
      { status: 'failed', limit: 50, cursor: '20' },
      expect.anything(),
    );
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});
