/**
 * The route-wide message search: it reads the search door with the needle, renders
 * each hit with a link into its thread, surfaces a LOUD partial-set notice when the
 * result set is capped, shows the empty copy when nothing matches, retries a failed
 * read, and pages forward through the matches without blanking the hits on screen
 * even when a further page fails.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tai42/api-client';

import { MessageSearch } from './MessageSearch';
import { makeMessage, page, renderWithProviders } from './test-utils';

function renderSearch(searchConversationMessages: unknown, q = 'widget') {
  return renderWithProviders(<MessageSearch route="chat" q={q} />, {
    client: { searchConversationMessages } as never,
  });
}

describe('MessageSearch', () => {
  it('reads the search door with the needle + paging window', async () => {
    const search = vi
      .fn()
      .mockResolvedValue(page([makeMessage({ inbound_text: 'widget please' })]));
    renderSearch(search);

    await screen.findByTestId('conversation-message-search');
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ routeName: 'chat', q: 'widget', page: 1 }),
      expect.anything(),
    );
  });

  it('links each hit into the thread it belongs to', async () => {
    renderSearch(vi.fn().mockResolvedValue(page([makeMessage()])));
    const link = await screen.findByRole('link', { name: 'Open thread svc-chat/+15551234567' });
    expect(link).toBeInTheDocument();
  });

  it('shows the empty copy when nothing matches', async () => {
    renderSearch(vi.fn().mockResolvedValue(page([])));
    expect(await screen.findByText('No matching messages')).toBeInTheDocument();
  });

  it('surfaces a LOUD partial-set notice when the result set is capped', async () => {
    renderSearch(vi.fn().mockResolvedValue(page([makeMessage()], null, 1, true)));
    expect(await screen.findByTestId('conversation-truncated')).toHaveTextContent(
      'Showing a partial set',
    );
  });

  it('retries the initial read after a failure', async () => {
    const user = userEvent.setup();
    const search = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('search reader exploded', 500))
      .mockResolvedValue(page([makeMessage({ inbound_text: 'widget please' })]));
    renderSearch(search);

    expect(await screen.findByRole('alert')).toHaveTextContent('search reader exploded');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('conversation-message-search')).toBeInTheDocument();
  });

  it('pages forward through the matches', async () => {
    const user = userEvent.setup();
    const first = makeMessage({ message_id: 'm1', client_address: '+1000' });
    const second = makeMessage({
      message_id: 'm2',
      thread_id: 'svc-chat/+15559999999',
      client_address: '+2000',
    });
    const search = vi
      .fn()
      .mockResolvedValueOnce(page([first], 2))
      .mockResolvedValueOnce(page([second], null, 2));
    renderSearch(search);

    await user.click(await screen.findByRole('button', { name: 'Load more matches' }));

    expect(
      await screen.findByRole('link', { name: `Open thread ${second.thread_id}` }),
    ).toBeInTheDocument();
    expect(search).toHaveBeenLastCalledWith(
      expect.objectContaining({ routeName: 'chat', q: 'widget', page: 2 }),
      expect.anything(),
    );
    expect(screen.queryByRole('button', { name: 'Load more matches' })).toBeNull();
  });

  it('keeps the hits on screen when a further page fails, and offers that page a retry', async () => {
    const user = userEvent.setup();
    const first = makeMessage({ message_id: 'm1', client_address: '+1000' });
    const second = makeMessage({
      message_id: 'm2',
      thread_id: 'svc-chat/+15559999999',
      client_address: '+2000',
    });
    const search = vi
      .fn()
      .mockResolvedValueOnce(page([first], 2))
      .mockRejectedValueOnce(new ApiError('page gone', 500))
      .mockResolvedValueOnce(page([second], null, 2));
    renderSearch(search);

    await user.click(await screen.findByRole('button', { name: 'Load more matches' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load more matches: page gone');
    expect(screen.getByTestId('conversation-message-search')).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(
      await screen.findByRole('link', { name: `Open thread ${second.thread_id}` }),
    ).toBeInTheDocument();
  });
});
