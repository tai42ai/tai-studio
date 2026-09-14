/**
 * The screen-reader drag announcements for the access-control mapper, and the
 * zone-naming helper they read.
 */
import type { Announcements, Over } from '@dnd-kit/core';

import type { ZoneRef } from './ScopeItemChip';

export function describeZone(zone: ZoneRef): string {
  switch (zone.kind) {
    case 'scope':
      return `scope ${zone.scopeId}`;
    case 'unassigned':
      return 'the Unassigned bucket';
    case 'public':
      return 'the Public zone';
  }
}

function describeOver(over: Over): string {
  const zone = (over.data.current as { zone?: ZoneRef } | undefined)?.zone;
  return zone === undefined ? String(over.id) : describeZone(zone);
}

export const announcements: Announcements = {
  onDragStart: ({ active }) =>
    `Picked up ${String(active.id)}. Use the arrow keys to move it over a scope, the Public zone, or the Unassigned bucket, then press space to drop.`,
  onDragOver: ({ active, over }) =>
    over === null
      ? `${String(active.id)} is no longer over a drop zone.`
      : `${String(active.id)} is over ${describeOver(over)}.`,
  onDragEnd: ({ active, over }) =>
    over === null
      ? `Dropped ${String(active.id)}. It was not over a drop zone, so nothing changed.`
      : `Dropped ${String(active.id)} on ${describeOver(over)}.`,
  onDragCancel: ({ active }) => `Cancelled dragging ${String(active.id)}.`,
};
