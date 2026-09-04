/**
 * The route picker's state machine — loading, the loud failure, the empty
 * catalogue, and the rows themselves, including the api-door row that carries no
 * channel identity.
 */
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
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
    expect(within(table).getByText('agent: assistant')).toBeInTheDocument();
  });

  it('renders an api-door row with a placeholder where it has no identity', async () => {
    renderTable(
      vi.fn().mockResolvedValue({
        items: [
          makeRoute({
            route_name: 'account',
            door: 'api',
            channel: null,
            our_identity: null,
            callback_url: 'https://sink.example/answers',
            target_kind: 'tool',
            target_name: 'lookup_account',
          }),
        ],
        total: 1,
      }),
    );

    const table = await screen.findByTestId('conversation-routes-table');
    expect(within(table).getByText('api')).toBeInTheDocument();
    expect(within(table).getByText('—')).toBeInTheDocument();
    expect(within(table).getByText('tool: lookup_account')).toBeInTheDocument();
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

describe('RoutesTable — CRUD', () => {
  it('opens the blank create dialog from the Create route button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoutesTable listRef={createRef<HTMLDivElement>()} />, {
      client: { listConversationRoutes: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
    });

    await user.click(screen.getByRole('button', { name: 'Create route' }));
    expect(await screen.findByRole('textbox', { name: 'Route name' })).toBeInTheDocument();

    // Cancel closes the dialog.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Route name' })).not.toBeInTheDocument();
    });
  });

  it('opens the edit dialog prefilled from a row', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoutesTable listRef={createRef<HTMLDivElement>()} />, {
      client: {
        listConversationRoutes: vi.fn().mockResolvedValue({ items: [makeRoute()], total: 1 }),
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Edit route chat' }));
    // The name rides in as a read-only const field.
    expect(await screen.findByDisplayValue('chat')).toBeDisabled();

    // Cancel closes the edit dialog.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByDisplayValue('chat')).not.toBeInTheDocument();
    });
  });

  it('deletes a route behind the confirm dialog and refreshes the list', async () => {
    const user = userEvent.setup();
    const deleteConversationRoute = vi
      .fn()
      .mockResolvedValue({ removed: true, route_name: 'chat' });
    const listConversationRoutes = vi.fn().mockResolvedValue({ items: [makeRoute()], total: 1 });
    renderWithProviders(<RoutesTable listRef={createRef<HTMLDivElement>()} />, {
      client: { listConversationRoutes, deleteConversationRoute },
    });

    await user.click(await screen.findByRole('button', { name: 'Delete route chat' }));
    // The house confirm dialog states the destructive consequence.
    expect(screen.getByText(/drops the routing row/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete route' }));
    await waitFor(() => {
      expect(deleteConversationRoute).toHaveBeenCalledWith('chat');
    });
    // Success refetches the list (invalidation) — a second read fires.
    await waitFor(() => {
      expect(listConversationRoutes.mock.calls.length).toBeGreaterThan(1);
    });
  });

  it('surfaces a delete failure loudly and keeps the confirm dialog open', async () => {
    const user = userEvent.setup();
    const deleteConversationRoute = vi.fn().mockRejectedValue(new ApiError('route is busy', 409));
    renderWithProviders(<RoutesTable listRef={createRef<HTMLDivElement>()} />, {
      client: {
        listConversationRoutes: vi.fn().mockResolvedValue({ items: [makeRoute()], total: 1 }),
        deleteConversationRoute,
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Delete route chat' }));
    await user.click(screen.getByRole('button', { name: 'Delete route' }));

    expect(await screen.findByText('route is busy')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete route' })).toBeInTheDocument();
  });

  it("does not leak a failed delete error into a different route's confirm", async () => {
    const user = userEvent.setup();
    const deleteConversationRoute = vi.fn().mockRejectedValue(new ApiError('route is busy', 409));
    renderWithProviders(<RoutesTable listRef={createRef<HTMLDivElement>()} />, {
      client: {
        listConversationRoutes: vi.fn().mockResolvedValue({
          items: [makeRoute({ route_name: 'alpha' }), makeRoute({ route_name: 'beta' })],
          total: 2,
        }),
        deleteConversationRoute,
      },
    });

    // A delete on route alpha fails; the confirm keeps the error up.
    await user.click(await screen.findByRole('button', { name: 'Delete route alpha' }));
    await user.click(screen.getByRole('button', { name: 'Delete route' }));
    expect(await screen.findByText('route is busy')).toBeInTheDocument();

    // Cancel out, then open the delete confirm for a DIFFERENT route.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText(/drops the routing row/)).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Delete route beta' }));

    // The confirm reopened for beta carrying no stale error from alpha's attempt.
    expect(screen.getByText(/drops the routing row/)).toBeInTheDocument();
    expect(screen.queryByText('route is busy')).not.toBeInTheDocument();
  });

  it('cancels a pending delete without calling the API', async () => {
    const user = userEvent.setup();
    const deleteConversationRoute = vi.fn();
    renderWithProviders(<RoutesTable listRef={createRef<HTMLDivElement>()} />, {
      client: {
        listConversationRoutes: vi.fn().mockResolvedValue({ items: [makeRoute()], total: 1 }),
        deleteConversationRoute,
      },
    });

    await user.click(await screen.findByRole('button', { name: 'Delete route chat' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(screen.queryByText(/drops the routing row/)).not.toBeInTheDocument();
    });
    expect(deleteConversationRoute).not.toHaveBeenCalled();
  });
});
