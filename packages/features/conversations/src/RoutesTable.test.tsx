/**
 * The route picker's state machine — loading, the loud failure, the empty
 * catalogue, and the rows themselves, including the api-door row that carries no
 * channel identity.
 */
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@tai42/api-client';

import { RoutesTable } from './RoutesTable';
import { makeRoute, renderWithProviders } from './test-utils';

function renderTable(listConversationRoutes: unknown) {
  return renderWithProviders(<RoutesTable listRef={createRef<HTMLDivElement>()} />, {
    client: { listConversationRoutes } as never,
  });
}

describe('RoutesTable', () => {
  it('shows a skeleton while the catalogue loads', () => {
    renderTable(vi.fn().mockReturnValue(new Promise(() => undefined)));
    expect(document.querySelector('.tai-skeleton')).not.toBeNull();
  });

  it('renders a channel row: its medium, the identity it is reached at, and its target', async () => {
    renderTable(vi.fn().mockResolvedValue({ items: [makeRoute()], total: 1 }));

    const table = await screen.findByTestId('conversation-routes-table');
    expect(within(table).getByText('whatsapp')).toBeInTheDocument();
    expect(within(table).getByText('+15550000000')).toBeInTheDocument();
    expect(within(table).getByText('agent: concierge')).toBeInTheDocument();
  });

  it('renders an api-door row with a placeholder where it has no identity', async () => {
    renderTable(
      vi.fn().mockResolvedValue({
        items: [
          makeRoute({
            route_name: 'billing',
            door: 'api',
            channel: null,
            our_identity: null,
            callback_url: 'https://sink.example/answers',
            target_kind: 'tool',
            target_name: 'lookup_invoice',
          }),
        ],
        total: 1,
      }),
    );

    const table = await screen.findByTestId('conversation-routes-table');
    expect(within(table).getByText('api')).toBeInTheDocument();
    expect(within(table).getByText('—')).toBeInTheDocument();
    expect(within(table).getByText('tool: lookup_invoice')).toBeInTheDocument();
  });

  it('explains an empty catalogue rather than showing a bare table', async () => {
    renderTable(vi.fn().mockResolvedValue({ items: [], total: 0 }));
    expect(await screen.findByText('No conversation routes')).toBeInTheDocument();
  });

  it('raises a real failure loudly and offers a retry', async () => {
    const user = userEvent.setup();
    const listRoutes = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('backend exploded', 500))
      .mockResolvedValue({ items: [makeRoute()], total: 1 });
    renderTable(listRoutes);

    expect(await screen.findByRole('alert')).toHaveTextContent('backend exploded');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByTestId('conversation-routes-table')).toBeInTheDocument();
  });

  it('reads a 403 as a capability boundary, not a failure', async () => {
    renderTable(vi.fn().mockRejectedValue(new ApiError('forbidden', 403)));

    expect(await screen.findByText('Not available to this session')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reads a 404 as gone, with no retry to offer', async () => {
    renderTable(vi.fn().mockRejectedValue(new ApiError('not found', 404)));

    expect(await screen.findByText('No longer available')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('treats a non-ApiError rejection as a plain loud failure', async () => {
    renderTable(vi.fn().mockRejectedValue(new Error('network down')));
    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
  });
});
