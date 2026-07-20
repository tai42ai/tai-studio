/**
 * One drop zone in the access-control mapper: a scope, the Unassigned bucket, or
 * the distinguished Public zone. A `useDroppable` keyed by the zone renders its
 * chips, a header (title + item count + an optional trash action), and an
 * optional footer (the per-scope add-route row). The zone highlights while a chip
 * is dragged over it.
 */
import { useDroppable } from '@dnd-kit/core';
import type { CSSProperties, ReactNode } from 'react';

import { ScopeItemChip, type ChipData, type ZoneRef } from './ScopeItemChip';

function zoneDomId(zone: ZoneRef): string {
  switch (zone.kind) {
    case 'scope':
      return `zone-scope-${zone.scopeId}`;
    case 'unassigned':
      return 'zone-unassigned';
    case 'public':
      return 'zone-public';
  }
}

/**
 * The screen-reader name for the zone group, so a reader tabbing through chips can
 * tell which scope / bucket the focused chip currently belongs to (the visual
 * title alone is not associated with the chips).
 */
function zoneAccessibleName(zone: ZoneRef, count: number): string {
  const items = `${String(count)} ${count === 1 ? 'item' : 'items'}`;
  switch (zone.kind) {
    case 'scope':
      return `Scope ${zone.scopeId}, ${items}`;
    case 'unassigned':
      return `Unassigned routes and mounts, ${items}`;
    case 'public':
      return `Public routes, ${items}`;
  }
}

const zoneStyle: CSSProperties = {
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-md)',
  padding: 'var(--tai-space-3)',
  marginBottom: 'var(--tai-space-3)',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-2)',
  marginBottom: 'var(--tai-space-2)',
};

const titleWrapStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
};

const countStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const chipsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
  minHeight: '2rem',
  alignItems: 'flex-start',
};

const emptyNoteStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

export function ScopeZone({
  zone,
  title,
  count,
  chips,
  interactive,
  emptyNote,
  headerAction,
  headerBadge,
  footer,
  onRemoveChip,
  removeLabelOf,
}: {
  readonly zone: ZoneRef;
  readonly title: ReactNode;
  readonly count: number;
  readonly chips: readonly ChipData[];
  readonly interactive: boolean;
  readonly emptyNote?: string;
  readonly headerAction?: ReactNode;
  readonly headerBadge?: ReactNode;
  readonly footer?: ReactNode;
  readonly onRemoveChip?: (data: ChipData) => void;
  readonly removeLabelOf?: (data: ChipData) => string;
}): ReactNode {
  const { setNodeRef, isOver } = useDroppable({ id: zoneDomId(zone), data: { zone } });

  const style: CSSProperties = {
    ...zoneStyle,
    borderColor: isOver ? 'var(--tai-color-primary)' : 'var(--tai-color-border)',
    background: isOver ? 'var(--tai-color-surface-raised)' : 'transparent',
  };

  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={zoneAccessibleName(zone, count)}
      style={style}
      data-zone={zoneDomId(zone)}
      data-drop-over={isOver ? 'true' : undefined}
    >
      <div style={headerStyle}>
        <span style={titleWrapStyle}>
          {headerBadge}
          {title}
          <span style={countStyle}>
            {count} {count === 1 ? 'item' : 'items'}
          </span>
        </span>
        {headerAction}
      </div>
      <div style={chipsStyle}>
        {chips.length === 0 ? (
          <p style={emptyNoteStyle}>{emptyNote ?? 'No items.'}</p>
        ) : (
          chips.map((data) => (
            <ScopeItemChip
              key={data.url}
              data={data}
              interactive={interactive}
              onRemove={onRemoveChip}
              removeLabel={removeLabelOf?.(data)}
            />
          ))
        )}
      </div>
      {footer}
    </div>
  );
}
