/** `ToolPicker`'s capability badges for the selected tool, and the note every badge
 *  surface carries. */
import type { ReactNode } from 'react';

import { Badge } from './badge';
import { Tooltip } from './tooltip';

/** The shared informational note every badge surface carries: declared, never enforced. */
export const BADGES_NOTE =
  'Declared capability labels — informational only. They describe what the tool touches; the server never enforces them.';

/** The selected tool's DECLARED capability badges, read-only and informational.
 *  Renders nothing unless the selected tool carries badges. */
export function SelectedToolBadges({
  value,
  badgesByTool,
  idPrefix,
}: {
  readonly value: string | null;
  readonly badgesByTool: Readonly<Record<string, readonly string[]>> | undefined;
  readonly idPrefix: string;
}): ReactNode {
  if (value === null || badgesByTool === undefined || (badgesByTool[value]?.length ?? 0) === 0) {
    return null;
  }
  return (
    <Tooltip content={BADGES_NOTE}>
      <span
        className="tai-row"
        data-testid={`${idPrefix}-badges`}
        style={{ gap: 'var(--tai-space-1)' }}
      >
        {(badgesByTool[value] ?? []).map((badge) => (
          <Badge key={badge} variant="neutral">
            {badge}
          </Badge>
        ))}
      </span>
    </Tooltip>
  );
}
