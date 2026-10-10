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
function wrapper(client: ApiClient): (props: { children: ReactNode }) => ReactElement {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }): ReactElement => (
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
}

function renderPage(client: ApiClient): ReturnType<typeof render> {
  return render(<MembersPage search={{}} />, { wrapper: wrapper(client) });
}

/** A stub client exposing only what the page consumes: the two reads and the invoke. */
function stubClient(overrides: Partial<ApiClient>): ApiClient {
  return {
    listMembers: vi.fn().mockResolvedValue({ members: [], invites: [] }),
    listMemberActions: vi.fn().mockResolvedValue({ actions: [] }),
    invokeMemberAction: vi.fn().mockResolvedValue({ result: {} }),
    ...overrides,
  } as unknown as ApiClient;
}

const member = {
  id: 'm-1',
  email: 'alice@example.com',
  role: 'editor',
  created_at: '2026-07-11T00:00:00Z',
  principals: [{ user_id: 'p-1', disabled: false, role: 'editor' }],
  disabled: false,
  handle: 'handle-m-1',
  action_keys: [] as string[],
};

const invite = {
  id: 'i-1',
  email: 'bob@example.com',
  role: 'viewer',
  created_at: '2026-07-12T00:00:00Z',
  expires_at: '2026-07-19T00:00:00Z',
  handle: 'handle-i-1',
  action_keys: [] as string[],
};

const emptySchema = { type: 'object', properties: {} };

describe('MembersPage listing', () => {
  it('renders people and invitation rows from the aggregated directory', async () => {
    const client = stubClient({
      listMembers: vi.fn().mockResolvedValue({
        members: [
          member,
          {
            ...member,
            id: 'm-2',
            email: 'carol@example.com',
            role: 'admin',
            disabled: true,
            principals: [{ user_id: 'p-2', disabled: true, role: 'admin' }],
            handle: 'handle-m-2',
          },
        ],
        invites: [invite],
      }),
    });
    renderPage(client);

    const peopleTable = await screen.findByTestId('members-table');
    const peopleRows = within(peopleTable).getAllByTestId('member-row');
    expect(peopleRows).toHaveLength(2);
    expect(within(peopleTable).getByText('alice@example.com')).toBeInTheDocument();
    expect(within(peopleTable).getByText('carol@example.com')).toBeInTheDocument();
    // Role names render as badges; status reflects the joined `disabled` (alice active,
    // carol — every principal disabled — off).
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

  it('renders a null role as the neutral "No role" badge with its explanation', async () => {
    const client = stubClient({
      listMembers: vi.fn().mockResolvedValue({
        members: [
          { ...member, role: null, principals: [{ user_id: 'p-1', disabled: false, role: null }] },
        ],
        invites: [{ ...invite, role: null }],
      }),
    });
    renderPage(client);

    const peopleTable = await screen.findByTestId('members-table');
    const memberBadge = within(peopleTable).getByTestId('no-role-badge');
    expect(memberBadge).toHaveTextContent('No role');
    expect(within(memberBadge).getByText('No role')).toHaveAttribute('data-variant', 'neutral');
    const invitesTable = screen.getByTestId('invites-table');
    expect(within(invitesTable).getByTestId('no-role-badge')).toHaveTextContent('No role');

    // Keyboard reachable: focusing the badge opens its explanation.
    memberBadge.focus();
    const note = await screen.findByRole('tooltip');
    expect(note).toHaveTextContent("This member's access was set directly, not from a role.");
  });

  it('renders logins holding different roles as a "Mixed roles" warning with each login\'s role', async () => {
    const client = stubClient({
      listMembers: vi.fn().mockResolvedValue({
        members: [
          {
            ...member,
            role: null,
            principals: [
              { user_id: 'login-a', disabled: false, role: 'viewer' },
              { user_id: 'login-b', disabled: false, role: 'admin' },
              { user_id: 'login-c', disabled: false, role: null },
            ],
          },
        ],
        invites: [],
      }),
    });
    renderPage(client);

    const peopleTable = await screen.findByTestId('members-table');
    const badge = within(peopleTable).getByTestId('mixed-roles-badge');
    expect(badge).toHaveTextContent('Mixed roles');
    expect(within(badge).getByText('Mixed roles')).toHaveAttribute('data-variant', 'warning');
    expect(within(peopleTable).queryByTestId('no-role-badge')).not.toBeInTheDocument();

    // Keyboard reachable: focusing the badge lists every login's role and the repair.
    badge.focus();
    const note = await screen.findByRole('tooltip');
    expect(note).toHaveTextContent('login-a — viewer');
    expect(note).toHaveTextContent('login-b — admin');
    expect(note).toHaveTextContent('login-c — No role');
    expect(note).toHaveTextContent('Give every login of this person the same role.');
  });

  it('renders the one role every login holds as the neutral role badge', async () => {
    const client = stubClient({
      listMembers: vi.fn().mockResolvedValue({
        members: [
          {
            ...member,
            role: 'editor',
            principals: [
              { user_id: 'p-1', disabled: false, role: 'editor' },
              { user_id: 'p-1b', disabled: false, role: 'editor' },
            ],
          },
        ],
        invites: [],
      }),
    });
    renderPage(client);

    const peopleTable = await screen.findByTestId('members-table');
    expect(within(peopleTable).getByText('editor')).toHaveAttribute('data-variant', 'neutral');
    expect(within(peopleTable).queryByTestId('mixed-roles-badge')).not.toBeInTheDocument();
  });

  it('reads active with a partially-disabled badge when only some principals are off', async () => {
    const client = stubClient({
      listMembers: vi.fn().mockResolvedValue({
        members: [
          {
            ...member,
            principals: [
              { user_id: 'p-1', disabled: false, role: 'editor' },
              { user_id: 'p-1b', disabled: true, role: 'editor' },
            ],
            disabled: false,
          },
        ],
        invites: [],
      }),
    });
    renderPage(client);

    const peopleTable = await screen.findByTestId('members-table');
    expect(within(peopleTable).getByText('Active')).toBeInTheDocument();
    expect(within(peopleTable).getByText('Partially disabled')).toBeInTheDocument();
  });

  it('shows a whole-page empty state when there are no members and no invites', async () => {
    const client = stubClient({});
    renderPage(client);

    expect(await screen.findByText('No members yet')).toBeInTheDocument();
    expect(screen.queryByTestId('members-table')).toBeNull();
    expect(screen.queryByTestId('invites-table')).toBeNull();
  });

  it('shows the people empty state while still listing pending invitations', async () => {
    const client = stubClient({
      listMembers: vi.fn().mockResolvedValue({ members: [], invites: [invite] }),
    });
    renderPage(client);

    expect(await screen.findByText('No members')).toBeInTheDocument();
    expect(screen.getByTestId('invites-table')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('shows the invitations empty state while still listing people', async () => {
    const client = stubClient({
      listMembers: vi.fn().mockResolvedValue({ members: [member], invites: [] }),
    });
    renderPage(client);

    expect(await screen.findByText('No pending invitations')).toBeInTheDocument();
    expect(screen.getByTestId('members-table')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('shows a loading skeleton before the reads resolve', () => {
    const client = stubClient({
      listMembers: vi.fn().mockReturnValue(new Promise(() => undefined)),
    });
    const { container } = renderPage(client);

    expect(container.querySelector('.tai-skeleton')).not.toBeNull();
    expect(screen.queryByTestId('members-table')).toBeNull();
  });

  it('renders a loud, retryable error when the directory read fails', async () => {
    const listMembers = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ members: [member], invites: [] });
    const client = stubClient({ listMembers: listMembers as ApiClient['listMembers'] });
    renderPage(client);

    expect(await screen.findByText('boom')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      expect(screen.getByTestId('members-table')).toBeInTheDocument();
    });
    expect(listMembers).toHaveBeenCalledTimes(2);
  });

  it('renders a loud error when the action catalog read fails', async () => {
    const client = stubClient({
      listMembers: vi.fn().mockResolvedValue({ members: [member], invites: [] }),
      listMemberActions: vi.fn().mockRejectedValue(new Error('catalog down')),
    });
    renderPage(client);

    expect(await screen.findByText('catalog down')).toBeInTheDocument();
    expect(screen.queryByTestId('members-table')).toBeNull();
  });

  it('renders an unparseable timestamp verbatim rather than swallowing it', async () => {
    const client = stubClient({
      listMembers: vi.fn().mockResolvedValue({
        members: [{ ...member, created_at: 'not-a-date' }],
        invites: [],
      }),
    });
    renderPage(client);

    expect(await screen.findByText('not-a-date')).toBeInTheDocument();
  });
});

describe('MembersPage actions', () => {
  it('invokes a page-scoped action and shows its one-time result', async () => {
    const invokeMemberAction = vi
      .fn()
      .mockResolvedValue({ result: { link: 'https://host/invite#t=abc' } });
    const client = stubClient({
      listMemberActions: vi.fn().mockResolvedValue({
        actions: [
          {
            key: 'act-invite',
            label: 'Invite a person',
            scope: 'page',
            destructive: false,
            input_schema: emptySchema,
            result_schema: {
              type: 'object',
              properties: { link: { type: 'string', title: 'Link' } },
            },
          },
        ],
      }),
      invokeMemberAction,
    });
    renderPage(client);

    await userEvent.click(await screen.findByRole('button', { name: 'Invite a person' }));
    // No input declared → a run prompt, then the invoke.
    expect(await screen.findByText('Run this action now?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Invite a person' }));

    await waitFor(() => {
      expect(invokeMemberAction).toHaveBeenCalledWith({
        action_key: 'act-invite',
        target_handle: null,
        input: {},
      });
    });
    // The one-time link renders through a CopyField (shown once).
    expect(await screen.findByTestId('member-action-result-link')).toBeInTheDocument();
    expect(screen.getByText('https://host/invite#t=abc')).toBeInTheDocument();
  });

  it('renders a member-row action joined by key and invokes it with the row handle', async () => {
    const invokeMemberAction = vi.fn().mockResolvedValue({ result: {} });
    const client = stubClient({
      listMembers: vi
        .fn()
        .mockResolvedValue({ members: [{ ...member, action_keys: ['act-remove'] }], invites: [] }),
      listMemberActions: vi.fn().mockResolvedValue({
        actions: [
          {
            key: 'act-remove',
            label: 'Remove person',
            scope: 'member_row',
            destructive: true,
            input_schema: emptySchema,
            result_schema: emptySchema,
          },
          {
            // A page action should NOT appear in the row's menu.
            key: 'act-invite',
            label: 'Invite a person',
            scope: 'page',
            destructive: false,
            input_schema: emptySchema,
            result_schema: emptySchema,
          },
        ],
      }),
      invokeMemberAction,
    });
    renderPage(client);

    const peopleTable = await screen.findByTestId('members-table');
    const rowGroup = within(peopleTable).getByRole('group', {
      name: 'Actions for alice@example.com',
    });
    expect(within(rowGroup).getByRole('button', { name: 'Remove person' })).toBeInTheDocument();
    expect(within(rowGroup).queryByRole('button', { name: 'Invite a person' })).toBeNull();

    await userEvent.click(within(rowGroup).getByRole('button', { name: 'Remove person' }));
    // The dialog opens; the row button behind the modal is inert, so the only
    // reachable "Remove person" is the dialog's submit. Destructive → submitting it
    // reveals a confirm step that gates the invoke.
    await userEvent.click(await screen.findByRole('button', { name: 'Remove person' }));
    expect(await screen.findByTestId('member-action-confirm')).toBeInTheDocument();
    expect(invokeMemberAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(invokeMemberAction).toHaveBeenCalledWith({
        action_key: 'act-remove',
        target_handle: 'handle-m-1',
        input: {},
      });
    });
  });

  it('renders a destructive page action as a danger button and confirms before invoking', async () => {
    const invokeMemberAction = vi.fn().mockResolvedValue({ result: {} });
    const client = stubClient({
      listMembers: vi.fn().mockResolvedValue({ members: [member], invites: [] }),
      listMemberActions: vi.fn().mockResolvedValue({
        actions: [
          {
            key: 'act-purge',
            label: 'Purge directory',
            scope: 'page',
            destructive: true,
            input_schema: emptySchema,
            result_schema: emptySchema,
          },
        ],
      }),
      invokeMemberAction,
    });
    renderPage(client);

    await userEvent.click(await screen.findByRole('button', { name: 'Purge directory' }));
    // Destructive → the first submit reveals the confirm step, no invoke yet.
    await userEvent.click(await screen.findByRole('button', { name: 'Purge directory' }));
    expect(await screen.findByTestId('member-action-confirm')).toBeInTheDocument();
    expect(invokeMemberAction).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => {
      expect(invokeMemberAction).toHaveBeenCalledTimes(1);
    });
  });

  it('renders a non-destructive member-row action and invokes it with the row handle', async () => {
    const invokeMemberAction = vi.fn().mockResolvedValue({ result: {} });
    const client = stubClient({
      listMembers: vi
        .fn()
        .mockResolvedValue({ members: [{ ...member, action_keys: ['act-resend'] }], invites: [] }),
      listMemberActions: vi.fn().mockResolvedValue({
        actions: [
          {
            key: 'act-resend',
            label: 'Resend link',
            scope: 'member_row',
            destructive: false,
            input_schema: emptySchema,
            result_schema: emptySchema,
          },
        ],
      }),
      invokeMemberAction,
    });
    renderPage(client);

    const peopleTable = await screen.findByTestId('members-table');
    const rowGroup = within(peopleTable).getByRole('group', {
      name: 'Actions for alice@example.com',
    });
    await userEvent.click(within(rowGroup).getByRole('button', { name: 'Resend link' }));
    // Non-destructive → the dialog runs the invoke directly on submit, no confirm step.
    await userEvent.click(await screen.findByRole('button', { name: 'Resend link' }));
    await waitFor(() => {
      expect(invokeMemberAction).toHaveBeenCalledWith({
        action_key: 'act-resend',
        target_handle: 'handle-m-1',
        input: {},
      });
    });
  });

  it('renders an invite-row action joined to the invitation and invokes it with the invite handle', async () => {
    const invokeMemberAction = vi.fn().mockResolvedValue({ result: {} });
    const client = stubClient({
      listMembers: vi
        .fn()
        .mockResolvedValue({ members: [], invites: [{ ...invite, action_keys: ['act-revoke'] }] }),
      listMemberActions: vi.fn().mockResolvedValue({
        actions: [
          {
            key: 'act-revoke',
            label: 'Revoke invitation',
            scope: 'invite_row',
            destructive: false,
            input_schema: emptySchema,
            result_schema: emptySchema,
          },
        ],
      }),
      invokeMemberAction,
    });
    renderPage(client);

    const invitesTable = await screen.findByTestId('invites-table');
    const rowGroup = within(invitesTable).getByRole('group', {
      name: 'Actions for bob@example.com',
    });
    await userEvent.click(within(rowGroup).getByRole('button', { name: 'Revoke invitation' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Revoke invitation' }));
    await waitFor(() => {
      expect(invokeMemberAction).toHaveBeenCalledWith({
        action_key: 'act-revoke',
        target_handle: 'handle-i-1',
        input: {},
      });
    });
  });

  it('renders the input form for an action that declares input', async () => {
    const client = stubClient({
      listMemberActions: vi.fn().mockResolvedValue({
        actions: [
          {
            key: 'act-role',
            label: 'Change role',
            scope: 'page',
            destructive: false,
            input_schema: {
              type: 'object',
              properties: { note: { type: 'string', title: 'Note' } },
              required: ['note'],
            },
            result_schema: emptySchema,
          },
        ],
      }),
    });
    renderPage(client);

    await userEvent.click(await screen.findByRole('button', { name: 'Change role' }));
    // The action's declared input renders through the platform SchemaForm (its root
    // carries the idPrefix as a test id).
    expect(await screen.findByTestId('member-action-act-role')).toBeInTheDocument();
  });

  it('clears the active action so cancelling the dialog returns to the directory', async () => {
    const invokeMemberAction = vi.fn().mockResolvedValue({ result: {} });
    const client = stubClient({
      listMembers: vi.fn().mockResolvedValue({ members: [member], invites: [] }),
      listMemberActions: vi.fn().mockResolvedValue({
        actions: [
          {
            key: 'act-invite',
            label: 'Invite a person',
            scope: 'page',
            destructive: false,
            input_schema: emptySchema,
            result_schema: emptySchema,
          },
        ],
      }),
      invokeMemberAction,
    });
    renderPage(client);

    await userEvent.click(await screen.findByRole('button', { name: 'Invite a person' }));
    expect(await screen.findByText('Run this action now?')).toBeInTheDocument();
    // Cancelling drops the active action: the dialog unmounts and nothing is invoked.
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByText('Run this action now?')).toBeNull();
    });
    expect(invokeMemberAction).not.toHaveBeenCalled();
    expect(screen.getByTestId('members-table')).toBeInTheDocument();
  });
});
