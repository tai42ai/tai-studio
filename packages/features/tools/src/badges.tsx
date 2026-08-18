/**
 * A tool's DECLARED capability badges (plugin-declared ∪ operator overlay, merged
 * by {@link buildToolViews}). A badge is INFORMATIONAL — it describes what a tool
 * says it touches (e.g. `network`, `filesystem`) — never a gate the server
 * enforces. Every surface renders the same chips under the same tooltip so the
 * label can never be mistaken for a permission.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Badge, BADGES_NOTE, Tooltip } from '@tai42/studio-sdk';

/** The shared informational note, re-exported under this package's local name. */
export { BADGES_NOTE as BADGES_INFORMATIONAL_NOTE };

/** Chips read as one unit, tighter than the row default. */
const badgeGroupStyle: CSSProperties = { gap: 'var(--tai-space-1)' };

/**
 * Read-only badge chips under a tooltip stating they are declared, not enforced.
 * Renders nothing when there are none — a tool with no declared badge shows no row.
 */
export function ToolBadges({ badges }: { readonly badges: readonly string[] }): ReactNode {
  if (badges.length === 0) return null;
  return (
    <Tooltip content={BADGES_NOTE}>
      <span className="tai-row" style={badgeGroupStyle} data-testid="tool-badges">
        {badges.map((badge) => (
          <Badge key={badge} variant="neutral">
            {badge}
          </Badge>
        ))}
      </span>
    </Tooltip>
  );
}
