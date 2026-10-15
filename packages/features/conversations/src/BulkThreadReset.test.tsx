/**
 * The thread list's multi-select bulk reset: the row checkboxes and the header
 * select-all appear only for a caller who may delete; select-all ticks the loaded
 * rows; the "Reset selected (N)" confirm names the count; and the fan-out over the
 * per-thread delete door surfaces EVERY result — the threads that reset cleanly
 * drop from the list, and a thread whose delete fails (a 409 with a turn in flight)
 * stays as a failed row with its reason and a Retry that forgets it on a later try.
 */
import { ApiError, type ConversationThread } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  fullProjection,
  makeThread,
  page,
  renderWithProviders,
  scopedProjection,
  type StubApiClient,
} from './test-utils';
import { ThreadList } from './ThreadList';

const ROUTE = 'chat';

function threads(): ConversationThread[] {
  return [
    makeThread({ thread_id: 'chat/+1', client_address: '+1' }),
    makeThread({ thread_id: 'chat/+2', client_address: '+2' }),
    makeThread({ thread_id: 'chat/+3', client_address: '+3' }),
  ];
}

/**
 * A server stand-in: the listing reads the live set, and a delete drops the thread
 * from it — except `chat/+3`, which holds a turn in flight and keeps rejecting
 * until `releaseInFlight` lets it through. So a refetch after a reset returns
 * exactly the threads that are still present.
 */
function server() {
  const present = new Map(threads().map((thread) => [thread.thread_id, thread]));
  let released = false;
  const client: StubApiClient = {
    listConversationThreads: vi.fn(() => Promise.resolve(page([...present.values()]))),
    deleteConversationThread: vi.fn((_route: string, threadId: string) => {
      if (threadId === 'chat/+3' && !released) {
        return Promise.reject(new ApiError('thread has a turn in flight', 409));
      }
      present.delete(threadId);
      return Promise.resolve({
        removed: 1,
        route_name: ROUTE,
        thread_id: threadId,
        states_erased: 0,
      });
    }),
  };
  return {
    client,
    delete: client.deleteConversationThread as ReturnType<typeof vi.fn>,
    release: () => {
      released = true;
    },
  };
}

function renderList(client: StubApiClient, admin = true) {
  return renderWithProviders(
    <ThreadList
      route={ROUTE}
      selected={undefined}
      status={undefined}
      address={undefined}
      listRef={createRef<HTMLDivElement>()}
      headingRef={createRef<HTMLHeadingElement>()}
    />,
    { client, projection: admin ? fullProjection() : scopedProjection() },
  );
}

/** A client that only lists (plus any extra stubbed methods), for the select tests. */
function listClient(extra: StubApiClient = {}): StubApiClient {
  return {
    listConversationThreads: vi.fn(() => Promise.resolve(page(threads()))),
    ...extra,
  };
}

describe('ThreadList — multi-select bulk reset', () => {
  it('offers no selection surface to a caller who cannot delete', async () => {
    renderList(listClient(), false);

    await screen.findByText('+1');
    expect(screen.queryByRole('checkbox', { name: 'Select all threads' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Select thread chat/+1' })).toBeNull();
  });

  it('select-all ticks every loaded row', async () => {
    const user = userEvent.setup();
    renderList(listClient({ deleteConversationThread: vi.fn() as never }));

    await user.click(await screen.findByRole('checkbox', { name: 'Select all threads' }));

    for (const id of ['chat/+1', 'chat/+2', 'chat/+3']) {
      expect(screen.getByRole('checkbox', { name: `Select thread ${id}` })).toBeChecked();
    }
    expect(screen.getByRole('button', { name: 'Reset selected (3)' })).toBeInTheDocument();
  });

  it('names the selected count in the confirm', async () => {
    const user = userEvent.setup();
    renderList(listClient({ deleteConversationThread: vi.fn() as never }));

    await user.click(await screen.findByRole('checkbox', { name: 'Select thread chat/+1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select thread chat/+2' }));
    await user.click(screen.getByRole('button', { name: 'Reset selected (2)' }));

    expect(screen.getByText(/Reset 2 selected threads\?/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset 2 threads' })).toBeInTheDocument();
  });

  it('fans out the reset, drops the threads that reset and surfaces the one that failed', async () => {
    const api = server();
    const user = userEvent.setup();
    renderList(api.client);

    await user.click(await screen.findByRole('checkbox', { name: 'Select all threads' }));
    await user.click(screen.getByRole('button', { name: 'Reset selected (3)' }));
    await user.click(screen.getByRole('button', { name: 'Reset 3 threads' }));

    // Every selected thread went through the one per-thread door, once each.
    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledTimes(3);
    });
    expect(api.delete).toHaveBeenCalledWith(ROUTE, 'chat/+1');
    expect(api.delete).toHaveBeenCalledWith(ROUTE, 'chat/+2');
    expect(api.delete).toHaveBeenCalledWith(ROUTE, 'chat/+3');

    // The failure is loud: a per-thread row with its reason and a Retry.
    const result = await screen.findByTestId('conversation-bulk-reset-result');
    expect(result).toHaveAttribute('role', 'alert');
    expect(result).toHaveTextContent('2 threads reset.');
    expect(result).toHaveTextContent('1 thread could not be reset:');
    expect(result).toHaveTextContent('Thread chat/+3: thread has a turn in flight');
    expect(within(result).getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    // The two that reset cleanly have left the list; the failed one stays.
    await waitFor(() => {
      expect(screen.queryByText('+1')).toBeNull();
    });
    expect(screen.queryByText('+2')).toBeNull();
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('retries a failed thread and forgets it once the turn clears', async () => {
    const api = server();
    const user = userEvent.setup();
    renderList(api.client);

    await user.click(await screen.findByRole('checkbox', { name: 'Select all threads' }));
    await user.click(screen.getByRole('button', { name: 'Reset selected (3)' }));
    await user.click(screen.getByRole('button', { name: 'Reset 3 threads' }));

    const result = await screen.findByTestId('conversation-bulk-reset-result');
    expect(await within(result).findByRole('button', { name: 'Retry' })).toBeInTheDocument();

    // The in-flight turn clears; the retry now succeeds and the row leaves.
    api.release();
    await user.click(within(result).getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.queryByText('+3')).toBeNull();
    });
    expect(screen.getByTestId('conversation-bulk-reset-result')).toHaveTextContent(
      '3 threads reset.',
    );
    expect(
      within(screen.getByTestId('conversation-bulk-reset-result')).queryByRole('button', {
        name: 'Retry',
      }),
    ).toBeNull();
  });

  it('calls no delete when the confirm is cancelled', async () => {
    const deleteConversationThread = vi.fn();
    const user = userEvent.setup();
    renderList(listClient({ deleteConversationThread: deleteConversationThread as never }));

    await user.click(await screen.findByRole('checkbox', { name: 'Select thread chat/+1' }));
    await user.click(screen.getByRole('button', { name: 'Reset selected (1)' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByText(/Reset 1 selected thread\?/)).toBeNull();
    });
    expect(deleteConversationThread).not.toHaveBeenCalled();
  });
});
