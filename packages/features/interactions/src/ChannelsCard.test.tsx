import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '@tai42/api-client';

import { ChannelsCard } from './ChannelsCard';
import { makeChannel, renderWithProviders, stubClient } from './test-utils';

/** Render the card wired to a stub whose `listChannels` resolves/rejects as given. */
function renderCard(listChannels: ApiClient['listChannels']): void {
  const client = stubClient({ channel: makeChannel(), listChannels });
  renderWithProviders(<ChannelsCard />, { client });
}

describe('ChannelsCard', () => {
  it('renders a badge per installed channel', async () => {
    renderCard(vi.fn().mockResolvedValue({ channels: ['telegram', 'slack'] }));

    const list = await screen.findByTestId('channels-list');
    expect(within(list).getByText('telegram')).toBeInTheDocument();
    expect(within(list).getByText('slack')).toBeInTheDocument();
  });

  it('shows the "no delivery channels installed" line on an empty catalog', async () => {
    renderCard(vi.fn().mockResolvedValue({ channels: [] }));

    expect(await screen.findByText(/No delivery channels installed/)).toBeInTheDocument();
    expect(screen.queryByTestId('channels-list')).not.toBeInTheDocument();
  });

  it('surfaces a loud ErrorState when the catalog request rejects (never a blank card)', async () => {
    renderCard(vi.fn().mockRejectedValue(new Error('channels fetch failed')));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('channels fetch failed')).toBeInTheDocument();
  });
});
