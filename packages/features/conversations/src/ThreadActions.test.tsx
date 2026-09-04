/**
 * The destructive per-thread actions: the delete-thread door on every thread, the
 * GDPR erase-person door only on a linked person's aggregated thread, the confirm
 * gating (a cancel calls nothing), the error path (a failure keeps the confirm open),
 * the reset-on-open (a reopened confirm carries no stale error), and the leave-to-list
 * navigation on success.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tai42/api-client';

import { ThreadActions } from './ThreadActions';
import { PERSON_THREAD_PREFIX } from './persons';
import { renderWithProviders } from './test-utils';

const ROUTE = 'support';
const THREAD = 'support/+15551234567';
const PERSON_THREAD = `${PERSON_THREAD_PREFIX}p-123`;

describe('ThreadActions — ordinary thread', () => {
  it('offers delete-thread but not erase-person', async () => {
    renderWithProviders(<ThreadActions route={ROUTE} threadId={THREAD} />, { client: {} });
    expect(screen.getByRole('button', { name: `Delete thread ${THREAD}` })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Erase person/ })).toBeNull();
  });

  it('deletes the thread behind the confirm and leaves for the route list', async () => {
    const user = userEvent.setup();
    const deleteConversationThread = vi
      .fn()
      .mockResolvedValue({ removed: 2, route_name: ROUTE, thread_id: THREAD });
    const { navigate } = renderWithProviders(<ThreadActions route={ROUTE} threadId={THREAD} />, {
      client: { deleteConversationThread },
    });

    await user.click(screen.getByRole('button', { name: `Delete thread ${THREAD}` }));
    expect(screen.getByText(/forgets its transcript/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete thread' }));
    await waitFor(() => {
      expect(deleteConversationThread).toHaveBeenCalledWith(ROUTE, THREAD);
    });
    // The thread it named is gone: the pane leaves for the route's list.
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('conversations', { route: ROUTE });
    });
  });

  it('cancels a pending delete without calling the API', async () => {
    const user = userEvent.setup();
    const deleteConversationThread = vi.fn();
    renderWithProviders(<ThreadActions route={ROUTE} threadId={THREAD} />, {
      client: { deleteConversationThread },
    });

    await user.click(screen.getByRole('button', { name: `Delete thread ${THREAD}` }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText(/forgets its transcript/)).not.toBeInTheDocument();
    });
    expect(deleteConversationThread).not.toHaveBeenCalled();
  });

  it('surfaces a delete failure and keeps the confirm open', async () => {
    const user = userEvent.setup();
    const deleteConversationThread = vi
      .fn()
      .mockRejectedValue(new ApiError('thread has a turn in flight', 409));
    renderWithProviders(<ThreadActions route={ROUTE} threadId={THREAD} />, {
      client: { deleteConversationThread },
    });

    await user.click(screen.getByRole('button', { name: `Delete thread ${THREAD}` }));
    await user.click(screen.getByRole('button', { name: 'Delete thread' }));

    expect(await screen.findByText('thread has a turn in flight')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete thread' })).toBeInTheDocument();
  });

  it('reopens the confirm clean after a failed attempt (no stale error)', async () => {
    const user = userEvent.setup();
    const deleteConversationThread = vi.fn().mockRejectedValue(new ApiError('busy', 409));
    renderWithProviders(<ThreadActions route={ROUTE} threadId={THREAD} />, {
      client: { deleteConversationThread },
    });

    await user.click(screen.getByRole('button', { name: `Delete thread ${THREAD}` }));
    await user.click(screen.getByRole('button', { name: 'Delete thread' }));
    expect(await screen.findByText('busy')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText(/forgets its transcript/)).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: `Delete thread ${THREAD}` }));

    expect(screen.getByText(/forgets its transcript/)).toBeInTheDocument();
    expect(screen.queryByText('busy')).not.toBeInTheDocument();
  });
});

describe('ThreadActions — person thread', () => {
  it('offers both delete-thread and the GDPR erase-person action', () => {
    renderWithProviders(<ThreadActions route={ROUTE} threadId={PERSON_THREAD} />, { client: {} });
    expect(
      screen.getByRole('button', { name: `Delete thread ${PERSON_THREAD}` }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erase person p-123' })).toBeInTheDocument();
  });

  it('erases the person behind a confirm stating the full blast radius', async () => {
    const user = userEvent.setup();
    const deleteConversationPerson = vi
      .fn()
      .mockResolvedValue({ person_id: 'p-123', removed: 5, erased: true });
    const { navigate } = renderWithProviders(
      <ThreadActions route={ROUTE} threadId={PERSON_THREAD} />,
      { client: { deleteConversationPerson } },
    );

    await user.click(screen.getByRole('button', { name: 'Erase person p-123' }));
    // The confirm copy states the truth plainly: GDPR, every route.
    expect(screen.getByText(/right-to-erasure/)).toBeInTheDocument();
    expect(screen.getByText(/every route/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Erase person' }));
    await waitFor(() => {
      expect(deleteConversationPerson).toHaveBeenCalledWith('p-123');
    });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('conversations', { route: ROUTE });
    });
  });

  it('surfaces an erase failure and keeps the confirm open', async () => {
    const user = userEvent.setup();
    const deleteConversationPerson = vi
      .fn()
      .mockRejectedValue(new ApiError('person has a turn in flight', 409));
    renderWithProviders(<ThreadActions route={ROUTE} threadId={PERSON_THREAD} />, {
      client: { deleteConversationPerson },
    });

    await user.click(screen.getByRole('button', { name: 'Erase person p-123' }));
    await user.click(screen.getByRole('button', { name: 'Erase person' }));

    expect(await screen.findByText('person has a turn in flight')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erase person' })).toBeInTheDocument();
  });
});
