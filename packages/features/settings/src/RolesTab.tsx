/**
 * The Roles tab: the definition surface for editable per-tag RBAC roles.
 *
 * A role is two layers. Layer 1 — the base-tier ceiling (`base_tier` + its seeded
 * jq `condition`, or `allow_all` for the reserved admin) — is READ-ONLY here: it is
 * shown as a security-tier badge, never an editable jq field. Layer 2 — the editable
 * per-tag `grants` map — is edited as a per-feature-GROUP TRI-STATE
 * (`none`/`read`/`write`), one selector per grantable feature tag. The feature groups
 * are derived from the route catalog (`listAuthRoutes`): a route's `tags` name its
 * feature group and its `action` classifies it. A group with at least one `read`/`write`
 * route is GRANTABLE; a purely-fenced group is shown with an admin-only marker and NO
 * grant control, mirroring the server, which rejects a grant on such a tag.
 *
 * The reserved `admin` role (`allow_all`) is shown but its grant editor is disabled
 * and it cannot be deleted — mirroring the server guard so the UI never sends a
 * request the gate would reject.
 *
 * This tab reads `GET /api/auth/roles` (an admin-only `secret` route), so it renders
 * only for a caller whose projection reaches it. Every server-supplied string renders
 * as escaped text through the design system; every failure surfaces loudly.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Spinner,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { RoleBody } from '@tai42/api-client';

import { authRoutesKey, rolesKey } from './keys';
import { CreateRoleDialog } from './CreateRoleDialog';
import { RoleVersionsDialog } from './RoleVersionsDialog';
import { RESERVED_ADMIN_ROLE, baseTierLabel, featureGroupsOf } from './role-grants';
import { RoleDetailPanel } from './RoleDetailPanel';

const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const cardHeaderStyle: CSSProperties = {
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

const layoutStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-4)',
  alignItems: 'flex-start',
};

const roleListStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
  minWidth: '12rem',
  flex: '0 0 auto',
};

const roleButtonStyle = (selected: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-2)',
  padding: 'var(--tai-space-2) var(--tai-space-3)',
  borderRadius: 'var(--tai-radius-md)',
  // An unselected row has a transparent ground, so this edge is the control's
  // ONLY boundary and takes the contrast-safe control token.
  border: '1px solid var(--tai-color-control-border)',
  background: selected ? 'var(--tai-color-surface-raised)' : 'transparent',
  color: 'var(--tai-color-text)',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
});

/** The create / version-history / delete dialogs, and the delete mutation. */
function RolesDialogs({
  createOpen,
  versionsRole,
  deleteName,
  readOnly,
  onCreated,
  onDeleted,
  onClose,
}: {
  readonly createOpen: boolean;
  readonly versionsRole: RoleBody | null;
  readonly deleteName: string | null;
  readonly readOnly: boolean;
  readonly onCreated: (name: string) => void;
  readonly onDeleted: (name: string) => void;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: (name: string) => api.deleteRole(name),
    onSuccess: (_result, name) => {
      onDeleted(name);
      onClose();
      void queryClient.invalidateQueries({ queryKey: rolesKey });
    },
  });

  return (
    <>
      {createOpen ? <CreateRoleDialog onCreated={onCreated} onClose={onClose} /> : null}
      {versionsRole !== null ? (
        <RoleVersionsDialog
          name={versionsRole.name}
          // The reserved admin role has no editable history; keep rollback hidden.
          readOnly={readOnly || versionsRole.allow_all || versionsRole.name === RESERVED_ADMIN_ROLE}
          onClose={onClose}
        />
      ) : null}
      {deleteName !== null ? (
        <ConfirmDialog
          title="Delete role"
          confirmLabel="Delete role"
          pendingLabel="Deleting"
          isPending={remove.isPending}
          error={remove.isError ? remove.error : undefined}
          onConfirm={() => {
            remove.mutate(deleteName);
          }}
          onClose={onClose}
        >
          <p style={{ margin: 0 }}>
            Delete the role <strong>{deleteName}</strong>? A role still assigned to any principal
            cannot be deleted — reassign its holders first.
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

export interface RolesTabProps {
  readonly readOnly: boolean;
}

export function RolesTab({ readOnly }: RolesTabProps): ReactNode {
  const api = useApi();

  const rolesQuery = useQuery({
    queryKey: rolesKey,
    queryFn: ({ signal }) => api.listRoles(signal),
  });
  const routesQuery = useQuery({
    queryKey: authRoutesKey,
    queryFn: ({ signal }) => api.listAuthRoutes(signal),
  });

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [versionsRole, setVersionsRole] = useState<RoleBody | null>(null);
  const [deleteName, setDeleteName] = useState<string | null>(null);

  if (rolesQuery.isError || routesQuery.isError) {
    const error = rolesQuery.error ?? routesQuery.error;
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => {
          void rolesQuery.refetch();
          void routesQuery.refetch();
        }}
      />
    );
  }
  if (rolesQuery.isPending || routesQuery.isPending) {
    return <Spinner label="Loading roles" />;
  }

  const roles = [...rolesQuery.data].sort((a, b) => a.name.localeCompare(b.name));
  const groups = featureGroupsOf(routesQuery.data);
  const grantableGroups = groups.filter((group) => group.grantable);
  const adminOnlyGroups = groups.filter((group) => !group.grantable && group.hasFenced);

  const selected: RoleBody | null =
    roles.find((role) => role.name === selectedName) ?? roles[0] ?? null;
  const selectedIsAdmin = selected?.allow_all === true || selected?.name === RESERVED_ADMIN_ROLE;

  return (
    <div style={stackStyle}>
      <Card>
        <div style={cardHeaderStyle}>
          <h3 style={headingStyle}>Roles</h3>
          {readOnly ? null : (
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setCreateOpen(true);
              }}
            >
              Create role
            </Button>
          )}
        </div>

        {roles.length === 0 ? (
          <EmptyState title="No roles" description="Create a role to grant per-feature access." />
        ) : (
          <div style={layoutStyle}>
            <div style={roleListStyle} role="listbox" aria-label="Roles">
              {roles.map((role) => {
                const isSelected = selected?.name === role.name;
                return (
                  <button
                    key={role.name}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    style={roleButtonStyle(isSelected)}
                    onClick={() => {
                      setSelectedName(role.name);
                    }}
                  >
                    <span>{role.name}</span>
                    <Badge variant={role.allow_all ? 'warning' : 'neutral'}>
                      {baseTierLabel(role)}
                    </Badge>
                  </button>
                );
              })}
            </div>

            {selected !== null ? (
              <RoleDetailPanel
                role={selected}
                readOnly={readOnly}
                isAdmin={selectedIsAdmin}
                grantableGroups={grantableGroups}
                adminOnlyGroups={adminOnlyGroups}
                onHistory={setVersionsRole}
                onDelete={setDeleteName}
              />
            ) : null}
          </div>
        )}
      </Card>

      <RolesDialogs
        createOpen={createOpen}
        versionsRole={versionsRole}
        deleteName={deleteName}
        readOnly={readOnly}
        onCreated={(name) => {
          setSelectedName(name);
          setCreateOpen(false);
        }}
        onDeleted={(name) => {
          if (selectedName === name) setSelectedName(null);
        }}
        onClose={() => {
          setCreateOpen(false);
          setVersionsRole(null);
          setDeleteName(null);
        }}
      />
    </div>
  );
}
