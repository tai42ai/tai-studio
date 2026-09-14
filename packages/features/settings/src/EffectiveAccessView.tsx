/**
 * The read-only effective-access view for the SAVED role: the per-group level the
 * gate reads. An `allow_all` role reaches everything (the gate skips the per-tag
 * pass), so it shows a full-access note; otherwise each grantable group shows its
 * effective level. The base-tier ceiling that can further cap a grant is the role's
 * tier badge — surfaced, not recomputed here.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Badge, Card } from '@tai42/studio-sdk';
import type { RoleBody } from '@tai42/api-client';

import { baseTierLabel, effectiveLevelsOf, type FeatureGroup } from './role-grants';

const subHeadingStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-2)',
  fontSize: 'var(--tai-text-md)',
  color: 'var(--tai-color-text)',
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

export function EffectiveAccessView({
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
