/**
 * The route-wide message search: it reads the search door with the needle, renders
 * each hit with a link into its thread, surfaces a LOUD partial-set notice when the
 * result set is capped, and shows the empty copy when nothing matches.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

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
});
