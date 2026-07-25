/**
 * A multi-select of scope ids rendered as a row of checkboxes, used by the
 * create and edit key dialogs to pick the scopes a key is granted.
 */
import type { ReactNode } from 'react';
import { Checkbox } from '@tai42/studio-sdk';

import { badgeRowStyle } from './api-keys-common';

export function ScopePicker({
  scopeIds,
  selected,
  disabled,
  onToggle,
}: {
  readonly scopeIds: readonly string[];
  readonly selected: ReadonlySet<string>;
  readonly disabled: boolean;
  readonly onToggle: (scopeId: string, next: boolean) => void;
}): ReactNode {
  if (scopeIds.length === 0) {
    return <p style={{ color: 'var(--tai-color-text-muted)' }}>No scopes are defined yet.</p>;
  }
  return (
    <div style={badgeRowStyle} role="group" aria-label="Scopes">
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
  );
}
