/**
 * The option model behind `SearchableSelect`: the caller's options indexed once for
 * search, the sections a query leaves, and the keyboard's movement over them. Pure,
 * so the component re-derives nothing per row and the filter is testable alone.
 */
import { searchNeedle, textHasNeedle } from '../search-match';
import type { SelectGroup, SelectOption } from './select';

/** One option, with its position in the full list and its label in search form. */
export interface SearchEntry {
  readonly option: SelectOption;
  /** The option's position across every section; stable while the reader filters. */
  readonly position: number;
  readonly loweredLabel: string;
}

/** A run of entries under one group label, or under none for a flat list. */
export interface SearchSection {
  readonly label: string | undefined;
  readonly entries: readonly SearchEntry[];
}

/** What a query leaves: the non-empty sections and their entries in reading order. */
export interface VisibleOptions {
  readonly sections: readonly SearchSection[];
  readonly entries: readonly SearchEntry[];
}

/** Index the caller's options (a flat run, or labelled groups) for search. */
export function indexSections(
  options: readonly SelectOption[] | undefined,
  groups: readonly SelectGroup[] | undefined,
): SearchSection[] {
  const runs: { label: string | undefined; options: readonly SelectOption[] }[] =
    groups !== undefined
      ? groups.map((group) => ({ label: group.label, options: group.options }))
      : [{ label: undefined, options: options ?? [] }];
  let position = 0;
  return runs.map((run) => ({
    label: run.label,
    entries: run.options.map((option) => ({
      option,
      position: position++,
      loweredLabel: option.label.toLowerCase(),
    })),
  }));
}

/**
 * The sections and entries whose label contains `query`. A blank query returns every
 * section as indexed; either way each kept entry is the indexed object itself, so a
 * row memoised on its entry does not re-render because the reader typed.
 */
export function visibleOptions(sections: readonly SearchSection[], query: string): VisibleOptions {
  const needle = searchNeedle(query);
  const kept =
    needle === ''
      ? sections
      : sections.map((section) => ({
          label: section.label,
          entries: section.entries.filter((entry) => textHasNeedle(entry.loweredLabel, needle)),
        }));
  const nonEmpty = kept.filter((section) => section.entries.length > 0);
  return { sections: nonEmpty, entries: nonEmpty.flatMap((section) => section.entries) };
}

function enabled(entry: SearchEntry): boolean {
  return entry.option.disabled !== true;
}

/**
 * The entry the keyboard highlight moves to from `current` by one step in
 * `direction`, skipping disabled entries and stopping at either end. With no current
 * highlight among `entries`, a step lands on the first (down) or last (up) one.
 */
export function stepEntry(
  entries: readonly SearchEntry[],
  current: SearchEntry | undefined,
  direction: 1 | -1,
): SearchEntry | undefined {
  const at = current === undefined ? -1 : entries.indexOf(current);
  if (at === -1) return direction === 1 ? entries.find(enabled) : entries.findLast(enabled);
  for (let index = at + direction; index >= 0 && index < entries.length; index += direction) {
    const entry = entries[index];
    if (entry !== undefined && enabled(entry)) return entry;
  }
  return current;
}

/**
 * The entry to draw highlighted: the choosable visible entry whose value is `wanted`,
 * else the first choosable one. Keyed by value, so the highlight stays on its option
 * when the list around it changes, and a query that filters it away moves it to the
 * top of what is left instead of to nothing.
 */
export function shownEntry(
  entries: readonly SearchEntry[],
  wanted: string | undefined,
): SearchEntry | undefined {
  const kept =
    wanted === undefined
      ? undefined
      : entries.find((entry) => entry.option.value === wanted && enabled(entry));
  return kept ?? entries.find(enabled);
}
