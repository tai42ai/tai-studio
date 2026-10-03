import type { ApiClient } from '@tai42/api-client';
import { ApiProvider, AuthProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { MembersPage } from './MembersPage';

/**
 * Wrap the page in the provider stack it expects at runtime: a retry-disabled
 * QueryClient (so an error state lands on the first rejection instead of after silent
 * retries), the auth context, the raw `ApiProvider` fed the stub client, the theme
 * context the design system reads, and a stub NavigationProvider. The page does no
 * capability filtering of its own, so no projection is needed.
 */
function renderWithProviders(ui: ReactElement, client: ApiClient): void {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider value={client}>
          <ThemeProvider>
            <NavigationProvider
              value={{
                navigate: vi.fn(),
                resolvePath: () => '/x',
                navigatePlugin: vi.fn(),
                resolvePluginPath: () => '/x',
              }}
            >
              {children}
            </NavigationProvider>
          </ThemeProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  render(ui, { wrapper });
}

/** A stub client exposing only what the page consumes: the members listing endpoint. */
function stubClient(listMembers: ApiClient['listMembers']): ApiClient {
  return { listMembers } as unknown as ApiClient;
}

const member = {
  id: 'm-1',
  email: 'alice@example.com',
  role: 'editor',
  disabled: false,
  created_at: '2026-07-11T00:00:00Z',
};

const invite = {
  id: 'i-1',
  email: 'bob@example.com',
  role: 'viewer',
  created_at: '2026-07-12T00:00:00Z',
  expires_at: '2026-07-19T00:00:00Z',
};

describe('MembersPage', () => {
  it('renders people and invitation rows from the aggregated listing', async () => {
    const client = stubClient(
      vi.fn().mockResolvedValue({
        members: [
          member,
          { ...member, id: 'm-2', email: 'carol@example.com', role: 'admin', disabled: true },
        ],
        invites: [invite],
      }),
    );
    renderWithProviders(<MembersPage search={{}} />, client);

    const peopleTable = await screen.findByTestId('members-table');
    const peopleRows = within(peopleTable).getAllByTestId('member-row');
    expect(peopleRows).toHaveLength(2);
    expect(within(peopleTable).getByText('alice@example.com')).toBeInTheDocument();
    expect(within(peopleTable).getByText('carol@example.com')).toBeInTheDocument();
    // Role names render as badges; status reflects `disabled` (alice active, carol off).
    expect(within(peopleTable).getByText('editor')).toBeInTheDocument();
    expect(within(peopleTable).getByText('admin')).toBeInTheDocument();
    expect(within(peopleTable).getByText('Active')).toBeInTheDocument();
    expect(within(peopleTable).getByText('Disabled')).toBeInTheDocument();
    // Each row is named by its email for assistive tech (a row-header cell), in order.
    const rowHeaders = within(peopleTable).getAllByRole('rowheader');
    expect(rowHeaders.map((cell) => cell.textContent)).toEqual([
      'alice@example.com',
      'carol@example.com',
    ]);

    const invitesTable = screen.getByTestId('invites-table');
    const inviteRows = within(invitesTable).getAllByTestId('invite-row');
    expect(inviteRows).toHaveLength(1);
    expect(within(invitesTable).getByText('bob@example.com')).toBeInTheDocument();
    expect(within(invitesTable).getByText('viewer')).toBeInTheDocument();
  });

  it('shows a whole-page empty state when there are no members and no invites', async () => {
    const client = stubClient(vi.fn().mockResolvedValue({ members: [], invites: [] }));
    renderWithProviders(<MembersPage search={{}} />, client);

    expect(await screen.findByText('No members yet')).toBeInTheDocument();
    expect(screen.queryByTestId('members-table')).toBeNull();
    expect(screen.queryByTestId('invites-table')).toBeNull();
  });

  it('shows the people empty state while still listing pending invitations', async () => {
    const client = stubClient(vi.fn().mockResolvedValue({ members: [], invites: [invite] }));
    renderWithProviders(<MembersPage search={{}} />, client);

    expect(await screen.findByText('No members')).toBeInTheDocument();
    expect(screen.getByTestId('invites-table')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('shows the invitations empty state while still listing people', async () => {
    const client = stubClient(vi.fn().mockResolvedValue({ members: [member], invites: [] }));
    renderWithProviders(<MembersPage search={{}} />, client);

    expect(await screen.findByText('No pending invitations')).toBeInTheDocument();
    expect(screen.getByTestId('members-table')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('shows a loading skeleton before the listing resolves', () => {
    const client = stubClient(vi.fn().mockReturnValue(new Promise(() => undefined)));
    const { container } = renderContainer(<MembersPage search={{}} />, client);

    expect(container.querySelector('.tai-skeleton')).not.toBeNull();
    expect(screen.queryByTestId('members-table')).toBeNull();
  });

  it('renders a loud, retryable error when the listing fails', async () => {
    const listMembers = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ members: [member], invites: [] });
    const client = stubClient(listMembers as ApiClient['listMembers']);
    renderWithProviders(<MembersPage search={{}} />, client);

    expect(await screen.findByText('boom')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Retry' });
    await userEvent.click(retry);

    await waitFor(() => {
      expect(screen.getByTestId('members-table')).toBeInTheDocument();
    });
    expect(listMembers).toHaveBeenCalledTimes(2);
  });

  it('renders an unparseable timestamp verbatim rather than swallowing it', async () => {
    const client = stubClient(
      vi.fn().mockResolvedValue({
        members: [{ ...member, created_at: 'not-a-date' }],
        invites: [],
      }),
    );
    renderWithProviders(<MembersPage search={{}} />, client);

    expect(await screen.findByText('not-a-date')).toBeInTheDocument();
  });
});

/** A `render` variant that returns the container, for a DOM-node assertion. */
function renderContainer(ui: ReactElement, client: ApiClient): ReturnType<typeof render> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }): ReactElement => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ApiProvider value={client}>
          <ThemeProvider>
            <NavigationProvider
              value={{
                navigate: vi.fn(),
                resolvePath: () => '/x',
                navigatePlugin: vi.fn(),
                resolvePluginPath: () => '/x',
              }}
            >
              {children}
            </NavigationProvider>
          </ThemeProvider>
        </ApiProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
  return render(ui, { wrapper });
}
