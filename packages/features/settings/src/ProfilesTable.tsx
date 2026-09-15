/**
 * The settings-profiles card: the header (Revert / New when writable) and the table
 * of manageable profiles, each row carrying the Diff / History read actions and the
 * Edit / Apply / Delete write actions. Every management control is gated so a
 * list-only editor sees the rows without a control whose call would 403.
 */
import {
  Button,
  Card,
  EmptyState,
  ScrollRegion,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

const stackHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  marginBottom: 'var(--tai-space-4)',
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-lg)',
  color: 'var(--tai-color-text)',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
  alignItems: 'center',
};

export interface ProfileListItem {
  readonly name: string;
  readonly description: string;
}

export interface ProfilesTableProps {
  readonly profiles: readonly ProfileListItem[];
  readonly canManage: boolean;
  readonly canWrite: boolean;
  readonly onCreate: () => void;
  readonly onRevert: () => void;
  readonly onDiff: (name: string) => void;
  readonly onHistory: (name: string) => void;
  readonly onEdit: (name: string) => void;
  readonly onApply: (name: string) => void;
  readonly onDelete: (name: string) => void;
}

function ProfileRowActions({
  name,
  canWrite,
  onDiff,
  onHistory,
  onEdit,
  onApply,
  onDelete,
}: {
  readonly name: string;
} & Pick<
  ProfilesTableProps,
  'canWrite' | 'onDiff' | 'onHistory' | 'onEdit' | 'onApply' | 'onDelete'
>): ReactNode {
  return (
    <div style={actionsStyle}>
      <Button
        type="button"
        aria-label={`Diff profile ${name}`}
        onClick={() => {
          onDiff(name);
        }}
      >
        Diff
      </Button>
      <Button
        type="button"
        aria-label={`Version history for ${name}`}
        onClick={() => {
          onHistory(name);
        }}
      >
        History
      </Button>
      {canWrite ? (
        <>
          <Button
            type="button"
            aria-label={`Edit profile ${name}`}
            onClick={() => {
              onEdit(name);
            }}
          >
            Edit
          </Button>
          <Button
            type="button"
            variant="primary"
            aria-label={`Apply profile ${name}`}
            onClick={() => {
              onApply(name);
            }}
          >
            Apply
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Delete profile ${name}`}
            onClick={() => {
              onDelete(name);
            }}
          >
            Delete
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function ProfilesTable({
  profiles,
  canManage,
  canWrite,
  onCreate,
  onRevert,
  ...rowHandlers
}: ProfilesTableProps): ReactNode {
  return (
    <Card>
      <div style={stackHeaderStyle}>
        <h3 style={headingStyle}>Settings profiles</h3>
        {canWrite ? (
          <div style={actionsStyle}>
            <Button type="button" onClick={onRevert}>
              Revert last apply
            </Button>
            <Button type="button" variant="primary" onClick={onCreate}>
              New profile
            </Button>
          </div>
        ) : null}
      </div>

      {profiles.length === 0 ? (
        <EmptyState
          title="No profiles"
          description="Create a profile to capture a named set of environment values."
        />
      ) : (
        <ScrollRegion label="Profiles">
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Description</TH>
                {canManage ? <TH>Actions</TH> : null}
              </TR>
            </THead>
            <TBody>
              {profiles.map((profile) => (
                <TR key={profile.name} data-testid={`profile-row-${profile.name}`}>
                  <TD className="tai-table-id">{profile.name}</TD>
                  <TD>{profile.description}</TD>
                  {canManage ? (
                    <TD>
                      <ProfileRowActions name={profile.name} canWrite={canWrite} {...rowHandlers} />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        </ScrollRegion>
      )}
    </Card>
  );
}
