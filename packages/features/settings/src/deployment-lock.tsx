/**
 * The lock shown on a value the deployment's own environment sets: the Settings tab
 * field and the Environment tab row both show it, and neither offers the value for
 * editing. A locked Environment row also says that its stored value is not used.
 * Each part takes an `id`, so the locked control names it in its `aria-describedby`.
 */
import { Badge } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

/** The visible text of the lock. */
export const DEPLOYMENT_SET_TEXT = 'Set by the deployment';

/** The note on a locked Environment row: the stored value is ignored. */
export const DEPLOYMENT_ROW_NOTE = "Stored value not used; the deployment's value applies.";

const rowNoteStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

/** The badge a deployment-set field or row wears. */
export function DeploymentSetBadge({ id }: { readonly id: string }): ReactNode {
  return (
    <span id={id}>
      <Badge variant="neutral">{DEPLOYMENT_SET_TEXT}</Badge>
    </span>
  );
}

/** The note beside a locked Environment row's badge. */
export function DeploymentRowNote({ id }: { readonly id: string }): ReactNode {
  return (
    <span id={id} style={rowNoteStyle}>
      {DEPLOYMENT_ROW_NOTE}
    </span>
  );
}
