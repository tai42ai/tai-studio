/**
 * The detail panel for the selected role: its identity + tier badge, the History
 * and (non-admin) Delete actions, the editable grant editor, and the read-only
 * effective-access view.
 */
import type { RoleBody } from '@tai42/api-client';
import { Badge, Button } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import { EffectiveAccessView } from './EffectiveAccessView';
import { baseTierLabel, type FeatureGroup } from './role-grants';
import { RoleGrantEditor } from './RoleGrantEditor';

const detailStyle: CSSProperties = {
  flex: '1 1 22rem',
  minWidth: '18rem',
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

const groupHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  marginBottom: 'var(--tai-space-2)',
};

const actionsStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
  alignItems: 'center',
};

const noteStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

export function RoleDetailPanel({
  role,
  readOnly,
  isAdmin,
  grantableGroups,
  adminOnlyGroups,
  onHistory,
  onDelete,
}: {
  readonly role: RoleBody;
  readonly readOnly: boolean;
  readonly isAdmin: boolean;
  readonly grantableGroups: readonly FeatureGroup[];
  readonly adminOnlyGroups: readonly FeatureGroup[];
  readonly onHistory: (role: RoleBody) => void;
  readonly onDelete: (name: string) => void;
}): ReactNode {
  return (
    <div style={detailStyle}>
      <div style={cardHeaderStyle}>
        <div style={groupHeaderStyle}>
          <h3 style={headingStyle}>{role.name}</h3>
          <Badge variant={role.allow_all ? 'warning' : 'neutral'}>{baseTierLabel(role)}</Badge>
        </div>
        <div style={actionsStyle}>
          <Button
            type="button"
            aria-label={`Version history for ${role.name}`}
            onClick={() => {
              onHistory(role);
            }}
          >
            History
          </Button>
          {/* The reserved admin role is undeletable — mirror the server guard so the
              UI never sends a rejected request. */}
          {readOnly || isAdmin ? null : (
            <Button
              type="button"
              variant="danger"
              aria-label={`Delete role ${role.name}`}
              onClick={() => {
                onDelete(role.name);
              }}
            >
              Delete
            </Button>
          )}
        </div>
      </div>

      {role.description ? <p style={noteStyle}>{role.description}</p> : null}

      {/* Keyed on the role NAME only. A different role is a different subject, so a
          remount that also clears the previous role's save error is right; a change
          to the SELECTED role's stored grants is not, and the editor re-seeds itself
          for that instead. */}
      <RoleGrantEditor
        key={role.name}
        role={role}
        grantableGroups={grantableGroups}
        adminOnlyGroups={adminOnlyGroups}
        disabled={readOnly || isAdmin}
      />

      <EffectiveAccessView role={role} grantableGroups={grantableGroups} />
    </div>
  );
}
