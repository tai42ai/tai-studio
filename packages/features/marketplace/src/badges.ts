/**
 * The content-summary badge policy for a marketplace search row. A row carries a
 * `groups` summary (logical item groups) and a `kinds` summary (its UNGROUPED
 * items, per kind, with their names). `listingBadges` folds both into the ordered
 * label list the listing card renders, applying the catalog policy below.
 */
import type { MarketplaceSearchRow } from '@tai42/api-client';

/**
 * Kinds whose items are named individually rather than counted: the badge shows
 * each item's name (the kind is implied by context), never a `{kind} ×{count}`.
 */
const LISTED_KINDS = new Set(['channel', 'webhook-verifier']);

/** Kinds the browser never surfaces as badges (internal plumbing). */
const HIDDEN_KINDS = new Set(['router']);

/** `{label}` for a single item, `{label} ×{count}` above one. */
function countLabel(label: string, count: number): string {
  return count > 1 ? `${label} ×${count.toLocaleString('en-US')}` : label;
}

/**
 * The label for an install-provenance `source`: a descriptor plugin resolves from
 * `spec` (a `tai-plugin.yml`, no package), which reads as "descriptor" on every
 * surface; every other source (`pypi`, `github`, …) shows as given.
 */
export function sourceLabel(source: string): string {
  return source === 'spec' ? 'descriptor' : source;
}

/**
 * The ordered badge labels for one search row under the catalog policy: groups
 * first (`{name}` / `{name} ×{count}`), then ungrouped kinds — a LISTED kind as
 * each of its item names, a HIDDEN kind omitted, any other kind as a counted kind
 * badge. When the policy would hide every badge yet the row carries kinds, the
 * fallback re-emits every kind as a count badge so a non-empty listing is never
 * blank; on data honoring the wire contract those are exactly the hidden kinds.
 */
export function listingBadges(row: MarketplaceSearchRow): string[] {
  const badges: string[] = [];
  for (const group of row.groups) {
    badges.push(countLabel(group.name, group.count));
  }
  for (const entry of row.kinds) {
    if (HIDDEN_KINDS.has(entry.kind)) continue;
    if (LISTED_KINDS.has(entry.kind)) {
      badges.push(...entry.names);
      continue;
    }
    badges.push(countLabel(entry.kind, entry.count));
  }
  if (badges.length === 0 && row.kinds.length > 0) {
    for (const entry of row.kinds) {
      badges.push(countLabel(entry.kind, entry.count));
    }
  }
  return badges;
}
