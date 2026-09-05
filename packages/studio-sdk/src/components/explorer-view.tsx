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
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import { EntityCardGrid } from './entity-card-grid';
import { childFolders, FolderBreadcrumb, FolderRow, type Folder } from './folder-nav';
import { SearchIcon } from './icons';
import { TextInput } from './inputs';
import { openTargetProps, type OpenTargetProps } from './open-target';
import { Button, Card, EmptyState } from './primitives';
import { ScrollRegion } from './scroll-region';
import { Select } from './select';
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

/** The page-size choices, and the default. */
const PAGE_SIZES = [12, 24, 48, 96] as const;
const DEFAULT_PAGE_SIZE = 24;

const PAGE_SIZE_STORAGE_PREFIX = 'tai-studio.page-size.';

function readStoredPageSize(surface: string): number {
  try {
    const raw = globalThis.localStorage.getItem(PAGE_SIZE_STORAGE_PREFIX + surface);
    const parsed = raw === null ? Number.NaN : Number(raw);
    if ((PAGE_SIZES as readonly number[]).includes(parsed)) return parsed;
  } catch {
    // No storage (private mode / non-browser) — fall back to the default.
  }
  return DEFAULT_PAGE_SIZE;
}

/**
 * The persisted page size for one `surface`, mirroring {@link useViewMode}: an
 * invalid or absent stored value degrades to the default, and a storage failure
 * degrades to in-memory only — never a thrown boot.
 */
function usePageSize(surface: string): readonly [number, (size: number) => void] {
  const [size, setSizeState] = useState<number>(() => readStoredPageSize(surface));
  const setSize = useCallback(
    (next: number) => {
      setSizeState(next);
      try {
        globalThis.localStorage.setItem(PAGE_SIZE_STORAGE_PREFIX + surface, String(next));
      } catch {
        // Storage unavailable — the choice still applies for this session.
      }
    },
    [surface],
  );
  return [size, setSize];
}

/** One page entry: a subfolder (sorted first) or a filtered item, in one array. */
type ExplorerEntry<T> =
  | { readonly kind: 'folder'; readonly folder: Folder }
  | { readonly kind: 'item'; readonly item: T };

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

  // The pointer-open props for one item's row/card, via the shared house pattern
  // ({@link openTargetProps}): present only when `onOpenItem` is set, it yields to
  // the item's own nested interactive elements (its name link, an actions kebab)
  // and to a text-selection drag. The accessible activation path stays that nested
  // name link, so no `keyboard` here — the row is never itself a focus stop.
  const openProps = (item: T): OpenTargetProps =>
    openTargetProps({
      onOpen:
        onOpenItem === undefined
          ? undefined
          : () => {
              onOpenItem(item);
            },
    });

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

  const footer =
    entries.length > 0 ? (
      <nav className="tai-explorer-pagination" aria-label={`${label} pagination`}>
        {/* The pager counts ENTRIES — subfolders plus filtered items in the
            current directory — which is a different unit from the header's total
            item count across every folder. Naming the unit keeps the two honest:
            "1–4 of 4 entries" here versus "7 templates" above. */}
        <span className="tai-muted">{`${String(pageStart + 1)}–${String(Math.min(pageStart + pageSize, entries.length))} of ${String(entries.length)} entries`}</span>
        <div className="tai-row">
          <Select
            aria-label="Items per page"
            value={String(pageSize)}
            onValueChange={(value) => {
              setPageSize(Number(value));
            }}
            options={PAGE_SIZES.map((size) => ({
              value: String(size),
              label: `${String(size)} per page`,
            }))}
          />
          {/* aria-disabled, never the disabled attribute: a button removed from
              the tab order at the bound drops focus to the body (WCAG 2.4.3).
              The click guard makes activation at the bound an inert no-op. */}
          <Button
            variant="ghost"
            aria-label="Previous page"
            aria-disabled={effectivePage <= 1}
            onClick={() => {
              if (effectivePage <= 1) return;
              setPage(effectivePage - 1);
            }}
          >
            Prev
          </Button>
          <Button
            variant="ghost"
            aria-label="Next page"
            aria-disabled={effectivePage >= pageCount}
            onClick={() => {
              if (effectivePage >= pageCount) return;
              setPage(effectivePage + 1);
            }}
          >
            Next
          </Button>
          <span className="tai-muted">{`Page ${String(effectivePage)} of ${String(pageCount)}`}</span>
        </div>
      </nav>
    ) : null;

  let body: ReactNode;
  if (!hasEntries) {
    // The current folder renders nothing. A filter emptied it (`inFolder` non-empty)
    // → "no match"; otherwise the folder is genuinely empty. The ladder decides on
    // the full, unsliced sets, never on a page.
    body = (
      <EmptyState {...(inFolder.length > 0 ? emptyStates.noMatch : emptyStates.emptyFolder)} />
    );
  } else if (viewMode === 'cards') {
    body = (
      <>
        <EntityCardGrid aria-label={label}>
          {pageEntries.map((entry) =>
            entry.kind === 'folder' ? (
              <div role="listitem" key={`folder:${entry.folder.id}`}>
                <Card interactive>
                  <FolderEntry
                    folder={entry.folder}
                    onNavigate={onNavigate}
                    renderFolderActions={renderFolderActions}
                  />
                </Card>
              </div>
            ) : (
              <div
                role="listitem"
                key={`item:${getItemKey(entry.item)}`}
                {...openProps(entry.item)}
              >
                {renderCard(entry.item)}
              </div>
            ),
          )}
        </EntityCardGrid>
        {footer}
      </>
    );
  } else {
    // Folder rows share the item table, spanning every column, sorted above items —
    // so a folder-with-only-subfolders is folder ROWS, never a header-only table.
    // A too-wide table scrolls inside its own box rather than widening the page.
    body = (
      <>
        <ScrollRegion label={label}>
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
              {pageEntries.map((entry) =>
                entry.kind === 'folder' ? (
                  <TR key={`folder:${entry.folder.id}`}>
                    <TD colSpan={columns.length}>
                      <FolderEntry
                        folder={entry.folder}
                        onNavigate={onNavigate}
                        renderFolderActions={renderFolderActions}
                      />
                    </TD>
                  </TR>
                ) : (
                  <TR key={`item:${getItemKey(entry.item)}`} {...openProps(entry.item)}>
                    {renderRow(entry.item)}
                  </TR>
                ),
              )}
            </TBody>
          </Table>
        </ScrollRegion>
        {footer}
      </>
    );
  }

  // Every surface label is a regular English plural (Tools/Templates/Resources/
  // Flows), so a count of one drops the trailing "s".
  const countLabel =
    items.length === 1 ? label.toLowerCase().replace(/s$/, '') : label.toLowerCase();

  return (
    <div className="tai-explorer">
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
          <span className="tai-muted">{`${String(items.length)} ${countLabel}`}</span>
        </div>
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
