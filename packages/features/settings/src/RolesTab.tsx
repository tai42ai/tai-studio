/**
 * The Roles tab: the definition surface for editable per-tag RBAC roles.
 *
 * A role is two layers. Layer 1 — the base-tier ceiling (`base_tier` + its seeded
 * jq `condition`, or `allow_all` for the reserved admin) — is READ-ONLY here: it is
 * shown as a security-tier badge, never an editable jq field (there is no raw-jq
 * authoring surface). Layer 2 — the editable per-tag `grants` map — is edited as a
 * per-feature-GROUP TRI-STATE (`none`/`read`/`write`), one selector per grantable
 * feature tag. The feature groups are derived from the route catalog
 * (`listAuthRoutes`): a route's `tags` name its feature group and its `action`
 * classifies it. A group with at least one `read`/`write` route is GRANTABLE (it
 * gets a tri-state); a route whose `action` is `fenced`/`secret` is ADMIN-ONLY and
 * never grantable — a purely-fenced group is shown with an admin-only marker and NO
 * grant control, exactly mirroring the server, which rejects a grant on such a tag.
 *
 * The reserved `admin` role (`allow_all`) is shown but its grant editor is disabled
 * and it cannot be deleted — mirroring the server guard so the UI never sends a
 * request the gate would reject.
 *
 * The effective-access view is a READ-ONLY projection of the SAVED role's grants
 * onto the grantable feature groups — the same shared answer the gate reads (the
 * per-tag level; a purely-fenced group is never grantable, so it reads no access).
 * It is NOT a client-side re-derivation of the gate decision: the base-tier ceiling
 * that further caps a grant (a `viewer` base serves reads only) is surfaced as the
 * role's tier badge, not recomputed here.
 *
 * This tab reads `GET /api/auth/roles` (an admin-only `secret` route), so it renders
 * only for a caller whose projection reaches it — SettingsPage gates its visibility
 * the same way it gates the config/backup tabs. Every server-supplied string renders
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
  Field,
  RadioGroup,
  Spinner,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { AuthRoute, GrantLevel, RoleBody, RoleGrants } from '@tai42/api-client';

import { authRoutesKey, rolesKey, roleVersionsKey } from './keys';
import { CreateRoleDialog } from './CreateRoleDialog';
import { RoleVersionsDialog } from './RoleVersionsDialog';

// -- pure helpers (unit-tested directly) -------------------------------------

/** The reserved permanent role; its grant map is un-editable and it is undeletable. */
export const RESERVED_ADMIN_ROLE = 'admin';

/** The tri-state grant levels, low→high — the selector options and the display order. */
export const GRANT_LEVELS: readonly GrantLevel[] = ['none', 'read', 'write'];

/** Whether a route's action class is GRANTABLE (a per-tag level opens it). */
export function isGrantableAction(action: AuthRoute['action']): boolean {
  return action === 'read' || action === 'write';
}

/** Whether a route's action class is ADMIN-ONLY (fenced/secret; never grantable). */
export function isFencedAction(action: AuthRoute['action']): boolean {
  return action === 'fenced' || action === 'secret';
}

/** One feature group: a tag, the routes that carry it, and its grantability. */
export interface FeatureGroup {
  readonly tag: string;
  readonly routes: readonly AuthRoute[];
  /** At least one route under the tag is `read`/`write` — the tag gets a tri-state. */
  readonly grantable: boolean;
  /** At least one route under the tag is `fenced`/`secret` — those are admin-only. */
  readonly hasFenced: boolean;
}

/**
 * Group the route catalog into feature groups keyed by `tags`. A route joins every
 * one of its tags' groups; a route carrying no tags (an unregistered/ungated path)
 * contributes nothing. Groups are sorted by tag; each group's routes keep a stable
 * (method, path) order so the read-only route detail renders deterministically.
 */
export function featureGroupsOf(routes: readonly AuthRoute[]): FeatureGroup[] {
  const byTag = new Map<string, AuthRoute[]>();
  for (const route of routes) {
    for (const tag of route.tags) {
      const list = byTag.get(tag) ?? [];
      list.push(route);
      byTag.set(tag, list);
    }
  }
  return [...byTag.entries()]
    .map(([tag, groupRoutes]): FeatureGroup => {
      const sorted = [...groupRoutes].sort(
        (a, b) => a.path.localeCompare(b.path) || a.methods.join().localeCompare(b.methods.join()),
      );
      return {
        tag,
        routes: sorted,
        grantable: sorted.some((route) => isGrantableAction(route.action)),
        hasFenced: sorted.some((route) => isFencedAction(route.action)),
      };
    })
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * The role's effective level on each grantable feature group — the SAME per-tag
 * answer the gate reads: a granted level, or `none` when the role names no level
 * for the group (fail-closed; a brand-new group defaults here). An `allow_all`
 * (admin) role is not level-governed — it reaches everything — so this is not
 * meaningful for it (the caller shows a full-access note instead).
 */
export function effectiveLevelsOf(
  grants: RoleGrants,
  grantableTags: readonly string[],
): Record<string, GrantLevel> {
  const levels: Record<string, GrantLevel> = {};
  for (const tag of grantableTags) levels[tag] = grants[tag] ?? 'none';
  return levels;
}

/** The security-tier badge text for a role's read-only base-tier ceiling. */
export function baseTierLabel(role: Pick<RoleBody, 'allow_all' | 'base_tier'>): string {
  if (role.allow_all) return 'admin — full';
  if (role.base_tier === 'editor') return 'editor base';
  if (role.base_tier === 'viewer') return 'viewer base';
  return role.base_tier === null ? 'custom base' : `${role.base_tier} base`;
}

/** Whether two grant maps are equal over the given tags (the save dirty check). */
function grantsEqual(a: RoleGrants, b: RoleGrants, tags: readonly string[]): boolean {
  return tags.every((tag) => (a[tag] ?? 'none') === (b[tag] ?? 'none'));
}

/**
 * A stable signature of a role's persisted grant map — it changes whenever the stored
 * grants change (a save, or an external rollback that re-points the role under the same
 * name). The grant editor re-seeds its draft from the new baseline whenever it moves,
 * so a rollback is never silently re-PUT away with a pre-rollback draft.
 */
function grantsSignature(grants: RoleGrants): string {
  return Object.entries(grants)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, level]) => `${tag}=${level}`)
    .join('&');
}

// -- styles ------------------------------------------------------------------

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

const subHeadingStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-2)',
  fontSize: 'var(--tai-text-md)',
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

const detailStyle: CSSProperties = {
  flex: '1 1 22rem',
  minWidth: '18rem',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
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

const groupStyle: CSSProperties = {
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-md)',
  padding: 'var(--tai-space-3)',
  marginBottom: 'var(--tai-space-3)',
};

const groupHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  marginBottom: 'var(--tai-space-2)',
};

const routeListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 'var(--tai-space-2) 0 0',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
};

const routeRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const noteStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const effectiveRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-2)',
  padding: 'var(--tai-space-1) 0',
  borderBottom: '1px solid var(--tai-color-border)',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
  alignItems: 'center',
};

// -- action-class badge ------------------------------------------------------

/** The badge variant + label for a route's action class in the read-only detail. */
function actionBadge(action: AuthRoute['action']): ReactNode {
  switch (action) {
    case 'read':
      return <Badge variant="neutral">read</Badge>;
    case 'write':
      return <Badge variant="primary">write</Badge>;
    case 'fenced':
      return <Badge variant="warning">admin-only</Badge>;
    case 'secret':
      return <Badge variant="warning">sensitive — admin only</Badge>;
    case null:
      return null;
  }
}

/** The read-only route detail under a feature group: each route's method + action. */
function RouteDetail({ routes }: { readonly routes: readonly AuthRoute[] }): ReactNode {
  return (
    <ul style={routeListStyle}>
      {routes.map((route) => (
        <li key={`${route.methods.join(',')} ${route.path}`} style={routeRowStyle}>
          <span className="tai-mono">
            {route.methods.join(', ')} {route.path}
          </span>
          {actionBadge(route.action)}
        </li>
      ))}
    </ul>
  );
}

// -- grant editor ------------------------------------------------------------

/**
 * The per-role grant editor: a tri-state selector per GRANTABLE feature group, the
 * admin-only (purely-fenced) groups listed read-only below, and a Save that persists
 * the draft grant map via `updateRole`. Keyed by role name in the parent, so
 * switching roles remounts and re-seeds the draft from the selected role's grants.
 *
 * A change to THIS role's stored grants — its own save, or an external rollback —
 * re-seeds the draft DURING RENDER (React's adjust-state-on-prop-change pattern)
 * instead. This editor is what writes those grants, so a remount keyed on them
 * tears the editor down the instant its own Save lands, dropping the keyboard
 * caret from the Save button onto `document.body` (WCAG 2.4.3).
 */
function RoleGrantEditor({
  role,
  grantableGroups,
  adminOnlyGroups,
  disabled,
}: {
  readonly role: RoleBody;
  readonly grantableGroups: readonly FeatureGroup[];
  readonly adminOnlyGroups: readonly FeatureGroup[];
  readonly disabled: boolean;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const grantableTags = grantableGroups.map((group) => group.tag);
  const [draft, setDraft] = useState<RoleGrants>(() =>
    effectiveLevelsOf(role.grants, grantableTags),
  );

  // The stored baseline the draft was seeded from; a move re-seeds it.
  const baseline = grantsSignature(effectiveLevelsOf(role.grants, grantableTags));
  const [seededFrom, setSeededFrom] = useState(baseline);
  if (seededFrom !== baseline) {
    setSeededFrom(baseline);
    setDraft(effectiveLevelsOf(role.grants, grantableTags));
  }

  const save = useMutation({
    mutationFn: (grants: RoleGrants) => api.updateRole(role.name, { grants }),
    onSuccess: (updated) => {
      // The saved body is the new baseline: re-seed the draft so the dirty check
      // clears at once rather than waiting on the list refetch, and refresh the
      // list (the effective-access view reads the same key).
      setDraft(effectiveLevelsOf(updated.grants, grantableTags));
      void queryClient.invalidateQueries({ queryKey: rolesKey });
      void queryClient.invalidateQueries({ queryKey: roleVersionsKey(role.name) });
    },
  });

  const dirty = !grantsEqual(draft, role.grants, grantableTags);
  const editable = !disabled && !save.isPending;

  return (
    <div>
      <h4 style={subHeadingStyle}>Feature access</h4>
      {grantableGroups.length === 0 ? (
        <p style={noteStyle}>No grantable feature groups are registered.</p>
      ) : (
        grantableGroups.map((group) => (
          <div key={group.tag} style={groupStyle}>
            <Field label={group.tag} group>
              <RadioGroup
                options={GRANT_LEVELS.map((level) => ({ value: level, label: level }))}
                value={draft[group.tag] ?? 'none'}
                disabled={!editable}
                onValueChange={(next) => {
                  setDraft((current) => ({ ...current, [group.tag]: next as GrantLevel }));
                }}
              />
            </Field>
            <RouteDetail routes={group.routes} />
          </div>
        ))
      )}

      {adminOnlyGroups.length > 0 ? (
        <>
          <h4 style={subHeadingStyle}>Admin-only feature groups</h4>
          <p style={noteStyle}>
            These groups carry only fenced or sensitive routes — the access gate reserves them for
            admins, so no per-role level can open them.
          </p>
          {adminOnlyGroups.map((group) => (
            <div key={group.tag} style={groupStyle}>
              <div style={groupHeaderStyle}>
                <strong>{group.tag}</strong>
                <Badge variant="warning">admin-only</Badge>
              </div>
              <RouteDetail routes={group.routes} />
            </div>
          ))}
        </>
      ) : null}

      {save.isError ? (
        <div style={{ marginTop: 'var(--tai-space-2)' }}>
          <ErrorState message={errorMessage(save.error)} />
        </div>
      ) : null}

      {disabled ? (
        <p style={noteStyle}>
          {role.allow_all
            ? 'The reserved admin role reaches every feature group and cannot be edited.'
            : 'Editing is disabled in read-only mode.'}
        </p>
      ) : (
        <div style={{ marginTop: 'var(--tai-space-2)' }}>
          <Button
            type="button"
            variant="primary"
            disabled={!dirty || save.isPending}
            onClick={() => {
              save.mutate(draft);
            }}
          >
            {save.isPending ? <Spinner label="Saving" /> : null}
            Save grants
          </Button>
        </div>
      )}
    </div>
  );
}

// -- effective-access view ---------------------------------------------------

/**
 * The read-only effective-access view for the SAVED role: the per-group level the
 * gate reads. An `allow_all` role reaches everything (the gate skips the per-tag
 * pass), so it shows a full-access note; otherwise each grantable group shows its
 * effective level. The base-tier ceiling that can further cap a grant is the role's
 * tier badge — surfaced, not recomputed here.
 */
function EffectiveAccessView({
  role,
  grantableGroups,
}: {
  readonly role: RoleBody;
  readonly grantableGroups: readonly FeatureGroup[];
}): ReactNode {
  const levels = effectiveLevelsOf(
    role.grants,
    grantableGroups.map((group) => group.tag),
  );
  return (
    <Card>
      <h4 style={subHeadingStyle}>Effective access</h4>
      {role.allow_all ? (
        <p style={noteStyle}>
          The admin role reaches every feature group — full access, un-lockable.
        </p>
      ) : (
        <>
          <p style={noteStyle}>
            The per-group level the gate enforces. The{' '}
            <Badge variant="neutral">{baseTierLabel(role)}</Badge> ceiling can cap a grant further
            (a viewer base serves reads only).
          </p>
          <div style={{ marginTop: 'var(--tai-space-2)' }}>
            {grantableGroups.length === 0 ? (
              <p style={noteStyle}>No grantable feature groups are registered.</p>
            ) : (
              grantableGroups.map((group) => (
                <div key={group.tag} style={effectiveRowStyle}>
                  <span>{group.tag}</span>
                  <Badge variant={levels[group.tag] === 'none' ? 'neutral' : 'primary'}>
                    {levels[group.tag]}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Card>
  );
}

// -- main --------------------------------------------------------------------

export interface RolesTabProps {
  readonly readOnly: boolean;
}

export function RolesTab({ readOnly }: RolesTabProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

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

  const remove = useMutation({
    mutationFn: (name: string) => api.deleteRole(name),
    onSuccess: (_result, name) => {
      if (selectedName === name) setSelectedName(null);
      setDeleteName(null);
      void queryClient.invalidateQueries({ queryKey: rolesKey });
    },
  });

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
              <div style={detailStyle}>
                <div style={cardHeaderStyle}>
                  <div style={groupHeaderStyle}>
                    <h3 style={headingStyle}>{selected.name}</h3>
                    <Badge variant={selected.allow_all ? 'warning' : 'neutral'}>
                      {baseTierLabel(selected)}
                    </Badge>
                  </div>
                  <div style={actionsStyle}>
                    <Button
                      type="button"
                      aria-label={`Version history for ${selected.name}`}
                      onClick={() => {
                        setVersionsRole(selected);
                      }}
                    >
                      History
                    </Button>
                    {/* The reserved admin role is undeletable — mirror the server
                        guard so the UI never sends a rejected request. */}
                    {readOnly || selectedIsAdmin ? null : (
                      <Button
                        type="button"
                        variant="danger"
                        aria-label={`Delete role ${selected.name}`}
                        onClick={() => {
                          setDeleteName(selected.name);
                        }}
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>

                {selected.description ? <p style={noteStyle}>{selected.description}</p> : null}

                {/* Keyed on the role NAME only. A different role is a different
                    subject, so a remount that also clears the previous role's save
                    error is right; a change to the SELECTED role's stored grants is
                    not, and the editor re-seeds itself for that instead. */}
                <RoleGrantEditor
                  key={selected.name}
                  role={selected}
                  grantableGroups={grantableGroups}
                  adminOnlyGroups={adminOnlyGroups}
                  disabled={readOnly || selectedIsAdmin}
                />

                <EffectiveAccessView role={selected} grantableGroups={grantableGroups} />
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {createOpen ? (
        <CreateRoleDialog
          onCreated={(name) => {
            setSelectedName(name);
            setCreateOpen(false);
          }}
          onClose={() => {
            setCreateOpen(false);
          }}
        />
      ) : null}
      {versionsRole !== null ? (
        <RoleVersionsDialog
          name={versionsRole.name}
          // The reserved admin role has no editable history; keep rollback hidden.
          readOnly={readOnly || versionsRole.allow_all || versionsRole.name === RESERVED_ADMIN_ROLE}
          onClose={() => {
            setVersionsRole(null);
          }}
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
          onClose={() => {
            setDeleteName(null);
          }}
        >
          <p style={{ margin: 0 }}>
            Delete the role <strong>{deleteName}</strong>? A role still assigned to any principal
            cannot be deleted — reassign its holders first.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
