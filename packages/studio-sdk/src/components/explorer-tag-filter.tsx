/**
 * The explorer's tag filter row: a togglable chip per vocabulary entry, with the
 * unselected chips beyond the cap collapsed into a static "+N more" count.
 */
import type { ReactNode } from 'react';

import type { TagVocabularyEntry } from './explorer-tags';

/** A togglable tag chip; `aria-pressed` reflects whether the tag filters the list. */
function TagChip({
  entry,
  active,
  onToggle,
}: {
  readonly entry: TagVocabularyEntry;
  readonly active: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className="tai-chip"
      aria-pressed={active}
      aria-label={`${entry.label} (${String(entry.count)})`}
      onClick={onToggle}
    >
      <span>{entry.label}</span>
      <span>{entry.count}</span>
    </button>
  );
}

/** The filter row: every selected chip plus as many unselected chips as fit under
 *  the cap, with the remainder collapsed into a STATIC "+N more" count. An unset
 *  cap shows every chip. */
export function TagFilterRow({
  vocabulary,
  selectedSet,
  onToggle,
  filterLabel,
  maxVisibleTags,
}: {
  readonly vocabulary: readonly TagVocabularyEntry[];
  readonly selectedSet: ReadonlySet<string>;
  readonly onToggle: (token: string) => void;
  readonly filterLabel: string;
  readonly maxVisibleTags: number | undefined;
}): ReactNode {
  const visible: TagVocabularyEntry[] = [];
  let hidden = 0;
  let unselectedShown = 0;
  for (const entry of vocabulary) {
    if (selectedSet.has(entry.token)) {
      visible.push(entry);
    } else if (maxVisibleTags === undefined || unselectedShown < maxVisibleTags) {
      visible.push(entry);
      unselectedShown += 1;
    } else {
      hidden += 1;
    }
  }

  return (
    <div role="group" aria-label={filterLabel} className="tai-row">
      {visible.map((entry) => (
        <TagChip
          key={entry.token}
          entry={entry}
          active={selectedSet.has(entry.token)}
          onToggle={() => {
            onToggle(entry.token);
          }}
        />
      ))}
      {hidden > 0 ? (
        <span className="tai-chip tai-chip-static">{`+${String(hidden)} more`}</span>
      ) : null}
    </div>
  );
}
