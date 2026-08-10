/**
 * The thread list: the row's four columns, the admin-only 403 copy, paging
 * through a long route, the failure a page-load can hit without blanking the
 * rows already on screen, the self-refresh that keeps a list left open beside a
 * transcript from going stale — and what that refresh may never do: list one
 * thread twice, drop the newest page, or fail without saying so.
 */
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tai42/api-client';

import { RELATIVE_TICK_MS } from './clock';
import { ThreadList, THREADS_MAX_PAGES, THREADS_PAGE_SIZE, THREADS_REFRESH_MS } from './ThreadList';
import { makeThread, page, renderWithProviders } from './test-utils';

function renderList(listConversationThreads: unknown, selected?: string) {
  return renderWithProviders(
    <ThreadList
      route="chat"
      selected={selected}
      listRef={createRef<HTMLDivElement>()}
      headingRef={createRef<HTMLHeadingElement>()}
    />,
    { client: { listConversationThreads } as never },
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** One page of threads per page number, so a listing can be paged arbitrarily deep. */
function pagedThreads() {
  return vi.fn((_route: string, pageNumber: number) =>
    Promise.resolve(
      page(
        [
          makeThread({
            thread_id: `t${String(pageNumber)}`,
            client_address: `+${String(pageNumber)}`,
          }),
        ],
        pageNumber + 1,
        pageNumber,
      ),
    ),
  );
}

describe('ThreadList', () => {
  it('shows a skeleton under the route heading while the page loads', () => {
    renderList(vi.fn().mockReturnValue(new Promise(() => undefined)));
    expect(screen.getByRole('heading', { level: 2, name: 'chat' })).toBeInTheDocument();
    expect(document.querySelector('.tai-skeleton')).not.toBeNull();
  });

  it('renders address, activity, count and delivery for each thread', async () => {
    renderList(vi.fn().mockResolvedValue(page([makeThread({ message_count: 1234 })])));

    const table = await screen.findByTestId('conversation-threads-table');
    expect(
      within(table).getByRole('link', { name: 'Open thread svc-chat/+15551234567' }),
    ).toHaveTextContent('+15551234567');
    expect(within(table).getByText('1,234')).toBeInTheDocument();
    expect(within(table).getByText('Delivered')).toBeInTheDocument();
    // The relative label carries the exact instant as its title.
    expect(within(table).getByTitle(new Date(1_800_000_000_000).toLocaleString())).toBeVisible();
  });

  it('shows a failed thread in the danger tint with the word beside it', async () => {
    renderList(vi.fn().mockResolvedValue(page([makeThread({ last_delivery_status: 'failed' })])));

    const chip = await screen.findByText('Failed');
    expect(chip).toHaveAttribute('data-variant', 'danger');
  });

  it('marks the open thread as the current row', async () => {
    renderList(vi.fn().mockResolvedValue(page([makeThread()])), 'svc-chat/+15551234567');

    const row = await screen.findByRole('link', { name: 'Open thread svc-chat/+15551234567' });
    expect(row).toHaveAttribute('aria-current', 'true');
  });

  it('explains a route with no threads yet', async () => {
    renderList(vi.fn().mockResolvedValue(page([])));
    expect(await screen.findByText('No threads yet')).toBeInTheDocument();
  });

  it('reads a 403 as the admin-only boundary it is', async () => {
    renderList(vi.fn().mockRejectedValue(new ApiError('forbidden', 403)));

    expect(await screen.findByText('Not available to this session')).toBeInTheDocument();
    expect(
      screen.getByText(
        'A thread listing spans every caller on the route, so it is available to administrators only.',
      ),
    ).toBeInTheDocument();
  });

  it('refreshes itself: a thread that has just failed loses its Delivered chip', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const listThreads = vi
      .fn()
      .mockResolvedValueOnce(page([makeThread()]))
      .mockResolvedValue(page([makeThread({ last_delivery_status: 'failed' })]));
    renderList(listThreads);

    expect(await screen.findByText('Delivered')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THREADS_REFRESH_MS + 10);
    });
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
    expect(screen.queryByText('Delivered')).toBeNull();
  });

  it('keeps its relative labels live while nothing about the listing changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // A thread that last spoke a minute before this render. The listing is
    // deeply equal on every refresh, so only a clock of the list's own can move
    // this label on.
    const lastActivity = Date.now() / 1000 - 61;
    renderList(vi.fn().mockResolvedValue(page([makeThread({ last_activity_at: lastActivity })])));

    expect(await screen.findByText('1 minute ago')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RELATIVE_TICK_MS * 2 + 10);
    });
    await waitFor(() => {
      expect(screen.getByText('2 minutes ago')).toBeInTheDocument();
    });
  });

  it('pages forward through a long route', async () => {
    const user = userEvent.setup();
    const older = makeThread({ thread_id: 'svc-chat/+15559999999', client_address: '+15559' });
    const listThreads = vi
      .fn()
      .mockResolvedValueOnce(page([makeThread()], 2))
      .mockResolvedValueOnce(page([older], null, 2));
    renderList(listThreads);

    await user.click(await screen.findByRole('button', { name: 'Load more threads' }));

    expect(await screen.findByText('+15559')).toBeInTheDocument();
    expect(listThreads).toHaveBeenLastCalledWith('chat', 2, THREADS_PAGE_SIZE, expect.anything());
    expect(screen.queryByRole('button', { name: 'Load more threads' })).toBeNull();
  });

  it('disables the paging control while the next page is in flight', async () => {
    const user = userEvent.setup();
    let releaseSecondPage: (() => void) | undefined;
    const listThreads = vi
      .fn()
      .mockResolvedValueOnce(page([makeThread()], 2))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releaseSecondPage = () => {
            resolve(page([makeThread({ thread_id: 't2', client_address: '+15557' })], null, 2));
          };
        }),
      );
    renderList(listThreads);

    await user.click(await screen.findByRole('button', { name: 'Load more threads' }));
    const control = screen.getByRole('button', { name: 'Loading…' });
    expect(control).toBeDisabled();

    releaseSecondPage?.();
    expect(await screen.findByText('+15557')).toBeInTheDocument();
  });

  it('retries the initial page after a failure', async () => {
    const user = userEvent.setup();
    const listThreads = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('reader exploded', 500))
      .mockResolvedValue(page([makeThread()]));
    renderList(listThreads);

    expect(await screen.findByRole('alert')).toHaveTextContent('reader exploded');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('conversation-threads-table')).toBeInTheDocument();
  });

  // A refresh re-reads the retained pages one after another, not in one shot, so
  // a thread restamped between two of those reads is returned by both.
  it('lists a thread once when a refresh catches it on two pages', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const a = makeThread({ thread_id: 't-a', client_address: '+1000' });
    const b = makeThread({ thread_id: 't-b', client_address: '+2000' });
    const c = makeThread({ thread_id: 't-c', client_address: '+3000' });
    const d = makeThread({ thread_id: 't-d', client_address: '+4000' });
    const listThreads = vi
      .fn()
      .mockResolvedValueOnce(page([a, b], 2))
      .mockResolvedValueOnce(page([c, d], null, 2))
      // The refresh: page 1 read first, then C is restamped to the top before the
      // page-2 read, which pushes B down into that page's window.
      .mockResolvedValueOnce(page([a, b], 2))
      .mockResolvedValueOnce(page([b, d], null, 2));
    const { queryClient } = renderList(listThreads);

    await user.click(await screen.findByRole('button', { name: 'Load more threads' }));
    expect(await screen.findByText('+4000')).toBeInTheDocument();

    await act(async () => {
      await queryClient.refetchQueries();
    });

    await waitFor(() => {
      expect(screen.queryByText('+3000')).toBeNull();
    });
    expect(screen.getAllByText('+2000')).toHaveLength(1);
    // Header row plus A, B and D — no row lost to a repeated key.
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('stops refreshing past its page cap rather than dropping the newest threads', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const listThreads = pagedThreads();
    renderList(listThreads);

    // Fill the window exactly: a refresh may re-read this much.
    for (let loaded = 1; loaded < THREADS_MAX_PAGES; loaded++) {
      await user.click(await screen.findByRole('button', { name: 'Load more threads' }));
      await waitFor(() => {
        expect(listThreads).toHaveBeenCalledTimes(loaded + 1);
      });
    }
    let before = listThreads.mock.calls.length;
    expect(before).toBe(THREADS_MAX_PAGES);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THREADS_REFRESH_MS + 10);
    });
    expect(listThreads.mock.calls.length - before).toBe(THREADS_MAX_PAGES);

    // One page further down, the list pauses instead of evicting page 1.
    await user.click(screen.getByRole('button', { name: 'Load more threads' }));
    expect(await screen.findByText(`+${String(THREADS_MAX_PAGES + 1)}`)).toBeInTheDocument();
    before = listThreads.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THREADS_REFRESH_MS * 3);
    });
    expect(listThreads.mock.calls.length).toBe(before);
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-threads-paused')).toHaveTextContent(
      `This list stops refreshing past ${String(THREADS_MAX_PAGES)} pages of threads.`,
    );

    // The pause is spoken by the region that has been mounted since the first
    // render — not by the notice, which appears with its words already in it.
    expect(screen.getByTestId('conversation-thread-list-announcer')).toHaveTextContent(
      `This list stops refreshing past ${String(THREADS_MAX_PAGES)} pages of threads.`,
    );

    // And the way back: the newest page alone, refreshing itself again.
    await user.click(screen.getByRole('button', { name: 'Back to the newest' }));
    await waitFor(() => {
      expect(screen.queryByText(`+${String(THREADS_MAX_PAGES + 1)}`)).toBeNull();
    });
    expect(screen.getByText('+1')).toBeInTheDocument();
    // That control took its own notice with it, so focus is handed to the pane's
    // heading rather than dropped on `<body>`, and the outcome is announced.
    expect(screen.getByRole('heading', { level: 2, name: 'chat' })).toHaveFocus();
    // The resume announcement is a state change committed the tick after the page
    // is dropped, so it is awaited, not read at the same instant the page leaves.
    await waitFor(() => {
      expect(screen.getByTestId('conversation-thread-list-announcer')).toHaveTextContent(
        'Back to the newest threads. 1 thread on screen, and the list is refreshing again.',
      );
    });
    before = listThreads.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THREADS_REFRESH_MS + 10);
    });
    expect(listThreads.mock.calls.length - before).toBe(1);
  });

  it('says it has stopped updating when a refresh fails under loaded rows', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const listThreads = vi
      .fn()
      .mockResolvedValueOnce(page([makeThread()]))
      .mockRejectedValueOnce(new ApiError('thread index unreachable', 500))
      .mockResolvedValue(page([makeThread({ last_delivery_status: 'failed' })]));
    renderList(listThreads);

    expect(await screen.findByTestId('conversation-threads-table')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THREADS_REFRESH_MS + 10);
    });

    const stale = await screen.findByTestId('conversation-stale-read');
    expect(stale).toHaveTextContent('Stopped updating: thread index unreachable');
    // The rows stay: a monitor is not blanked over one bad tick.
    expect(screen.getByTestId('conversation-threads-table')).toBeInTheDocument();

    await user.click(within(stale).getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-stale-read')).toBeNull();
    });
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });

  // The words are the same both times, and identical text twice in a row is one
  // change inside the region — so the recovery has to give the region back, or
  // the second failure is silent while its notice is on screen.
  it('says a failed refresh again when the list recovered in between', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const listThreads = vi
      .fn()
      .mockResolvedValueOnce(page([makeThread()]))
      .mockRejectedValueOnce(new ApiError('thread index unreachable', 500))
      .mockResolvedValueOnce(page([makeThread()]))
      .mockRejectedValue(new ApiError('thread index unreachable', 500));
    renderList(listThreads);

    expect(await screen.findByTestId('conversation-threads-table')).toBeInTheDocument();
    const announcer = screen.getByTestId('conversation-thread-list-announcer');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(THREADS_REFRESH_MS + 10);
    });
    const stale = await screen.findByTestId('conversation-stale-read');
    expect(announcer).toHaveTextContent('Stopped updating: thread index unreachable');

    await user.click(within(stale).getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-stale-read')).toBeNull();
    });
    expect(announcer).toBeEmptyDOMElement();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(THREADS_REFRESH_MS + 10);
    });
    expect(await screen.findByTestId('conversation-stale-read')).toBeInTheDocument();
    expect(announcer).toHaveTextContent('Stopped updating: thread index unreachable');
  });

  // Both notices cannot be spoken at once, and the pause is the state the pane
  // is actually in: a stale notice that has just gone never takes it back.
  it('leaves the pause notice standing when the reader pages past the cap under a failed refresh', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let failing = false;
    const listThreads = vi.fn((_route: string, pageNumber: number) =>
      failing
        ? Promise.reject(new ApiError('thread index unreachable', 500))
        : Promise.resolve(
            page(
              [
                makeThread({
                  thread_id: `t${String(pageNumber)}`,
                  client_address: `+${String(pageNumber)}`,
                }),
              ],
              pageNumber + 1,
              pageNumber,
            ),
          ),
    );
    renderList(listThreads);

    // Fill the refresh window exactly, then let the refresh of it fail.
    for (let loaded = 1; loaded < THREADS_MAX_PAGES; loaded++) {
      await user.click(await screen.findByRole('button', { name: 'Load more threads' }));
      await waitFor(() => {
        expect(listThreads).toHaveBeenCalledTimes(loaded + 1);
      });
    }
    failing = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THREADS_REFRESH_MS + 10);
    });
    expect(await screen.findByTestId('conversation-stale-read')).toBeInTheDocument();

    // One page further down: nothing is being read at all now, and that is what
    // the reader is told.
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Load more threads' }));

    expect(await screen.findByTestId('conversation-threads-paused')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-thread-list-announcer')).toHaveTextContent(
      `This list stops refreshing past ${String(THREADS_MAX_PAGES)} pages of threads.`,
    );
  });

  it('mounts its live region empty, before there is anything to say', async () => {
    renderList(vi.fn().mockResolvedValue(page([makeThread()])));

    const announcer = await screen.findByTestId('conversation-thread-list-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toBeEmptyDOMElement();
  });

  // The paging button is disabled while its page is in flight (the browser blurs
  // it) and then removed once there is no next page (it takes its focus with it).
  // Either way the reader must not be left on `<body>` beside a longer list.
  it('hands focus on and says what arrived when the paging control removes itself', async () => {
    const user = userEvent.setup();
    const older = makeThread({ thread_id: 'svc-chat/+15559999999', client_address: '+15559' });
    const listThreads = vi
      .fn()
      .mockResolvedValueOnce(page([makeThread()], 2))
      .mockResolvedValueOnce(page([older], null, 2));
    renderList(listThreads);

    await user.click(await screen.findByRole('button', { name: 'Load more threads' }));

    expect(await screen.findByText('+15559')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more threads' })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'chat' })).toHaveFocus();
    expect(screen.getByTestId('conversation-thread-list-announcer')).toHaveTextContent(
      'All threads loaded. 2 threads on screen.',
    );
  });

  it('returns focus to the paging control that survived its own page', async () => {
    const user = userEvent.setup();
    const listThreads = pagedThreads();
    renderList(listThreads);

    await user.click(await screen.findByRole('button', { name: 'Load more threads' }));

    await waitFor(() => {
      expect(screen.getByText('+2')).toBeInTheDocument();
    });
    const control = screen.getByRole('button', { name: 'Load more threads' });
    expect(control).toHaveFocus();
    expect(screen.getByTestId('conversation-thread-list-announcer')).toHaveTextContent(
      'More threads loaded. 2 threads on screen.',
    );
  });

  it('leaves focus where the reader put it while the page was in flight', async () => {
    const user = userEvent.setup();
    const listThreads = pagedThreads();
    renderList(listThreads);

    const control = await screen.findByRole('button', { name: 'Load more threads' });
    await user.click(control);
    const heading = screen.getByRole('heading', { level: 2, name: 'chat' });
    heading.focus();

    await waitFor(() => {
      expect(screen.getByText('+2')).toBeInTheDocument();
    });
    // Focus is only rescued off `<body>`; a place the reader chose is not ours.
    expect(heading).toHaveFocus();
  });

  it('speaks a failed refresh from the standing region, not from the notice', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const listThreads = vi
      .fn()
      .mockResolvedValueOnce(page([makeThread()]))
      .mockRejectedValue(new ApiError('thread index unreachable', 500));
    renderList(listThreads);

    expect(await screen.findByTestId('conversation-threads-table')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(THREADS_REFRESH_MS + 10);
    });

    const stale = await screen.findByTestId('conversation-stale-read');
    // The notice itself is plain markup: a live region inserted with its content
    // already in place is not reliably announced.
    expect(stale).not.toHaveAttribute('role');
    expect(screen.getByTestId('conversation-thread-list-announcer')).toHaveTextContent(
      'Stopped updating: thread index unreachable',
    );
  });

  it('keeps the loaded rows when a further page fails, and offers that page a retry', async () => {
    const user = userEvent.setup();
    const listThreads = vi
      .fn()
      .mockResolvedValueOnce(page([makeThread()], 2))
      .mockRejectedValueOnce(new ApiError('page gone', 500))
      .mockResolvedValueOnce(page([makeThread({ thread_id: 't2', client_address: '+15558' })]));
    renderList(listThreads);

    await user.click(await screen.findByRole('button', { name: 'Load more threads' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load more threads: page gone');
    expect(screen.getByTestId('conversation-threads-table')).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('+15558')).toBeInTheDocument();
  });
});
