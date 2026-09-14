/**
 * The tag glue every explorer screen shares: the untagged sentinel, the tag
 * vocabulary builder, and the OR-match rule — one vocabulary/untagged/OR
 * definition rather than a copy per screen.
 */

/** Reserved filter token for items carrying NO tag; namespaced so it never
 *  collides with a real tag. */
export const UNTAGGED_TOKEN = '__untagged__';

export interface TagVocabularyEntry {
  readonly token: string;
  readonly label: string;
  readonly count: number;
}

/** The tag vocabulary over `items`, name-sorted, plus an untagged pseudo-tag
 *  (labelled `untaggedLabel`) when any item is untagged; a selected token whose
 *  items vanished still appears (count 0) so it can be cleared. */
export function buildTagVocabulary<T>(
  items: readonly T[],
  getTags: (item: T) => readonly string[],
  selectedTags: readonly string[],
  untaggedLabel: string,
): TagVocabularyEntry[] {
  const counts = new Map<string, number>();
  let untagged = 0;
  for (const item of items) {
    const tags = getTags(item);
    if (tags.length === 0) {
      untagged += 1;
      continue;
    }
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const vocabulary: TagVocabularyEntry[] = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => ({ token: label, label, count }));
  if (untagged > 0) {
    vocabulary.push({ token: UNTAGGED_TOKEN, label: untaggedLabel, count: untagged });
  }
  for (const token of selectedTags) {
    if (!vocabulary.some((entry) => entry.token === token)) {
      vocabulary.push({
        token,
        label: token === UNTAGGED_TOKEN ? untaggedLabel : token,
        count: 0,
      });
    }
  }
  return vocabulary;
}

/** OR semantics: an empty selection matches everything; otherwise an item
 *  matches when it carries any selected tag, or is untagged and UNTAGGED_TOKEN
 *  is selected. */
export function matchesSelectedTags(
  itemTags: readonly string[],
  selected: ReadonlySet<string>,
): boolean {
  if (selected.size === 0) return true;
  if (itemTags.length === 0) return selected.has(UNTAGGED_TOKEN);
  return itemTags.some((tag) => selected.has(tag));
}
