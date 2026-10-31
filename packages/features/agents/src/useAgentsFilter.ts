/**
 * The agents explorer's filter, the one the tools screen has: a search box over the
 * tool name and the description, committed to `?q=` on Enter or an edited blur, and
 * tag chips over the overlay tags, kept in `?tags=` (offered only once the overlay is
 * loaded, so the chips never filter on missing data). The commit listener sits on the
 * container the returned ref attaches to.
 */
import {
  type ExplorerSearch,
  type ExplorerTags,
  type RouteSearch,
  useAppNavigate,
  useSearchCommit,
  useSearchDraft,
} from '@tai42/studio-sdk';
import { type RefObject, useCallback, useMemo, useRef } from 'react';

import { type AgentEntry, entryDescription } from './agent-entries';

/** The search box's accessible name; the commit listener keys the search input on it. */
export const AGENTS_SEARCH_LABEL = 'Filter agents';

/** The untagged pseudo-tag's chip label. */
const UNTAGGED_LABEL = 'Untagged';

/** How many tag chips the filter row shows before collapsing the rest into "+N more". */
const MAX_VISIBLE_TAG_CHIPS = 8;

export interface AgentsFilter {
  /** The container the commit listener binds on; it must wrap the explorer. */
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly search: ExplorerSearch<AgentEntry>;
  /** Absent until the overlay tags are known. */
  readonly tags: ExplorerTags<AgentEntry> | undefined;
}

export function useAgentsFilter(
  search: RouteSearch<'agents'>,
  tagsByTool: ReadonlyMap<string, readonly string[]>,
  tagsAvailable: boolean,
): AgentsFilter {
  const navigate = useAppNavigate();
  const committedQuery = search.q ?? '';
  const selectedTags = useMemo(() => search.tags ?? [], [search.tags]);
  const [query, setQuery] = useSearchDraft(committedQuery);
  const containerRef = useRef<HTMLDivElement>(null);
  const buildSearch = useCallback(
    (q: string | undefined): RouteSearch<'agents'> => ({ ...search, q }),
    [search],
  );
  useSearchCommit({
    token: 'agents',
    containerRef,
    searchLabel: AGENTS_SEARCH_LABEL,
    committedValue: committedQuery,
    draft: query,
    buildSearch,
    containerMissingError: 'Agents explorer container ref did not attach.',
  });

  return {
    containerRef,
    search: {
      value: query,
      onChange: setQuery,
      texts: (entry) => [entry.toolName, entryDescription(entry)],
      label: AGENTS_SEARCH_LABEL,
      placeholder: 'Filter by name or description',
    },
    tags: tagsAvailable
      ? {
          getTags: (entry) => tagsByTool.get(entry.toolName) ?? [],
          selected: selectedTags,
          // A tag toggle keeps the live draft, so the reader's uncommitted text stays.
          onChange: (next) => {
            const q = query.trim();
            navigate('agents', {
              tags: next.length > 0 ? [...next] : undefined,
              q: q === '' ? undefined : q,
            });
          },
          untaggedLabel: UNTAGGED_LABEL,
          filterLabel: 'Filter agents by tag',
          maxVisibleTags: MAX_VISIBLE_TAG_CHIPS,
        }
      : undefined,
  };
}
