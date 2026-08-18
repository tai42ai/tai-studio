/**
 * The transcript: what a reader sees when a long thread opens, the live tail that
 * follows it, the bound on how many requests one tail tick may fire, backwards
 * paging into history, what the tail does at the bottom of that window, and the
 * states a thread read can land in (gone, empty, broken, no longer updating).
 */
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tai42/api-client';

import {
  TAIL_INTERVAL_MS,
  TRANSCRIPT_MAX_PAGES,
  TRANSCRIPT_PAGE_SIZE,
  Transcript,
} from './Transcript';
import { makeMessage, renderWithProviders, transcriptPage } from './test-utils';

function renderTranscript(readConversationTranscript: unknown, q?: string) {
  return renderWithProviders(
    <Transcript
      route="chat"
      threadId="svc-chat/+15551234567"
      q={q}
      headingRef={createRef<HTMLHeadingElement>()}
    />,
    { client: { readConversationTranscript } as never },
  );
}

/** The exchange texts on screen, top to bottom. */
function shownTexts(): string[] {
  return screen.getAllByTestId('conversation-exchange').map((exchange) => exchange.textContent);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** One exchange per page, so a thread can be paged arbitrarily far back. */
function pagedTranscript() {
  return vi.fn(({ page }: { page: number }) =>
    Promise.resolve(
      transcriptPage(
        [makeMessage({ message_id: `m${String(page)}`, inbound_text: `page ${String(page)}` })],
        { nextPage: page + 1, pageNumber: page },
      ),
    ),
  );
}

describe('Transcript', () => {
  it('shows a skeleton under the thread id while the first page loads', () => {
    renderTranscript(vi.fn().mockReturnValue(new Promise(() => undefined)));

    expect(
      screen.getByRole('heading', { level: 2, name: 'svc-chat/+15551234567' }),
    ).toBeInTheDocument();
    expect(document.querySelector('.tai-skeleton')).not.toBeNull();
  });

  it('reads the door newest-first and asks for page 1', async () => {
    const read = vi.fn().mockResolvedValue(transcriptPage([makeMessage()]));
    renderTranscript(read);

    await screen.findByTestId('conversation-transcript');
    expect(read).toHaveBeenCalledWith(
      {
        routeName: 'chat',
        threadId: 'svc-chat/+15551234567',
        page: 1,
        pageSize: TRANSCRIPT_PAGE_SIZE,
        order: 'desc',
      },
      expect.anything(),
    );
  });

  it('opens a multi-page thread on its NEWEST exchanges, in reading order', async () => {
    // Page 1 of a `desc` read is the latest page, newest record first.
    const read = vi
      .fn()
      .mockResolvedValue(
        transcriptPage(
          [
            makeMessage({ message_id: 'm9', inbound_text: 'newest' }),
            makeMessage({ message_id: 'm8', inbound_text: 'before that' }),
          ],
          { nextPage: 2 },
        ),
      );
    renderTranscript(read);

    const transcript = await screen.findByTestId('conversation-transcript');
    const exchanges = within(transcript).getAllByTestId('conversation-exchange');
    // Reversed for display: the newest sits at the FOOT, where a reader tails it.
    expect(exchanges[0]).toHaveTextContent('before that');
    expect(exchanges[1]).toHaveTextContent('newest');
    // The beginning of the conversation is NOT what the pane opened on.
    expect(read).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 2, name: '+15551234567' })).toBeInTheDocument();
  });

  it('tails the thread: a new exchange arrives at the foot with no interaction', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const read = vi
      .fn()
      .mockResolvedValueOnce(
        transcriptPage([makeMessage({ message_id: 'm1', inbound_text: 'first' })], { nextPage: 2 }),
      )
      .mockResolvedValue(
        transcriptPage(
          [
            makeMessage({ message_id: 'm2', inbound_text: 'and then this' }),
            makeMessage({ message_id: 'm1', inbound_text: 'first' }),
          ],
          { nextPage: 2 },
        ),
      );
    renderTranscript(read);

    await waitFor(() => {
      expect(screen.getByText('first')).toBeInTheDocument();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TAIL_INTERVAL_MS + 10);
    });
    await waitFor(() => {
      expect(screen.getByText('and then this')).toBeInTheDocument();
    });
    expect(shownTexts().at(-1)).toContain('and then this');
  });

  it('loads older exchanges on demand, above the ones already read', async () => {
    const user = userEvent.setup();
    const read = vi
      .fn()
      .mockResolvedValueOnce(
        transcriptPage([makeMessage({ message_id: 'm9', inbound_text: 'newest' })], {
          nextPage: 2,
        }),
      )
      .mockResolvedValueOnce(
        transcriptPage([makeMessage({ message_id: 'm1', inbound_text: 'the opening line' })], {
          pageNumber: 2,
        }),
      );
    renderTranscript(read);

    await user.click(await screen.findByRole('button', { name: 'Load older messages' }));

    expect(await screen.findByText('the opening line')).toBeInTheDocument();
    expect(read).toHaveBeenLastCalledWith(
      {
        routeName: 'chat',
        threadId: 'svc-chat/+15551234567',
        page: 2,
        pageSize: TRANSCRIPT_PAGE_SIZE,
        order: 'desc',
      },
      expect.anything(),
    );
    // History goes ABOVE: the newest exchange stays at the foot.
    expect(shownTexts()[0]).toContain('the opening line');
    expect(shownTexts().at(-1)).toContain('newest');
    expect(screen.queryByRole('button', { name: 'Load older messages' })).toBeNull();
  });

  // A tail tick re-reads the retained window, so what bounds the tick is how many
  // pages that window may hold — and past it the tail PAUSES, because the page a
  // cap would drop is page 1, the only page a tail can be read from.
  it('never fires more requests per tick than the page cap, and pauses rather than lose the tail', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const read = pagedTranscript();
    renderTranscript(read);

    // Fill the window exactly.
    for (let loaded = 1; loaded < TRANSCRIPT_MAX_PAGES; loaded++) {
      fireEvent.click(await screen.findByRole('button', { name: 'Load older messages' }));
      await waitFor(() => {
        expect(read).toHaveBeenCalledTimes(loaded + 1);
      });
    }
    let before = read.mock.calls.length;
    expect(before).toBe(TRANSCRIPT_MAX_PAGES);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TAIL_INTERVAL_MS + 10);
    });
    expect(read.mock.calls.length - before).toBe(TRANSCRIPT_MAX_PAGES);

    // One page further back: the tail stops, and page 1 is still on screen.
    fireEvent.click(screen.getByRole('button', { name: 'Load older messages' }));
    expect(await screen.findByText(`page ${String(TRANSCRIPT_MAX_PAGES + 1)}`)).toBeInTheDocument();
    before = read.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TAIL_INTERVAL_MS * 3);
    });
    expect(read.mock.calls.length).toBe(before);
    expect(screen.getByText('page 1')).toBeInTheDocument();
    expect(screen.queryByText('New messages appear here on their own.')).toBeNull();
    expect(screen.getByTestId('conversation-transcript-paused')).toHaveTextContent(
      `New messages stop arriving past ${String(TRANSCRIPT_MAX_PAGES)} pages of history.`,
    );
    // Spoken by the region mounted since the first render, not by the notice —
    // which appears with its words already in it and so announces nothing.
    expect(screen.getByTestId('conversation-transcript-announcer')).toHaveTextContent(
      `New messages stop arriving past ${String(TRANSCRIPT_MAX_PAGES)} pages of history.`,
    );
  });

  it('jumps back to the latest page, and tails again from there', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const read = pagedTranscript();
    renderTranscript(read);

    for (let loaded = 1; loaded <= TRANSCRIPT_MAX_PAGES; loaded++) {
      fireEvent.click(await screen.findByRole('button', { name: 'Load older messages' }));
      await waitFor(() => {
        expect(read).toHaveBeenCalledTimes(loaded + 1);
      });
    }

    const jump = await screen.findByRole('button', { name: 'Jump to latest' });
    jump.focus();
    fireEvent.click(jump);

    await waitFor(() => {
      expect(screen.queryByText(`page ${String(TRANSCRIPT_MAX_PAGES + 1)}`)).toBeNull();
    });
    expect(screen.getByText('page 1')).toBeInTheDocument();
    expect(screen.getByText('New messages appear here on their own.')).toBeInTheDocument();
    // That control took its own notice with it, so focus is handed to the pane's
    // heading rather than dropped on `<body>`, and the outcome is announced.
    expect(screen.getByRole('heading', { level: 2, name: '+15551234567' })).toHaveFocus();
    // The resume announcement is a state change committed the tick after the page
    // is dropped, so it is awaited, not read at the same instant the page leaves.
    await waitFor(() => {
      expect(screen.getByTestId('conversation-transcript-announcer')).toHaveTextContent(
        'Back at the newest page. 1 exchange on screen, and new messages arrive again.',
      );
    });

    const before = read.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TAIL_INTERVAL_MS + 10);
    });
    expect(read.mock.calls.length - before).toBe(1);
  });

  // A tick re-reads the retained pages one after another, so an exchange landing
  // between two of those reads shifts the page boundary under them and is
  // returned by both.
  it('shows an exchange once when a tail tick catches it on two pages', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const newest = makeMessage({ message_id: 'm9', inbound_text: 'newest' });
    const read = vi
      .fn()
      .mockResolvedValueOnce(transcriptPage([newest], { nextPage: 2 }))
      .mockResolvedValueOnce(
        transcriptPage([makeMessage({ message_id: 'm8', inbound_text: 'older' })], {
          pageNumber: 2,
        }),
      )
      // The tick: page 1 read first, then a new exchange lands and pushes m9 into
      // the page-2 window before that page is read.
      .mockResolvedValueOnce(transcriptPage([newest], { nextPage: 2 }))
      .mockResolvedValueOnce(transcriptPage([newest], { pageNumber: 2 }));
    const { queryClient } = renderTranscript(read);

    fireEvent.click(await screen.findByRole('button', { name: 'Load older messages' }));
    expect(await screen.findByText('older')).toBeInTheDocument();

    await act(async () => {
      await queryClient.refetchQueries();
    });

    await waitFor(() => {
      expect(screen.queryByText('older')).toBeNull();
    });
    expect(screen.getAllByText('newest')).toHaveLength(1);
    expect(screen.getAllByTestId('conversation-exchange')).toHaveLength(1);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('says it has stopped updating when a tick fails under a loaded transcript', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const read = vi
      .fn()
      .mockResolvedValueOnce(transcriptPage([makeMessage({ inbound_text: 'newest' })]))
      .mockRejectedValue(new ApiError('conversation thread not found', 404));
    renderTranscript(read);

    expect(await screen.findByText('newest')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TAIL_INTERVAL_MS + 10);
    });

    const stale = await screen.findByTestId('conversation-stale-read');
    expect(stale).toHaveTextContent(
      'Stopped updating: this read is no longer available. These are the last records read.',
    );
    // Retention cannot be retried away, so that state offers no retry.
    expect(within(stale).queryByRole('button')).toBeNull();
    expect(screen.getByText('newest')).toBeInTheDocument();
    expect(screen.queryByText('New messages appear here on their own.')).toBeNull();
  });

  it('offers a retry when the tick fails on something a retry could fix', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const read = vi
      .fn()
      .mockResolvedValueOnce(transcriptPage([makeMessage({ inbound_text: 'newest' })]))
      .mockRejectedValueOnce(new ApiError('reader exploded', 500))
      .mockResolvedValue(
        transcriptPage([makeMessage({ message_id: 'm2', inbound_text: 'recovered' })]),
      );
    renderTranscript(read);

    expect(await screen.findByText('newest')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TAIL_INTERVAL_MS + 10);
    });

    const stale = await screen.findByTestId('conversation-stale-read');
    expect(stale).toHaveTextContent('Stopped updating: reader exploded');
    fireEvent.click(within(stale).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByText('recovered')).toBeInTheDocument();
    expect(screen.queryByTestId('conversation-stale-read')).toBeNull();
  });

  // The words are the same both times, and identical text twice in a row is one
  // change inside the region — so the recovery has to give the region back, or
  // the second failure is silent while its notice is on screen.
  it('says a failed tick again when the tail recovered in between', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const read = vi
      .fn()
      .mockResolvedValueOnce(transcriptPage([makeMessage({ inbound_text: 'newest' })]))
      .mockRejectedValueOnce(new ApiError('reader exploded', 500))
      .mockResolvedValueOnce(transcriptPage([makeMessage({ inbound_text: 'newest' })]))
      .mockRejectedValue(new ApiError('reader exploded', 500));
    renderTranscript(read);

    expect(await screen.findByText('newest')).toBeInTheDocument();
    const announcer = screen.getByTestId('conversation-transcript-announcer');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TAIL_INTERVAL_MS + 10);
    });
    const stale = await screen.findByTestId('conversation-stale-read');
    expect(announcer).toHaveTextContent('Stopped updating: reader exploded');

    fireEvent.click(within(stale).getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.queryByTestId('conversation-stale-read')).toBeNull();
    });
    expect(announcer).toBeEmptyDOMElement();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TAIL_INTERVAL_MS + 10);
    });
    expect(await screen.findByTestId('conversation-stale-read')).toBeInTheDocument();
    expect(announcer).toHaveTextContent('Stopped updating: reader exploded');
  });

  it('disables the paging control while the older page is in flight', async () => {
    const user = userEvent.setup();
    let releaseOlderPage: (() => void) | undefined;
    const read = vi
      .fn()
      .mockResolvedValueOnce(
        transcriptPage([makeMessage({ inbound_text: 'newest' })], { nextPage: 2 }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          releaseOlderPage = () => {
            resolve(
              transcriptPage([makeMessage({ message_id: 'm2', inbound_text: 'older' })], {
                pageNumber: 2,
              }),
            );
          };
        }),
      );
    renderTranscript(read);

    await user.click(await screen.findByRole('button', { name: 'Load older messages' }));
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();

    releaseOlderPage?.();
    expect(await screen.findByText('older')).toBeInTheDocument();
  });

  it('retries the initial page after a failure', async () => {
    const user = userEvent.setup();
    const read = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('reader exploded', 500))
      .mockResolvedValue(transcriptPage([makeMessage()]));
    renderTranscript(read);

    expect(await screen.findByRole('alert')).toHaveTextContent('reader exploded');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('conversation-transcript')).toBeInTheDocument();
  });

  it('keeps the loaded exchanges when an older page fails', async () => {
    const user = userEvent.setup();
    const read = vi
      .fn()
      .mockResolvedValueOnce(
        transcriptPage([makeMessage({ inbound_text: 'newest' })], { nextPage: 2 }),
      )
      .mockRejectedValueOnce(new ApiError('page gone', 500))
      .mockResolvedValueOnce(
        transcriptPage([makeMessage({ message_id: 'm9', inbound_text: 'recovered' })], {
          pageNumber: 2,
        }),
      );
    renderTranscript(read);

    await user.click(await screen.findByRole('button', { name: 'Load older messages' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load older messages: page gone');
    expect(screen.getByText('newest')).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('recovered')).toBeInTheDocument();
  });

  it('explains an indexed thread that holds nothing readable', async () => {
    renderTranscript(vi.fn().mockResolvedValue(transcriptPage([])));
    expect(await screen.findByText('Nothing in this thread')).toBeInTheDocument();
  });

  it('reads the door\'s single 404 as "not yours, or not there", with no retry', async () => {
    renderTranscript(vi.fn().mockRejectedValue(new ApiError('conversation thread not found', 404)));

    expect(await screen.findByText('No longer available')).toBeInTheDocument();
    expect(
      screen.getByText(
        "This thread is not available to you, or is no longer in the route's index — retention may have expired it.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  // The access gate refuses every conversations door to a session without the
  // grant, this one included, so its 403 is the same capability boundary the
  // thread list reads — and never the gate's own words in a red error.
  it('reads a 403 as the capability boundary the access gate makes it', async () => {
    renderTranscript(
      vi.fn().mockRejectedValue(new ApiError('conversations access is not granted', 403)),
    );

    expect(await screen.findByText('Not available to this session')).toBeInTheDocument();
    expect(
      screen.getByText(
        "Reading conversation transcripts needs authority over this deployment's conversations.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('conversations access is not granted')).toBeNull();
  });

  it('raises a real failure loudly', async () => {
    renderTranscript(vi.fn().mockRejectedValue(new ApiError('reader exploded', 500)));
    expect(await screen.findByRole('alert')).toHaveTextContent('reader exploded');
  });

  it('mounts its live region empty, before there is anything to say', async () => {
    renderTranscript(vi.fn().mockResolvedValue(transcriptPage([makeMessage()])));

    const announcer = await screen.findByTestId('conversation-transcript-announcer');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toBeEmptyDOMElement();
  });

  // The paging button is disabled while its page is in flight (the browser blurs
  // it) and then removed once there is nothing older (it takes its focus with it).
  // Either way the reader must not be left on `<body>` beside a longer transcript.
  it('hands focus on and says what arrived when the paging control removes itself', async () => {
    const user = userEvent.setup();
    const read = vi
      .fn()
      .mockResolvedValueOnce(
        transcriptPage([makeMessage({ message_id: 'm9', inbound_text: 'newest' })], {
          nextPage: 2,
        }),
      )
      .mockResolvedValueOnce(
        transcriptPage([makeMessage({ message_id: 'm1', inbound_text: 'the opening line' })], {
          pageNumber: 2,
        }),
      );
    renderTranscript(read);

    await user.click(await screen.findByRole('button', { name: 'Load older messages' }));

    expect(await screen.findByText('the opening line')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load older messages' })).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: '+15551234567' })).toHaveFocus();
    expect(screen.getByTestId('conversation-transcript-announcer')).toHaveTextContent(
      'The whole thread is loaded. 2 exchanges on screen.',
    );
  });

  it('returns focus to the paging control that survived its own page', async () => {
    const user = userEvent.setup();
    renderTranscript(pagedTranscript());

    await user.click(await screen.findByRole('button', { name: 'Load older messages' }));

    await waitFor(() => {
      expect(screen.getByText('page 2')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Load older messages' })).toHaveFocus();
    expect(screen.getByTestId('conversation-transcript-announcer')).toHaveTextContent(
      'Older messages loaded above. 2 exchanges on screen.',
    );
  });

  it('speaks a failed tick from the standing region, not from the notice', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const read = vi
      .fn()
      .mockResolvedValueOnce(transcriptPage([makeMessage({ inbound_text: 'newest' })]))
      .mockRejectedValue(new ApiError('reader exploded', 500));
    renderTranscript(read);

    expect(await screen.findByText('newest')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TAIL_INTERVAL_MS + 10);
    });

    const stale = await screen.findByTestId('conversation-stale-read');
    // The notice itself is plain markup: a live region inserted with its content
    // already in place is not reliably announced.
    expect(stale).not.toHaveAttribute('role');
    expect(screen.getByTestId('conversation-transcript-announcer')).toHaveTextContent(
      'Stopped updating: reader exploded',
    );
  });
});

describe('Transcript — text filter', () => {
  it('forwards the q filter to the transcript read', async () => {
    const read = vi.fn().mockResolvedValue(transcriptPage([makeMessage()]));
    renderTranscript(read, 'widget');

    await screen.findByTestId('conversation-transcript');
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'widget', order: 'desc' }),
      expect.anything(),
    );
  });

  it('shows the filtered empty copy when nothing matches the needle', async () => {
    renderTranscript(vi.fn().mockResolvedValue(transcriptPage([])), 'widget');
    expect(await screen.findByText('No matching messages')).toBeInTheDocument();
  });

  it('surfaces a LOUD partial-set notice when the page is truncated', async () => {
    renderTranscript(
      vi.fn().mockResolvedValue(transcriptPage([makeMessage()], { truncated: true })),
      'widget',
    );
    expect(await screen.findByTestId('conversation-truncated')).toHaveTextContent(
      'Showing a partial set',
    );
  });
});
