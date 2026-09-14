/**
 * `ExplorerView<T>` — the shared current-directory explorer every entity screen
 * composes: a breadcrumb over a flat {@link Folder} tree, optional search + tag
 * chips, a list/card toggle, and a body in which FOLDERS are first-class entries
 * sorted above the items (folder rows inside the same table, folder cards inside
 * the same grid). Fully controlled and data-agnostic — the caller owns the item
 * shape via `getItemKey`/`getFolderId`/`renderRow`/`renderCard`, and keeps folder
 * dir / tags / search in the URL or in local state; only the view mode persists
 * internally (per `viewSurface`).
 *
 * The tag glue lives in `explorer-tags` as exported helpers ({@link buildTagVocabulary},
 * {@link matchesSelectedTags}, {@link UNTAGGED_TOKEN}) so every consuming screen
 * shares one vocabulary/untagged-sentinel/OR-match rule rather than copying it.
 */
import { useEffect, useState, type ReactNode } from 'react';

import { childFolders, FolderBreadcrumb, type Folder } from './folder-nav';
import { SearchIcon } from './icons';
import { TextInput } from './inputs';
import { openTargetProps, type OpenTargetProps } from './open-target';
import { EmptyState } from './primitives';
import { useViewMode, ViewToggle, type ViewMode } from './view-toggle';
import { buildTagVocabulary, matchesSelectedTags } from './explorer-tags';
import { usePageSize } from './explorer-page-size';
import { TagFilterRow } from './explorer-tag-filter';
import { ExplorerBody, type ExplorerEntry } from './explorer-body';

export { UNTAGGED_TOKEN, buildTagVocabulary, matchesSelectedTags } from './explorer-tags';
export type { TagVocabularyEntry } from './explorer-tags';

/** One header cell of the table view. `renderRow` must emit exactly this many
 *  `<TD>`s per item; folder rows span all of them. */
export interface ExplorerColumn {
  readonly key: string;
  readonly header: ReactNode;
  readonly numeric?: boolean;
}

/** Enables the tag vocabulary, filter chips, and OR filter. Fully controlled. */
export interface ExplorerTags<T> {
  readonly getTags: (item: T) => readonly string[];
  readonly selected: readonly string[];
  readonly onChange: (selected: readonly string[]) => void;
  /** The untagged pseudo-tag's visible label (e.g. "Untagged"). */
  readonly untaggedLabel: string;
  /** The chip group's accessible name (e.g. "Filter tools by tag"). */
  readonly filterLabel: string;
  /** Collapse unselected chips beyond this count into a static "+N more"; unset
   *  shows every chip. Selected chips always show. */
  readonly maxVisibleTags?: number;
}

/** Controlled free-text search. `matches` owns the item shape and casing; it is
 *  called only with a non-empty, already-trimmed query. */
export interface ExplorerSearch<T> {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly matches: (item: T, query: string) => boolean;
  /** The input's accessible name. */
  readonly label: string;
  readonly placeholder?: string;
}

export interface ExplorerEmptyState {
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
}

/** The folder-aware empty-state ladder — every label caller-supplied. */
export interface ExplorerEmptyStates {
  /** No items and no folders exist at all. */
  readonly empty: ExplorerEmptyState;
  /** The current folder holds nothing — no items, no subfolders — yet the
   *  entity set is not globally empty. */
  readonly emptyFolder: ExplorerEmptyState;
  /** The current folder has items but the active tag/search filter excludes
   *  every one, and it has no subfolders to show. */
  readonly noMatch: ExplorerEmptyState;
}

export interface ExplorerViewProps<T> {
  readonly items: readonly T[];
  readonly getItemKey: (item: T) => string;
  /** The folder an item is filed in (`null` = the root directory). */
  readonly getFolderId: (item: T) => string | null;

  readonly folders: readonly Folder[];
  readonly currentFolderId: string | null;
  readonly onNavigate: (folderId: string | null) => void;
  readonly rootLabel: string;

  /** Persist + drive the list/card toggle under this surface key. */
  readonly viewSurface: string;
  /** The card grid's accessible name; the toggle's is "<label> view". */
  readonly label: string;

  readonly columns: readonly ExplorerColumn[];
  /** The item's table cells (`<TD>`s) — wrapped in a keyed `<TR>` by the explorer. */
  readonly renderRow: (item: T) => ReactNode;
  /** The item's `<Card>` — wrapped in a keyed `listitem` by the explorer. */
  readonly renderCard: (item: T) => ReactNode;

  /** Open an item on a pointer click anywhere on its row/card — a convenience
   *  ONLY. The accessible activation path stays the interactive element inside
   *  the cell (the name link), so the row is never a focusable button; a click
   *  originating on a nested control is left to that control. */
  readonly onOpenItem?: (item: T) => void;

  readonly tags?: ExplorerTags<T>;
  readonly search?: ExplorerSearch<T>;

  /** Per-folder actions rendered on the folder's row/card (e.g. a kebab). */
  readonly renderFolderActions?: (folder: Folder) => ReactNode;

  readonly emptyStates: ExplorerEmptyStates;
}

/** The header row: the optional search field, the item count, and the
 *  list/card view toggle. */
function ExplorerControls<T>({
  itemCount,
  countLabel,
  label,
  search,
  viewMode,
  onViewModeChange,
}: {
  readonly itemCount: number;
  readonly countLabel: string;
  readonly label: string;
  readonly search: ExplorerSearch<T> | undefined;
  readonly viewMode: ViewMode;
  readonly onViewModeChange: (mode: ViewMode) => void;
}): ReactNode {
  return (
    <div className="tai-explorer-controls">
      <div className="tai-row">
        {search !== undefined ? (
          // The magnifier is a leading icon INSIDE the input, not a detached
          // glyph beside it: the wrapper positions the icon over the input's
          // reserved leading padding.
          <span className="tai-search-field">
            <SearchIcon />
            <TextInput
              value={search.value}
              aria-label={search.label}
              placeholder={search.placeholder}
              onChange={(event) => {
                search.onChange(event.target.value);
              }}
            />
          </span>
        ) : null}
        <span className="tai-muted">{`${String(itemCount)} ${countLabel}`}</span>
      </div>
      <ViewToggle value={viewMode} onValueChange={onViewModeChange} aria-label={`${label} view`} />
    </div>
  );
}

/**
 * The pointer-open props for one item's row/card, via the shared house pattern
 * ({@link openTargetProps}): present only when `onOpenItem` is set, it yields to
 * the item's own nested interactive elements (its name link, an actions kebab)
 * and to a text-selection drag. The accessible activation path stays that nested
 * name link, so no `keyboard` here — the row is never itself a focus stop.
 */
function itemOpenProps<T>(item: T, onOpenItem: ((item: T) => void) | undefined): OpenTargetProps {
  return openTargetProps({
    onOpen:
      onOpenItem === undefined
        ? undefined
        : () => {
            onOpenItem(item);
          },
  });
}

/** The current folder's filtered items and the tag vocabulary over the folder. */
function filterInFolder<T>(
  inFolder: readonly T[],
  tags: ExplorerTags<T> | undefined,
  selectedSet: ReadonlySet<string> | undefined,
  search: ExplorerSearch<T> | undefined,
  query: string,
): readonly T[] {
  return inFolder.filter((item) => {
    if (tags !== undefined && selectedSet !== undefined && selectedSet.size > 0) {
      if (!matchesSelectedTags(tags.getTags(item), selectedSet)) return false;
    }
    if (search !== undefined && query !== '') {
      if (!search.matches(item, query)) return false;
    }
    return true;
  });
}

export function ExplorerView<T>({
  items,
  getItemKey,
  getFolderId,
  folders,
  currentFolderId,
  onNavigate,
  rootLabel,
  viewSurface,
  label,
  columns,
  renderRow,
  renderCard,
  onOpenItem,
  tags,
  search,
  renderFolderActions,
  emptyStates,
}: ExplorerViewProps<T>): ReactNode {
  const [viewMode, setViewMode] = useViewMode(viewSurface);
  const [pageSize, setPageSize] = usePageSize(viewSurface);
  const [page, setPage] = useState(1);

  const query = search ? search.value.trim() : '';
  const tagKey = tags !== undefined ? tags.selected.join('\0') : '';

  // A new filter view starts on its first page; the clamp below then handles a
  // set that shrinks under the current page without a reset.
  useEffect(() => {
    setPage(1);
  }, [currentFolderId, query, tagKey, pageSize]);

  if (viewSurface === '') throw new Error('ExplorerView requires a non-empty viewSurface key.');
  if (columns.length === 0) throw new Error('ExplorerView requires at least one column.');

  // Nothing anywhere: no items and no folders. A bare empty state, no controls.
  if (items.length === 0 && folders.length === 0) {
    return <EmptyState {...emptyStates.empty} />;
  }

  const subfolders = childFolders(folders, currentFolderId);
  const inFolder = items.filter((item) => getFolderId(item) === currentFolderId);

  const selectedSet = tags !== undefined ? new Set(tags.selected) : undefined;
  const filtered = filterInFolder(inFolder, tags, selectedSet, search, query);

  const vocabulary =
    tags !== undefined
      ? buildTagVocabulary(inFolder, tags.getTags, tags.selected, tags.untaggedLabel)
      : [];

  const toggleTag = (token: string): void => {
    if (tags === undefined || selectedSet === undefined) return;
    const next = selectedSet.has(token)
      ? tags.selected.filter((t) => t !== token)
      : [...tags.selected, token];
    tags.onChange(next);
  };

  const openProps = (item: T): OpenTargetProps => itemOpenProps(item, onOpenItem);

  const hasEntries = subfolders.length > 0 || filtered.length > 0;

  // Subfolders (sorted first) then filtered items, as ONE entries array both views
  // slice by page — so a page can straddle the folder→item boundary.
  const entries: ExplorerEntry<T>[] = [
    ...subfolders.map((folder) => ({ kind: 'folder', folder }) as const),
    ...filtered.map((item) => ({ kind: 'item', item }) as const),
  ];
  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const effectivePage = Math.min(page, pageCount);
  // Reconcile the stored page to the clamp so a set that shrinks below the page
  // and then regrows (no reset dep changed) stays on the clamped page instead of
  // jumping back to the stale one. Guarded, so this render-time set never loops.
  if (page !== effectivePage) setPage(effectivePage);
  const pageStart = (effectivePage - 1) * pageSize;
  const pageEntries = entries.slice(pageStart, pageStart + pageSize);

  // Every surface label is a regular English plural (Tools/Templates/Resources/
  // Flows), so a count of one drops the trailing "s".
  const countLabel =
    items.length === 1 ? label.toLowerCase().replace(/s$/, '') : label.toLowerCase();

  return (
    <div className="tai-explorer">
      <ExplorerControls
        itemCount={items.length}
        countLabel={countLabel}
        label={label}
        search={search}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <FolderBreadcrumb
        folders={folders}
        currentFolderId={currentFolderId}
        onNavigate={onNavigate}
        rootLabel={rootLabel}
      />

      {tags !== undefined && selectedSet !== undefined && vocabulary.length > 0 ? (
        <TagFilterRow
          vocabulary={vocabulary}
          selectedSet={selectedSet}
          onToggle={toggleTag}
          filterLabel={tags.filterLabel}
          maxVisibleTags={tags.maxVisibleTags}
        />
      ) : null}

      <ExplorerBody
        hasEntries={hasEntries}
        inFolderCount={inFolder.length}
        emptyStates={emptyStates}
        viewMode={viewMode}
        label={label}
        columns={columns}
        pageEntries={pageEntries}
        getItemKey={getItemKey}
        renderRow={renderRow}
        renderCard={renderCard}
        openProps={openProps}
        onNavigate={onNavigate}
        renderFolderActions={renderFolderActions}
        pager={{
          label,
          pageStart,
          pageSize,
          total: entries.length,
          effectivePage,
          pageCount,
          onPageChange: setPage,
          onPageSizeChange: setPageSize,
        }}
      />
    </div>
  );
}
