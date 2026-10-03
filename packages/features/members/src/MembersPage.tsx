/**
 * The `/members` feature page: a read-only, generic listing of the deployment's
 * membership — the people every accounts provider owns, and the invitations they
 * hold — aggregated server-side by `GET /api/auth/members` into one view that names
 * no provider.
 *
 * The page is read-only: it renders the contract shapes and nothing more. It carries
 * no invite, revoke, or second-method control — those are a single provider's routes
 * and belong to that provider's own surface, not to this generic core page.
 *
 * The view is a state machine — loading → `<Skeleton>`, error → `<ErrorState>` (loud,
 * always visible; a 401/403 is not special-cased), empty → `<EmptyState>` — so a failed
 * request is never a silent empty render. People and invitations render as two separate
 * tables because the contract models them as two lists with different shapes.
 */
import type { InviteEntry, MemberEntry } from '@tai42/api-client';
import {
  Badge,
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
  TR,
  useApi,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties, ReactNode } from 'react';

import { membersKey } from './keys';

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-lg)',
};

const sectionBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
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

/** One row's status: an account is either active or turned off. */
function StatusBadge({ disabled }: { readonly disabled: boolean }): ReactNode {
  return disabled ? (
    <Badge variant="warning">Disabled</Badge>
  ) : (
    <Badge variant="success">Active</Badge>
  );
}

/** The people table: one row per account an accounts provider owns. */
function PeopleTable({ members }: { readonly members: readonly MemberEntry[] }): ReactNode {
  if (members.length === 0) {
    return <EmptyState title="No members" description="No people have been added yet." />;
  }
  return (
    <ScrollRegion label="People">
      <Table data-testid="members-table">
        <THead>
          <TR>
            <TH>Email</TH>
            <TH>Role</TH>
            <TH>Status</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <TBody>
          {members.map((member) => (
            <TR key={member.id} data-testid="member-row">
              <TH scope="row">{member.email}</TH>
              <TD>
                <Badge variant="neutral">{member.role}</Badge>
              </TD>
              <TD>
                <StatusBadge disabled={member.disabled} />
              </TD>
              <TD>{formatInstant(member.created_at)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </ScrollRegion>
  );
}

/** The invitations table: one row per outstanding invitation a provider holds. */
function InvitesTable({ invites }: { readonly invites: readonly InviteEntry[] }): ReactNode {
  if (invites.length === 0) {
    return (
      <EmptyState
        title="No pending invitations"
        description="Outstanding invitations appear here until they are accepted or expire."
      />
    );
  }
  return (
    <ScrollRegion label="Pending invitations">
      <Table data-testid="invites-table">
        <THead>
          <TR>
            <TH>Email</TH>
            <TH>Role</TH>
            <TH>Invited</TH>
            <TH>Expires</TH>
          </TR>
        </THead>
        <TBody>
          {invites.map((invite) => (
            <TR key={invite.id} data-testid="invite-row">
              <TH scope="row">{invite.email}</TH>
              <TD>
                <Badge variant="neutral">{invite.role}</Badge>
              </TD>
              <TD>{formatInstant(invite.created_at)}</TD>
              <TD>{formatInstant(invite.expires_at)}</TD>
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
  const listing = useQuery({
    queryKey: membersKey,
    queryFn: ({ signal }) => api.listMembers(signal),
  });

  let body: ReactNode;
  if (listing.isPending) {
    body = (
      <Card>
        <Skeleton height={160} />
      </Card>
    );
  } else if (listing.isError) {
    body = (
      <Card>
        <ErrorState message={errorMessage(listing.error)} onRetry={() => void listing.refetch()} />
      </Card>
    );
  } else if (listing.data.members.length === 0 && listing.data.invites.length === 0) {
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
            <PeopleTable members={listing.data.members} />
          </div>
        </Card>
        <Card>
          <div style={sectionBodyStyle}>
            <h2 style={sectionHeadingStyle}>Pending invitations</h2>
            <InvitesTable invites={listing.data.invites} />
          </div>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack gap={6}>
      <PageHeader eyebrow="Administration" title="Members" />
      {body}
    </Stack>
  );
};
