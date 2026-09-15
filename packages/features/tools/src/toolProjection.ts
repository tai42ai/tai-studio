/**
 * Narrow the merged tool views to what the caller may see. A scoped session sees only
 * the tools its projection lists; a full session — and any not-yet-ready projection —
 * sees the whole catalog, with the server the final authority on every run.
 */
import { type CapabilityState, isFullProjection } from '@tai42/studio-sdk';

import type { ToolView } from './toolView';

export function projectedTools(views: readonly ToolView[], state: CapabilityState): ToolView[] {
  if (state.status !== 'ready' || isFullProjection(state.projection)) return [...views];
  const allowed = new Set(state.projection.tools);
  return views.filter((view) => allowed.has(view.name));
}
