import type { ApiClient } from '@tai42/api-client';
import { channelsListKey } from '@tai42/studio-sdk';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChannelsCard } from './ChannelsCard';
import { makeChannel, renderWithProviders, stubClient } from './test-utils';

/** Render the card wired to a stub whose `listChannels` resolves/rejects as given. */
function renderCard(listChannels: ApiClient['listChannels']): void {
  const client = stubClient({ channel: makeChannel(), listChannels });
  renderWithProviders(<ChannelsCard />, { client });
}

describe('ChannelsCard', () => {
  it('renders a badge per installed channel', async () => {
    renderCard(
      vi.fn().mockResolvedValue({
        channels: [
          { name: 'telegram', identity_hint: null },
          { name: 'slack', identity_hint: null },
        ],
      }),
    );

    const list = await screen.findByTestId('channels-list');
    expect(within(list).getByText('telegram')).toBeInTheDocument();
    expect(within(list).getByText('slack')).toBeInTheDocument();
  });

  it('renders the entries another screen already read under the shared channel-list key', () => {
    const client = stubClient({
      channel: makeChannel(),
      listChannels: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    renderWithProviders(<ChannelsCard />, {
      client,
      seed: (queryClient) => {
        queryClient.setQueryData(channelsListKey, {
          channels: [{ name: 'signal', identity_hint: 'The account phone number.' }],
        });
      },
    });

    expect(within(screen.getByTestId('channels-list')).getByText('signal')).toBeInTheDocument();
  });

  it('shows the "no delivery channels installed" line on an empty catalog', async () => {
    renderCard(vi.fn().mockResolvedValue({ channels: [] }));

    expect(await screen.findByText(/No delivery channels installed/)).toBeInTheDocument();
    expect(screen.queryByTestId('channels-list')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse marketplace' })).toBeInTheDocument();
  });

  it('surfaces a loud ErrorState when the catalog request rejects (never a blank card)', async () => {
    renderCard(vi.fn().mockRejectedValue(new Error('channels fetch failed')));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('channels fetch failed')).toBeInTheDocument();
  });
});
