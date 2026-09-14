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
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ErrorState,
  Field,
  RadioGroup,
  Spinner,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { GrantLevel, RoleBody, RoleGrants } from '@tai42/api-client';

import { rolesKey, roleVersionsKey } from './keys';
import {
  GRANT_LEVELS,
  effectiveLevelsOf,
  grantsEqual,
  grantsSignature,
  type FeatureGroup,
} from './role-grants';
import { RouteDetail } from './RouteDetail';

const subHeadingStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-2)',
  fontSize: 'var(--tai-text-md)',
  color: 'var(--tai-color-text)',
};

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

const noteStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

export function RoleGrantEditor({
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
                disabled={disabled || save.isPending}
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
