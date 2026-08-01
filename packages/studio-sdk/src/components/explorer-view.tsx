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
 * The tag glue lives here as exported helpers ({@link buildTagVocabulary},
 * {@link matchesSelectedTags}, {@link UNTAGGED_TOKEN}) so every consuming screen
 * shares one vocabulary/untagged-sentinel/OR-match rule rather than copying it.
 */
import type { ReactNode } from 'react';

import { EntityCardGrid } from './entity-card-grid';
import { childFolders, FolderBreadcrumb, FolderRow, type Folder } from './folder-nav';
import { SearchIcon } from './icons';
import { TextInput } from './inputs';
import { Card, EmptyState } from './primitives';
import { Table, TBody, TD, TH, THead, TR } from './table';
import { useViewMode, ViewToggle } from './view-toggle';

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

  readonly tags?: ExplorerTags<T>;
  readonly search?: ExplorerSearch<T>;

  /** Per-folder actions rendered on the folder's row/card (e.g. a kebab). */
  readonly renderFolderActions?: (folder: Folder) => ReactNode;

  readonly emptyStates: ExplorerEmptyStates;
}

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
function TagFilterRow({
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

/** A first-class folder entry — a `FolderRow` (icon + name, navigates inward)
 *  beside its optional actions, in the layout shared by the row cell and the card. */
function FolderEntry({
  folder,
  onNavigate,
  renderFolderActions,
}: {
  readonly folder: Folder;
  readonly onNavigate: (folderId: string | null) => void;
  readonly renderFolderActions: ((folder: Folder) => ReactNode) | undefined;
}): ReactNode {
  return (
    <div className="tai-explorer-folder">
      <FolderRow folder={folder} onOpen={onNavigate} />
      {renderFolderActions ? renderFolderActions(folder) : null}
    </div>
  );
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
  tags,
  search,
  renderFolderActions,
  emptyStates,
}: ExplorerViewProps<T>): ReactNode {
  const [viewMode, setViewMode] = useViewMode(viewSurface);

  if (viewSurface === '') throw new Error('ExplorerView requires a non-empty viewSurface key.');
  if (columns.length === 0) throw new Error('ExplorerView requires at least one column.');

  // Nothing anywhere: no items and no folders. A bare empty state, no controls.
  if (items.length === 0 && folders.length === 0) {
    return <EmptyState {...emptyStates.empty} />;
  }

  const subfolders = childFolders(folders, currentFolderId);
  const inFolder = items.filter((item) => getFolderId(item) === currentFolderId);

  const selectedSet = tags !== undefined ? new Set(tags.selected) : undefined;
  const query = search ? search.value.trim() : '';
  const filtered = inFolder.filter((item) => {
    if (tags !== undefined && selectedSet !== undefined && selectedSet.size > 0) {
      if (!matchesSelectedTags(tags.getTags(item), selectedSet)) return false;
    }
    if (search !== undefined && query !== '') {
      if (!search.matches(item, query)) return false;
    }
    return true;
  });

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

  const hasEntries = subfolders.length > 0 || filtered.length > 0;

  let body: ReactNode;
  if (!hasEntries) {
    // The current folder renders nothing. A filter emptied it (`inFolder` non-empty)
    // → "no match"; otherwise the folder is genuinely empty.
    body = (
      <EmptyState {...(inFolder.length > 0 ? emptyStates.noMatch : emptyStates.emptyFolder)} />
    );
  } else if (viewMode === 'cards') {
    body = (
      <EntityCardGrid aria-label={label}>
        {subfolders.map((folder) => (
          <div role="listitem" key={`folder:${folder.id}`}>
            <Card interactive>
              <FolderEntry
                folder={folder}
                onNavigate={onNavigate}
                renderFolderActions={renderFolderActions}
              />
            </Card>
          </div>
        ))}
        {filtered.map((item) => (
          <div role="listitem" key={`item:${getItemKey(item)}`}>
            {renderCard(item)}
          </div>
        ))}
      </EntityCardGrid>
    );
  } else {
    // Folder rows share the item table, spanning every column, sorted above items —
    // so a folder-with-only-subfolders is folder ROWS, never a header-only table.
    body = (
      <Table>
        <THead>
          <TR>
            {columns.map((column) => (
              <TH key={column.key} numeric={column.numeric}>
                {column.header}
              </TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {subfolders.map((folder) => (
            <TR key={`folder:${folder.id}`}>
              <TD colSpan={columns.length}>
                <FolderEntry
                  folder={folder}
                  onNavigate={onNavigate}
                  renderFolderActions={renderFolderActions}
                />
              </TD>
            </TR>
          ))}
          {filtered.map((item) => (
            <TR key={`item:${getItemKey(item)}`}>{renderRow(item)}</TR>
          ))}
        </TBody>
      </Table>
    );
  }

  return (
    <div className="tai-explorer">
      <div className="tai-explorer-controls">
        {search !== undefined ? (
          <span className="tai-row">
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
        ) : (
          <span />
        )}
        <ViewToggle value={viewMode} onValueChange={setViewMode} aria-label={`${label} view`} />
      </div>

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

      {body}
    </div>
  );
}
