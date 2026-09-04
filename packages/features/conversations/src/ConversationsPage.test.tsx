/**
 * The page as the shell mounts it: the three URL-driven drill levels, the moves
 * between them, the URL self-repair, and the WCAG 2.4.3 focus choreography that
 * makes those moves keyboard-usable.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tai42/api-client';

import { ConversationsPage } from './ConversationsPage';
import { THREADS_MAX_PAGES } from './ThreadList';
import {
  installViewportBand,
  makeConfig,
  makeMessage,
  makeRoute,
  makeThread,
  page,
  renderWithLiveUrl,
  renderWithProviders,
  transcriptPage,
} from './test-utils';

/** A client serving one route, one thread on it, and that thread's transcript. */
function fullClient() {
  return {
    listConversationRoutes: vi.fn().mockResolvedValue({ items: [makeRoute()], total: 1 }),
    listConversationThreads: vi.fn().mockResolvedValue(page([makeThread()])),
    readConversationTranscript: vi.fn().mockResolvedValue(transcriptPage([makeMessage()])),
    // Read on every thread selection by the mode control the detail pane grafts on.
    getConversationThreadMode: vi.fn().mockResolvedValue({ mode: 'agent', source: 'route' }),
  };
}

let restoreViewport: (() => void) | undefined;

afterEach(() => {
  restoreViewport?.();
  restoreViewport = undefined;
});

describe('drill levels', () => {
  it('level 1: a bare page is the route picker', async () => {
    renderWithProviders(<ConversationsPage search={{}} />, { client: fullClient() });

    expect(screen.getByRole('heading', { level: 1, name: 'Conversations' })).toBeInTheDocument();
    expect(await screen.findByTestId('conversation-routes-table')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open route chat' })).toBeInTheDocument();
  });

  it('level 2: ?route= is the route thread list with no transcript selected', async () => {
    renderWithProviders(<ConversationsPage search={{ route: 'chat' }} />, {
      client: fullClient(),
    });

    expect(await screen.findByTestId('conversation-threads-table')).toBeInTheDocument();
    expect(screen.getByText('No thread selected')).toBeInTheDocument();
    expect(screen.queryByTestId('conversation-transcript')).toBeNull();
  });

  it('level 3: ?route=&thread= opens the transcript beside the list', async () => {
    const client = fullClient();
    renderWithProviders(
      <ConversationsPage search={{ route: 'chat', thread: 'svc-chat/+15551234567' }} />,
      { client },
    );

    expect(await screen.findByTestId('conversation-transcript')).toBeInTheDocument();
    expect(client.readConversationTranscript).toHaveBeenCalledWith(
      {
        routeName: 'chat',
        threadId: 'svc-chat/+15551234567',
        page: 1,
        pageSize: 100,
        order: 'desc',
      },
      expect.anything(),
    );
    expect(screen.getByTestId('conversation-threads-table')).toBeInTheDocument();
  });
});

describe('drill navigation', () => {
  it('walks routes to threads to transcript and back out again', async () => {
    const user = userEvent.setup();
    renderWithLiveUrl((search) => <ConversationsPage search={search} />, {
      client: fullClient(),
      initialSearch: {},
    });

    await user.click(await screen.findByRole('link', { name: 'Open route chat' }));
    expect(await screen.findByTestId('conversation-threads-table')).toBeInTheDocument();

    await user.click(
      await screen.findByRole('link', { name: 'Open thread svc-chat/+15551234567' }),
    );
    expect(await screen.findByTestId('conversation-transcript')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to all routes' }));
    expect(await screen.findByTestId('conversation-routes-table')).toBeInTheDocument();
  });

  it('moves focus to the pane it opened, and back to the row it came from', async () => {
    const user = userEvent.setup();
    renderWithLiveUrl((search) => <ConversationsPage search={search} />, {
      client: fullClient(),
      initialSearch: {},
    });

    const routeRow = await screen.findByRole('link', { name: 'Open route chat' });
    await user.click(routeRow);
    // Into the threads pane: its heading takes focus, not `<body>`.
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'chat' })).toHaveFocus();
    });

    const threadRow = await screen.findByRole('link', {
      name: 'Open thread svc-chat/+15551234567',
    });
    await user.click(threadRow);
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: '+15551234567' })).toHaveFocus();
    });

    await user.click(screen.getByRole('link', { name: 'Back to all routes' }));
    // Out again: focus returns to the route row that opened the pane.
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Open route chat' })).toHaveFocus();
    });
  });

  it('returns focus to the thread row when the transcript is closed', async () => {
    restoreViewport = installViewportBand('compact');
    const user = userEvent.setup();
    renderWithLiveUrl((search) => <ConversationsPage search={search} />, {
      client: fullClient(),
      initialSearch: { route: 'chat' },
    });

    await user.click(
      await screen.findByRole('link', { name: 'Open thread svc-chat/+15551234567' }),
    );
    // Single pane: the detail pane grows its own Back link.
    await user.click(await screen.findByRole('link', { name: 'Back to the thread list' }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Open thread svc-chat/+15551234567' })).toHaveFocus();
    });
  });

  it('falls back to the list itself when the origin row is no longer listed', async () => {
    const user = userEvent.setup();
    renderWithLiveUrl((search) => <ConversationsPage search={search} />, {
      client: {
        // The route was deleted while its threads were open, so Back lands on a
        // picker with no row to return focus to.
        listConversationRoutes: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        listConversationThreads: vi.fn().mockResolvedValue(page([makeThread()])),
      },
      initialSearch: { route: 'chat' },
    });

    await user.click(await screen.findByRole('link', { name: 'Back to all routes' }));
    expect(await screen.findByText('No conversation routes')).toBeInTheDocument();
    // Never `<body>`: 2.4.3 wants a deliberate place, and the list is one.
    await waitFor(() => {
      expect(screen.getByTestId('conversation-routes-list')).toHaveFocus();
    });
  });

  it('falls back to the list while it is still a loading skeleton', async () => {
    const user = userEvent.setup();
    renderWithLiveUrl((search) => <ConversationsPage search={search} />, {
      client: {
        // The picker's query was collected during a long read, so Back re-mounts
        // it into its skeleton — there is no row yet, not even a missing one.
        listConversationRoutes: vi.fn().mockReturnValue(new Promise(() => undefined)),
        listConversationThreads: vi.fn().mockResolvedValue(page([makeThread()])),
      },
      initialSearch: { route: 'chat' },
    });

    await user.click(await screen.findByRole('link', { name: 'Back to all routes' }));

    await waitFor(() => {
      expect(screen.getByTestId('conversation-routes-list')).toHaveFocus();
    });
  });

  it('leaves focus alone on a deep link', async () => {
    renderWithLiveUrl((search) => <ConversationsPage search={search} />, {
      client: fullClient(),
      initialSearch: { route: 'chat', thread: 'svc-chat/+15551234567' },
    });

    expect(await screen.findByTestId('conversation-transcript')).toBeInTheDocument();
    expect(document.body).toHaveFocus();
  });

  it('shows no Back link inside the detail pane while both panes are on screen', async () => {
    renderWithProviders(
      <ConversationsPage search={{ route: 'chat', thread: 'svc-chat/+15551234567' }} />,
      { client: fullClient() },
    );

    expect(await screen.findByTestId('conversation-transcript')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Back to the thread list' })).toBeNull();
  });
});

// A route can change under an open pane without the picker: a deep link into a
// second route, or Back and Forward between two of them. The threads pane the
// shell keeps on screen is then showing a DIFFERENT list, and nothing the last
// route left behind may be spoken over it.
describe('a route change under the open pane', () => {
  /** One thread per page, per route, so any route can be paged arbitrarily deep. */
  function pagedThreads() {
    return vi.fn((route: string, pageNumber: number) =>
      Promise.resolve(
        page(
          [
            makeThread({
              thread_id: `${route}-t${String(pageNumber)}`,
              client_address: `+${String(pageNumber)}`,
            }),
          ],
          pageNumber + 1,
          pageNumber,
        ),
      ),
    );
  }

  it('does not announce the previous route as being back at its newest threads', async () => {
    const user = userEvent.setup();
    const listConversationThreads = pagedThreads();
    const { rerender } = renderWithProviders(<ConversationsPage search={{ route: 'chat' }} />, {
      client: { listConversationThreads },
    });

    // Past the refresh cap: this route's list is paused.
    for (let loaded = 1; loaded <= THREADS_MAX_PAGES; loaded++) {
      await user.click(await screen.findByRole('button', { name: 'Load more threads' }));
      await waitFor(() => {
        expect(listConversationThreads).toHaveBeenCalledTimes(loaded + 1);
      });
    }
    expect(await screen.findByTestId('conversation-threads-paused')).toBeInTheDocument();

    rerender(<ConversationsPage search={{ route: 'account' }} />);

    // The new route's list was never paused, so it is not resuming from anything.
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-threads-paused')).toBeNull();
    });
    expect(screen.getByTestId('conversation-thread-list-announcer')).toBeEmptyDOMElement();
  });

  it('does not announce a page the previous route was still loading', async () => {
    const user = userEvent.setup();
    const listConversationThreads = vi
      .fn()
      .mockResolvedValueOnce(page([makeThread()], 2))
      // The second page of `chat` never lands: the route changes under it.
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValue(page([makeThread({ thread_id: 'b1', client_address: '+15550001' })]));
    const { rerender } = renderWithProviders(<ConversationsPage search={{ route: 'chat' }} />, {
      client: { listConversationThreads },
    });

    await user.click(await screen.findByRole('button', { name: 'Load more threads' }));
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();

    rerender(<ConversationsPage search={{ route: 'account' }} />);

    expect(await screen.findByText('+15550001')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-thread-list-announcer')).toBeEmptyDOMElement();
  });
});

describe('URL self-repair', () => {
  it('drops a thread that names no route and re-navigates once', async () => {
    const client = fullClient();
    const { navigate } = renderWithProviders(<ConversationsPage search={{ thread: 't1' }} />, {
      client,
    });

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        'conversations',
        { route: undefined, thread: undefined },
        { replace: true },
      );
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    // The illegal state is never rendered: the page falls back to the picker.
    expect(await screen.findByTestId('conversation-routes-table')).toBeInTheDocument();
    expect(client.listConversationThreads).not.toHaveBeenCalled();
  });

  it('reads a blank ?route= as no route at all, without a raw error on screen', async () => {
    const client = fullClient();
    const { navigate } = renderWithProviders(
      <ConversationsPage search={{ route: '', thread: '' }} />,
      { client },
    );

    // The picker, not an ErrorState carrying a developer string about URL path
    // segments — a blank value names nothing, which is the same as naming none.
    expect(await screen.findByTestId('conversation-routes-table')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(client.listConversationThreads).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        'conversations',
        { route: undefined, thread: undefined },
        { replace: true },
      );
    });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('keeps a real route when only the thread is blank', async () => {
    const client = fullClient();
    const { navigate } = renderWithProviders(
      <ConversationsPage search={{ route: 'chat', thread: '   ' }} />,
      { client },
    );

    expect(await screen.findByTestId('conversation-threads-table')).toBeInTheDocument();
    expect(screen.getByText('No thread selected')).toBeInTheDocument();
    expect(client.readConversationTranscript).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(
        'conversations',
        { route: 'chat', thread: undefined },
        { replace: true },
      );
    });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('leaves a legal search alone', async () => {
    const { navigate } = renderWithProviders(<ConversationsPage search={{ route: 'chat' }} />, {
      client: fullClient(),
    });

    expect(await screen.findByTestId('conversation-threads-table')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  // The router does not commit the repair in the same tick, so the page keeps
  // re-rendering on the illegal search — and `sanitizeSearch` builds a fresh
  // object for each of those renders. An effect keyed on that object's IDENTITY
  // therefore fires per render, which is what multiplied the entries below.
  it('repairs once while the illegal search is still the one being rendered', async () => {
    const { navigate, rerender } = renderWithProviders(
      <ConversationsPage search={{ thread: 't1' }} />,
      { client: fullClient() },
    );

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledTimes(1);
    });
    rerender(<ConversationsPage search={{ thread: 't1' }} />);
    rerender(<ConversationsPage search={{ thread: 't1' }} />);

    expect(await screen.findByTestId('conversation-routes-table')).toBeInTheDocument();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  // A repair is not a move the reader made. Pushing it would leave the illegal URL
  // one Back away, where the page repairs and pushes again: a page Back cannot
  // leave. Replacing the entry keeps the history at the depth they arrived at.
  it('repairs without deepening history, so Back still leaves the page', async () => {
    const { history } = renderWithLiveUrl((search) => <ConversationsPage search={search} />, {
      client: fullClient(),
      initialSearch: { thread: 't1' },
    });

    expect(await screen.findByTestId('conversation-routes-table')).toBeInTheDocument();
    await waitFor(() => {
      expect(history.at(-1)).toEqual({ route: undefined, thread: undefined });
    });
    expect(history).toHaveLength(1);
  });

  // A drill IS a move the reader made, and Back must undo it.
  it('still pushes the moves the reader makes', async () => {
    const user = userEvent.setup();
    const { history } = renderWithLiveUrl((search) => <ConversationsPage search={search} />, {
      client: fullClient(),
      initialSearch: {},
    });

    await user.click(await screen.findByRole('link', { name: 'Open route chat' }));
    expect(await screen.findByTestId('conversation-threads-table')).toBeInTheDocument();
    expect(history).toHaveLength(2);
  });
});

describe('the OFF deployment', () => {
  it('renders the disabled-feature note, not an error, on a 501', async () => {
    const client = {
      listConversationRoutes: vi
        .fn()
        .mockRejectedValue(
          new ApiError('conversation routes require the redis conversations backend', 501),
        ),
    };
    renderWithProviders(<ConversationsPage search={{}} />, { client });

    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
    expect(
      screen.getByText('conversation routes require the redis conversations backend'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the admin-cluster tabs', () => {
  /** A landing client serving the route picker plus the two admin surfaces. */
  function landingClient() {
    return {
      listConversationRoutes: vi.fn().mockResolvedValue({ items: [makeRoute()], total: 1 }),
      listConversationConfigs: vi.fn().mockResolvedValue({ items: [makeConfig()], total: 1 }),
      listFailedConversationMessages: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
  }

  it('opens on the route picker, with the other doors unread until their tab', async () => {
    const client = landingClient();
    renderWithProviders(<ConversationsPage search={{}} />, { client });

    expect(await screen.findByTestId('conversation-routes-table')).toBeInTheDocument();
    // Only the open tab reads its door — the config and failed listings stay unread.
    expect(client.listConversationConfigs).not.toHaveBeenCalled();
    expect(client.listFailedConversationMessages).not.toHaveBeenCalled();
  });

  it('mounts the per-target config surface when its tab is chosen', async () => {
    const user = userEvent.setup();
    const client = landingClient();
    renderWithProviders(<ConversationsPage search={{}} />, { client });

    await user.click(await screen.findByRole('tab', { name: 'Per-target configs' }));
    expect(await screen.findByTestId('conversation-configs-table')).toBeInTheDocument();
    await waitFor(() => {
      expect(client.listConversationConfigs).toHaveBeenCalled();
    });
  });

  it('mounts the failed-delivery view when its tab is chosen', async () => {
    const user = userEvent.setup();
    const client = landingClient();
    renderWithProviders(<ConversationsPage search={{}} />, { client });

    await user.click(await screen.findByRole('tab', { name: 'Failed deliveries' }));
    expect(await screen.findByText('No failed deliveries')).toBeInTheDocument();
    await waitFor(() => {
      expect(client.listFailedConversationMessages).toHaveBeenCalled();
    });
  });
});
