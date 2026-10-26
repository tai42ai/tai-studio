/**
 * The scope choice for the create and edit key dialogs: an optional "Full access
 * (all scopes)" box that grants the universal scope, then a row of checkboxes for the
 * deployment's individual scopes. While Full access is chosen the individual scopes
 * are moot, so they are hidden and a warning states what the key holds.
 */
import { AlertTriangleIcon, Checkbox } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { badgeRowStyle, fullAccessWarningStyle } from './api-keys-styles';

export const FULL_ACCESS_LABEL = 'Full access (all scopes)';

export const FULL_ACCESS_WARNING =
  'This key has every scope, including scopes added later. It reaches no further than its ' +
  "owner's access. If the owner is an administrator and the key has no condition, the key is " +
  "an administrator too: it can list, edit, and revoke other owners' keys.";

export function ScopePicker({
  scopeIds,
  selected,
  disabled,
  onToggle,
  fullAccess,
  fullAccessAvailable,
  onFullAccessChange,
}: {
  readonly scopeIds: readonly string[];
  readonly selected: ReadonlySet<string>;
  readonly disabled: boolean;
  readonly onToggle: (scopeId: string, next: boolean) => void;
  /** Whether the key is granted every scope. */
  readonly fullAccess: boolean;
  /** Whether the Full access box is offered (the caller may grant it, or the key has it). */
  readonly fullAccessAvailable: boolean;
  readonly onFullAccessChange: (next: boolean) => void;
}): ReactNode {
  return (
    <>
      {fullAccessAvailable ? (
        <Checkbox
          label={FULL_ACCESS_LABEL}
          checked={fullAccess}
          disabled={disabled}
          onCheckedChange={onFullAccessChange}
        />
      ) : null}
      {fullAccess ? (
        <p role="status" style={fullAccessWarningStyle}>
          <AlertTriangleIcon />
          <span>{FULL_ACCESS_WARNING}</span>
        </p>
      ) : scopeIds.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
          No scopes are defined yet.
        </p>
      ) : (
        <div style={badgeRowStyle}>
          {scopeIds.map((scopeId) => (
            <Checkbox
              key={scopeId}
              label={scopeId}
              checked={selected.has(scopeId)}
              disabled={disabled}
              onCheckedChange={(next) => {
                onToggle(scopeId, next);
              }}
            />
          ))}
        </div>
      )}
    </>
  );
}
