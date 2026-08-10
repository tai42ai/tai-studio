/**
 * `EntityCardGrid` — the card-view container every entity screen shares (the card
 * half of {@link ViewToggle}). It lays its children out on the design system's
 * responsive `.tai-grid-cards` track (three columns, dropping to two then one down
 * the responsive bands); each child is expected to be an interactive `Card`. Living
 * in the SDK keeps the tools screen and the flows page on one identical grid.
 */
import type { ReactNode } from 'react';

export interface EntityCardGridProps {
  readonly children: ReactNode;
  /** The grid's accessible name (e.g. "Tools"). Rendered as a `list` for AT. */
  readonly 'aria-label': string;
}

export function EntityCardGrid({
  children,
  'aria-label': ariaLabel,
}: EntityCardGridProps): ReactNode {
  return (
    <div className="tai-grid-cards" role="list" aria-label={ariaLabel}>
      {children}
    </div>
  );
}
