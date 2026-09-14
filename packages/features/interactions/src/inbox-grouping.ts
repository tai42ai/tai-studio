/**
 * Fold the flat inbox list into groups keyed by `group_id`, newest group first and
 * each group's questions newest-first, with each group's pending count.
 */
import type { StreamInteraction } from '@tai42/studio-sdk';

export interface InteractionGroup {
  readonly groupId: string;
  readonly items: readonly StreamInteraction[];
  readonly pending: number;
  /** The newest question's `created_at` in ms — the group's sort key. */
  readonly newest: number;
}

/** Milliseconds of an interaction's `created_at`; an unparseable stamp sorts oldest. */
function createdMs(interaction: StreamInteraction): number {
  const ms = new Date(interaction.created_at).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Fold the flat list into groups keyed by `group_id`. Group order and the order
 * within each group are both newest-first (by `created_at`); the per-group pending
 * count is the unanswered questions in that group.
 */
export function groupInteractions(interactions: readonly StreamInteraction[]): InteractionGroup[] {
  const order: string[] = [];
  const byGroup = new Map<string, StreamInteraction[]>();
  // Only a non-empty group_id shared by 2+ questions is a real group; an empty or
  // absent group_id is ungrouped, so key it on the interaction_id to keep each such
  // question standalone rather than folding unrelated ones under one blank id.
  for (const interaction of interactions) {
    const key = interaction.group_id.length > 0 ? interaction.group_id : interaction.interaction_id;
    const existing = byGroup.get(key);
    if (existing === undefined) {
      byGroup.set(key, [interaction]);
      order.push(key);
    } else {
      existing.push(interaction);
    }
  }
  const groups = order.map((groupId): InteractionGroup => {
    const items = [...(byGroup.get(groupId) ?? [])].sort((a, b) => createdMs(b) - createdMs(a));
    return {
      groupId,
      items,
      pending: items.filter((item) => !item.answered).length,
      newest: items.reduce((max, item) => Math.max(max, createdMs(item)), 0),
    };
  });
  // Newest group first, keyed on each group's newest question.
  return groups.sort((a, b) => b.newest - a.newest);
}

/** The count label a group header shows: its unanswered questions of its total. */
export function groupPendingLabel(group: InteractionGroup): string {
  const total = group.items.length;
  return group.pending > 0
    ? `${String(group.pending)} of ${String(total)} pending`
    : 'All answered';
}
