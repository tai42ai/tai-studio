/**
 * The `/members` feature page: a generic view of the deployment's membership — the
 * people every accounts provider owns, and the invitations they hold — aggregated and
 * platform-joined server-side by `GET /api/auth/members` into one directory that names
 * no provider, plus the member-admin actions each provider DECLARES (`GET
 * /api/auth/member-actions`).
 *
 * Everything action-related is driven by the opaque declarations: page-scoped actions
 * render as header buttons, member-/invite-row actions render per row by joining the
 * row's `action_keys` to the catalog by key, and an action's input form and result
 * view come from its declared JSON schemas. The page names no provider, no route, and
 * no action — only opaque keys and handles, generic scopes, and the platform-joined
 * principal state.
 *
 * The view is a state machine — loading → `<Skeleton>`, error → `<ErrorState>` (loud,
 * always visible; a 401/403 is not special-cased), empty → `<EmptyState>` — over BOTH
 * reads, so a failed request is never a silent empty render and a missing catalog never
 * silently drops the actions. A person's status is the platform-joined `disabled`
 * (True only when every principal is disabled); a row with a mix of enabled and
 * disabled principals reads active and shows that it is partially disabled.
 */
import type { InviteRow, MemberActionDescriptor, MemberRow } from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  PageHeader,
  type PageProps,
  ScrollRegion,
  Skeleton,
  Stack,
  Table,
  TBody,
  TD,
  TH,
  THead,
  Tooltip,
  TR,
  useApi,
} from '@tai42/studio-sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

import { ActionDialog } from './ActionDialog';
import { memberActionsKey, membersKey } from './keys';
import { catalogByKey, pageActions, rowActions } from './member-actions';

/** An action the operator picked to run, with the row it targets (`null` for a page action). */
interface ActiveAction {
  readonly descriptor: MemberActionDescriptor;
  readonly targetHandle: string | null;
}

/** A row's applicable actions resolved from the catalog, each wired to run on click. */
type OnInvoke = (descriptor: MemberActionDescriptor, targetHandle: string | null) => void;

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-lg)',
};

const sectionBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const actionsCellStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
};

const statusCellStyle: CSSProperties = {
  display: 'inline-flex',
  gap: 'var(--tai-space-2)',
  alignItems: 'center',
  flexWrap: 'wrap',
};

const pageActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
  flexWrap: 'wrap',
};

/**
 * An ISO-8601 instant rendered for humans in the viewer's locale. An unparseable
 * value is shown verbatim rather than swallowed into a placeholder that hides bad data.
 */
function formatInstant(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

const NO_ROLE_LABEL = 'No role';
const NO_ROLE_NOTE = "This member's access was set directly, not from a role.";

/** The `No role` badge's trigger: a bare button, so the badge alone is what shows. */
const noRoleTriggerStyle: CSSProperties = {
  padding: 0,
  border: 'none',
  background: 'none',
  font: 'inherit',
  cursor: 'help',
};

/**
 * A row's role as a neutral badge. A `null` role — access not written from a role
 * template — reads `No role`, with a tooltip saying so; the badge sits in a button so the
 * explanation opens on keyboard focus as well as on hover.
 */
function RoleBadge({ role }: { readonly role: string | null }): ReactNode {
  if (role !== null) {
    return <Badge variant="neutral">{role}</Badge>;
  }
  return (
    <Tooltip content={NO_ROLE_NOTE}>
      <button type="button" style={noRoleTriggerStyle} data-testid="no-role-badge">
        <Badge variant="neutral">{NO_ROLE_LABEL}</Badge>
      </button>
    </Tooltip>
  );
}

/**
 * A member's status: `disabled` is the platform-joined truth (True only when EVERY
 * principal the person holds is disabled). A person with some-but-not-all principals
 * disabled still reads active — they can still sign in — and shows that it is partially
 * disabled, so the per-principal truth is never collapsed away.
 */
function StatusCell({ row }: { readonly row: MemberRow }): ReactNode {
  if (row.disabled) {
    return <Badge variant="warning">Disabled</Badge>;
  }
  const partiallyDisabled = row.principals.some((principal) => principal.disabled);
  return (
    <span style={statusCellStyle}>
      <Badge variant="success">Active</Badge>
      {partiallyDisabled ? <Badge variant="warning">Partially disabled</Badge> : null}
    </span>
  );
}

/** One row's applicable actions as a button group, each running on click. */
function RowActionButtons({
  label,
  actions,
  targetHandle,
  onInvoke,
}: {
  readonly label: string;
  readonly actions: readonly MemberActionDescriptor[];
  readonly targetHandle: string;
  readonly onInvoke: OnInvoke;
}): ReactNode {
  return (
    <div style={actionsCellStyle} role="group" aria-label={label}>
      {actions.map((descriptor) => (
        <Button
          key={descriptor.key}
          type="button"
          variant={descriptor.destructive ? 'ghost' : 'secondary'}
          onClick={() => {
            onInvoke(descriptor, targetHandle);
          }}
        >
          {descriptor.label}
        </Button>
      ))}
    </div>
  );
}

/** The people table: one row per account an accounts provider owns. */
function PeopleTable({
  members,
  byKey,
  onInvoke,
}: {
  readonly members: readonly MemberRow[];
  readonly byKey: ReadonlyMap<string, MemberActionDescriptor>;
  readonly onInvoke: OnInvoke;
}): ReactNode {
  if (members.length === 0) {
    return <EmptyState title="No members" description="No people have been added yet." />;
  }
  const rows = members.map((member) => ({
    member,
    actions: rowActions(byKey, member.action_keys, 'member_row'),
  }));
  const showActions = rows.some((row) => row.actions.length > 0);
  return (
    <ScrollRegion label="People">
      <Table data-testid="members-table">
        <THead>
          <TR>
            <TH>Email</TH>
            <TH>Role</TH>
            <TH>Status</TH>
            <TH>Created</TH>
            {showActions ? <TH>Actions</TH> : null}
          </TR>
        </THead>
        <TBody>
          {rows.map(({ member, actions }) => (
            <TR key={member.id} data-testid="member-row">
              <TH scope="row">{member.email}</TH>
              <TD>
                <RoleBadge role={member.role} />
              </TD>
              <TD>
                <StatusCell row={member} />
              </TD>
              <TD>{formatInstant(member.created_at)}</TD>
              {showActions ? (
                <TD>
                  <RowActionButtons
                    label={`Actions for ${member.email}`}
                    actions={actions}
                    targetHandle={member.handle}
                    onInvoke={onInvoke}
                  />
                </TD>
              ) : null}
            </TR>
          ))}
        </TBody>
      </Table>
    </ScrollRegion>
  );
}

/** The invitations table: one row per outstanding invitation a provider holds. */
function InvitesTable({
  invites,
  byKey,
  onInvoke,
}: {
  readonly invites: readonly InviteRow[];
  readonly byKey: ReadonlyMap<string, MemberActionDescriptor>;
  readonly onInvoke: OnInvoke;
}): ReactNode {
  if (invites.length === 0) {
    return (
      <EmptyState
        title="No pending invitations"
        description="Outstanding invitations appear here until they are accepted or expire."
      />
    );
  }
  const rows = invites.map((invite) => ({
    invite,
    actions: rowActions(byKey, invite.action_keys, 'invite_row'),
  }));
  const showActions = rows.some((row) => row.actions.length > 0);
  return (
    <ScrollRegion label="Pending invitations">
      <Table data-testid="invites-table">
        <THead>
          <TR>
            <TH>Email</TH>
            <TH>Role</TH>
            <TH>Invited</TH>
            <TH>Expires</TH>
            {showActions ? <TH>Actions</TH> : null}
          </TR>
        </THead>
        <TBody>
          {rows.map(({ invite, actions }) => (
            <TR key={invite.id} data-testid="invite-row">
              <TH scope="row">{invite.email}</TH>
              <TD>
                <RoleBadge role={invite.role} />
              </TD>
              <TD>{formatInstant(invite.created_at)}</TD>
              <TD>{formatInstant(invite.expires_at)}</TD>
              {showActions ? (
                <TD>
                  <RowActionButtons
                    label={`Actions for ${invite.email}`}
                    actions={actions}
                    targetHandle={invite.handle}
                    onInvoke={onInvoke}
                  />
                </TD>
              ) : null}
            </TR>
          ))}
        </TBody>
      </Table>
    </ScrollRegion>
  );
}

/**
 * The members page. The `members` route carries no search parameters
 * ({@link PageProps}'s `search` is the empty object here), so the component declares
 * the shell's `PageProps<'members'>` contract for its call site but reads nothing from it.
 */
export const MembersPage: (props: PageProps<'members'>) => ReactNode = () => {
  const api = useApi();
  const queryClient = useQueryClient();
  const listing = useQuery({
    queryKey: membersKey,
    queryFn: ({ signal }) => api.listMembers(signal),
  });
  const catalog = useQuery({
    queryKey: memberActionsKey,
    queryFn: ({ signal }) => api.listMemberActions(signal),
  });
  const [active, setActive] = useState<ActiveAction | null>(null);

  const onInvoke: OnInvoke = (descriptor, targetHandle) => {
    setActive({ descriptor, targetHandle });
  };
  const onCompleted = (): void => {
    void queryClient.invalidateQueries({ queryKey: membersKey });
    void queryClient.invalidateQueries({ queryKey: memberActionsKey });
  };
  const retry = (): void => {
    void listing.refetch();
    void catalog.refetch();
  };

  let headerActions: ReactNode;
  let body: ReactNode;
  // Both reads gate the page together: the directory carries the rows, the catalog
  // carries the actions those rows reference — a failure of either is loud, never a
  // page that renders rows with its actions silently missing.
  if (listing.isPending || catalog.isPending) {
    body = (
      <Card>
        <Skeleton height={160} />
      </Card>
    );
  } else if (listing.isError || catalog.isError) {
    body = (
      <Card>
        <ErrorState message={errorMessage(listing.error ?? catalog.error)} onRetry={retry} />
      </Card>
    );
  } else {
    const byKey = catalogByKey(catalog.data);
    const pageDescriptors = pageActions(catalog.data);
    headerActions =
      pageDescriptors.length > 0 ? (
        <div style={pageActionsStyle} role="group" aria-label="Member actions">
          {pageDescriptors.map((descriptor) => (
            <Button
              key={descriptor.key}
              type="button"
              variant={descriptor.destructive ? 'danger' : 'primary'}
              onClick={() => {
                onInvoke(descriptor, null);
              }}
            >
              {descriptor.label}
            </Button>
          ))}
        </div>
      ) : undefined;

    if (listing.data.members.length === 0 && listing.data.invites.length === 0) {
      body = (
        <Card>
          <EmptyState
            title="No members yet"
            description="People and outstanding invitations across your accounts providers appear here."
          />
        </Card>
      );
    } else {
      body = (
        <Stack gap={6}>
          <Card>
            <div style={sectionBodyStyle}>
              <h2 style={sectionHeadingStyle}>People</h2>
              <PeopleTable members={listing.data.members} byKey={byKey} onInvoke={onInvoke} />
            </div>
          </Card>
          <Card>
            <div style={sectionBodyStyle}>
              <h2 style={sectionHeadingStyle}>Pending invitations</h2>
              <InvitesTable invites={listing.data.invites} byKey={byKey} onInvoke={onInvoke} />
            </div>
          </Card>
        </Stack>
      );
    }
  }

  return (
    <Stack gap={6}>
      <PageHeader eyebrow="Administration" title="Members" actions={headerActions} />
      {body}
      {active !== null ? (
        <ActionDialog
          descriptor={active.descriptor}
          targetHandle={active.targetHandle}
          onClose={() => {
            setActive(null);
          }}
          onCompleted={onCompleted}
        />
      ) : null}
    </Stack>
  );
};
