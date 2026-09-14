/**
 * The tracing filter bar's local draft: the string-valued form state mirrored from
 * the URL search, and the codecs that seed it from a search and fold it back into a
 * search patch. Blank fields drop out (become `undefined`) so an empty filter leaves
 * the URL clean.
 */
import type { ObservabilitySearch } from './filters';

/** The Status select's "any" sentinel (no status filter). */
export const STATUS_ANY = 'any';

function num(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function parseNum(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export interface FilterDraft {
  status: string;
  tags: string;
  minCost: string;
  maxCost: string;
  minTokens: string;
  maxTokens: string;
  minLatencyMs: string;
  maxLatencyMs: string;
}

export function draftFromSearch(search: ObservabilitySearch): FilterDraft {
  return {
    status: search.status ?? STATUS_ANY,
    tags: (search.tags ?? []).join(', '),
    minCost: num(search.minCost),
    maxCost: num(search.maxCost),
    minTokens: num(search.minTokens),
    maxTokens: num(search.maxTokens),
    minLatencyMs: num(search.minLatencyMs),
    maxLatencyMs: num(search.maxLatencyMs),
  };
}

export function draftToPatch(draft: FilterDraft): Partial<ObservabilitySearch> {
  const tags = draft.tags
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return {
    status: draft.status === STATUS_ANY ? undefined : (draft.status as 'error' | 'success'),
    tags: tags.length === 0 ? undefined : tags,
    minCost: parseNum(draft.minCost),
    maxCost: parseNum(draft.maxCost),
    minTokens: parseNum(draft.minTokens),
    maxTokens: parseNum(draft.maxTokens),
    minLatencyMs: parseNum(draft.minLatencyMs),
    maxLatencyMs: parseNum(draft.maxLatencyMs),
  };
}

/** The advanced-filter keys the bar owns, so Clear drops exactly these. */
export const ADVANCED_FILTER_KEYS: readonly (keyof ObservabilitySearch)[] = [
  'status',
  'tags',
  'minCost',
  'maxCost',
  'minTokens',
  'maxTokens',
  'minLatencyMs',
  'maxLatencyMs',
];
