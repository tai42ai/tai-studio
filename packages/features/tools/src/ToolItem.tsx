/**
 * One tool row: its display label as an `AppLink` setting `?tool=` (preserving the
 * active `?tags=` and `?q=`), the real name shown secondary+mono when a display name
 * overrides it, and — for writers — an Edit affordance opening the overlay dialog.
 */
import { AppLink, Button } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { ToolBadges } from './badges';
import type { ToolView } from './toolView';

/** Push a following flex item to the far edge of its `.tai-row`. */
const spacerStyle = { marginLeft: 'auto' };

export interface ToolItemProps {
  readonly view: ToolView;
  readonly selected: boolean;
  readonly preserveTags: readonly string[];
  readonly preserveQuery: string | undefined;
  readonly canWrite: boolean;
  readonly onEdit: (view: ToolView) => void;
}

export function ToolItem({
  view,
  selected,
  preserveTags,
  preserveQuery,
  canWrite,
  onEdit,
}: ToolItemProps): ReactNode {
  return (
    <div className="tai-row">
      <AppLink
        to="tools"
        search={{
          tool: view.name,
          tags: preserveTags.length > 0 ? [...preserveTags] : undefined,
          q: preserveQuery,
        }}
        aria-label={`Open tool ${view.name}`}
        aria-current={selected ? 'page' : undefined}
        className="tai-nav-item"
      >
        <span className={view.hasCustomName ? undefined : 'tai-mono'}>{view.displayName}</span>
        {view.hasCustomName ? <span className="tai-muted tai-mono">{view.name}</span> : null}
      </AppLink>
      <ToolBadges badges={view.badges} />
      {canWrite ? (
        <>
          <div style={spacerStyle} />
          <Button
            variant="ghost"
            aria-label={`Edit tool ${view.name}`}
            onClick={() => {
              onEdit(view);
            }}
          >
            Edit
          </Button>
        </>
      ) : null}
    </div>
  );
}
