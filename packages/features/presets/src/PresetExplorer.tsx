/**
 * The active presets as a folder explorer — the shared `ExplorerView` over the ONE
 * tool-organization tree, drawn for this screen's population: a folder shows when
 * its subtree holds a preset or holds no tool at all (`foldersForView`), so folders
 * that hold only other tools stay on the Tools screen. A preset sits in the folder
 * its overlay row files it in (unfiled presets live at the root).
 *
 * Once the overlay is loaded, every folder carries the shared Rename / Move / Delete,
 * each shown only where the caller may make that write, whose Move offers the FULL
 * tree; a preset itself is filed through its edit dialog. The selected preset's
 * entry carries the shared selected look, and its folder opens on a link to it.
 *
 * The filter is the one the tools screen has: a search box over the name, display
 * name and description, committed to `?q=` on Enter or an edited blur, and tag chips
 * over the overlay tags, kept in `?tags=`. Opening a preset keeps both. The current
 * folder is local view state. The tree derivations are memoised on the overlay read
 * and the preset list, so a re-render costs nothing and a change costs one linear pass.
 */
import type { PresetRecord, ToolMetaOverlay } from '@tai42/api-client';
import {
  type ExplorerEmptyState,
  ExplorerView,
  FolderActionsMenu,
  type FoldersChanged,
  foldersForView,
  type RouteSearch,
  toFolders,
  useAppNavigate,
  useSearchCommit,
  useSearchDraft,
  useToolMetaWriteAccess,
} from '@tai42/studio-sdk';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';

import {
  type OverlayDetail,
  PRESET_COLUMNS,
  PresetCard,
  PresetCells,
  presetOpenSearch,
  type PresetsFilter,
} from './PresetEntry';

/** The explorer's persisted list/card view key. */
const PRESETS_VIEW_SURFACE = 'presets';

/** The search box's accessible name; the commit listener keys the search input on it. */
export const PRESETS_SEARCH_LABEL = 'Filter presets';

/** The untagged pseudo-tag's chip label. */
const UNTAGGED_LABEL = 'Untagged';

/** How many tag chips the filter row shows before collapsing the rest into "+N more". */
const MAX_VISIBLE_TAG_CHIPS = 8;

/** No preset exists at all. */
const NO_PRESETS: ExplorerEmptyState = {
  title: 'No presets yet',
  description: 'Create a preset to bind a base tool with fixed kwargs into a new named tool.',
};

/** Presets exist, but every one is conflicted. */
const NO_ACTIVE_PRESETS: ExplorerEmptyState = {
  title: 'No active presets',
  description: 'Every preset is currently conflicted — resolve them below.',
};

export interface PresetExplorerProps {
  /** The active (non-conflicted) presets — the screen's population. */
  readonly presets: readonly PresetRecord[];
  /** Conflicted presets exist (listed outside the explorer). */
  readonly hasConflicted: boolean;
  /** The full overlay read (every folder, every row, hidden ones included);
   *  `undefined` while it loads or after it failed. */
  readonly overlay: ToolMetaOverlay | undefined;
  readonly overlayByTool: ReadonlyMap<string, OverlayDetail>;
  /** The page's search: the selected preset, its version and the committed filter. */
  readonly search: RouteSearch<'presets'>;
  /** The overlay tags are known, so the tag chips filter on real data. */
  readonly tagsAvailable: boolean;
  /** Re-read the overlay after a folder write. */
  readonly onFoldersChanged: FoldersChanged;
  /** The overlay read succeeded, so the folder actions act on a known tree. */
  readonly overlayLoaded: boolean;
}

export function PresetExplorer({
  presets,
  hasConflicted,
  overlay,
  overlayByTool,
  search,
  tagsAvailable,
  onFoldersChanged,
  overlayLoaded,
}: PresetExplorerProps): ReactNode {
  const navigate = useAppNavigate();
  const { editTool: canFilePresets } = useToolMetaWriteAccess();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const selected = search.preset;
  const committedQuery = search.q ?? '';
  const selectedTags = useMemo(() => search.tags ?? [], [search.tags]);
  const [query, setQuery] = useSearchDraft(committedQuery);
  const containerRef = useRef<HTMLDivElement>(null);
  const buildSearch = useCallback(
    (q: string | undefined): RouteSearch<'presets'> => ({ ...search, q }),
    [search],
  );
  useSearchCommit({
    token: 'presets',
    containerRef,
    searchLabel: PRESETS_SEARCH_LABEL,
    committedValue: committedQuery,
    draft: query,
    buildSearch,
    containerMissingError: 'Presets explorer container ref did not attach.',
  });
  // The live draft rides along on every open, so a click during an uncommitted edit
  // keeps the filter the reader sees.
  const liveFilter: PresetsFilter = {
    tags: search.tags,
    q: query.trim() === '' ? undefined : query.trim(),
  };

  const allFolders = useMemo(() => toFolders(overlay?.folders ?? []), [overlay]);
  const folders = useMemo(
    () =>
      foldersForView(
        allFolders,
        overlay?.meta ?? [],
        new Set(presets.map((preset) => preset.name)),
      ),
    [allFolders, overlay, presets],
  );
  const folderIdByTool = useMemo(
    () => new Map((overlay?.meta ?? []).map((row) => [row.tool_name, row.folder_id])),
    [overlay],
  );

  const entryProps = (preset: PresetRecord) => ({
    preset,
    overlay: overlayByTool.get(preset.name),
    selected: preset.name === selected,
    filter: liveFilter,
  });

  return (
    <div ref={containerRef}>
      <ExplorerView<PresetRecord>
        items={presets}
        getItemKey={(preset) => preset.name}
        getFolderId={(preset) => folderIdByTool.get(preset.name) ?? null}
        folders={folders}
        currentFolderId={currentFolderId}
        onNavigate={setCurrentFolderId}
        selectedItemKey={selected}
        rootLabel="All presets"
        viewSurface={PRESETS_VIEW_SURFACE}
        label="Presets"
        columns={PRESET_COLUMNS}
        renderRow={(preset) => <PresetCells {...entryProps(preset)} />}
        renderCard={(preset) => <PresetCard {...entryProps(preset)} />}
        onOpenItem={(preset) => {
          navigate('presets', presetOpenSearch(preset.name, liveFilter));
        }}
        renderFolderActions={
          overlayLoaded
            ? (folder) => (
                <FolderActionsMenu
                  folder={folder}
                  folders={allFolders}
                  onFoldersChanged={onFoldersChanged}
                />
              )
            : undefined
        }
        search={{
          value: query,
          onChange: setQuery,
          texts: (preset) => [
            preset.name,
            overlayByTool.get(preset.name)?.displayName ?? '',
            preset.description,
          ],
          label: PRESETS_SEARCH_LABEL,
          placeholder: 'Filter by name or description',
        }}
        tags={
          tagsAvailable
            ? {
                getTags: (preset) => overlayByTool.get(preset.name)?.tags ?? [],
                selected: selectedTags,
                onChange: (next) => {
                  navigate('presets', {
                    ...search,
                    tags: next.length > 0 ? [...next] : undefined,
                    q: liveFilter.q,
                  });
                },
                untaggedLabel: UNTAGGED_LABEL,
                filterLabel: 'Filter presets by tag',
                maxVisibleTags: MAX_VISIBLE_TAG_CHIPS,
              }
            : undefined
        }
        emptyStates={{
          empty: hasConflicted ? NO_ACTIVE_PRESETS : NO_PRESETS,
          emptyFolder: {
            title: 'This folder is empty',
            // The hint names an action only for a caller who has it.
            description: canFilePresets ? 'File a preset here from its Edit dialog.' : undefined,
          },
          noMatch: {
            title: 'No presets match',
            description: 'No preset matches the search or the selected tags.',
          },
        }}
      />
    </div>
  );
}
