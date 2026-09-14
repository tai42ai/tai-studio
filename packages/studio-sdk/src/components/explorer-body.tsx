/**
 * The explorer's directory body: the empty-state ladder, the card grid and the
 * scrolling table (folders sorted above items in both), and the page footer. The
 * pagination MATH lives in `ExplorerView`; this renders the result.
 */
import type { ReactNode } from 'react';

import { EntityCardGrid } from './entity-card-grid';
import { FolderRow, type Folder } from './folder-nav';
import { type OpenTargetProps } from './open-target';
import { Button, Card, EmptyState } from './primitives';
import { ScrollRegion } from './scroll-region';
import { Select } from './select';
import { Table, TBody, TD, TH, THead, TR } from './table';
import type { ViewMode } from './view-toggle';
import { PAGE_SIZES } from './explorer-page-size';
import type { ExplorerColumn, ExplorerEmptyStates } from './explorer-view';

/** One page entry: a subfolder (sorted first) or a filtered item, in one array. */
export type ExplorerEntry<T> =
  | { readonly kind: 'folder'; readonly folder: Folder }
  | { readonly kind: 'item'; readonly item: T };

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

interface ExplorerPagerProps {
  readonly label: string;
  readonly pageStart: number;
  readonly pageSize: number;
  readonly total: number;
  readonly effectivePage: number;
  readonly pageCount: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange: (size: number) => void;
}

function ExplorerPager({
  label,
  pageStart,
  pageSize,
  total,
  effectivePage,
  pageCount,
  onPageChange,
  onPageSizeChange,
}: ExplorerPagerProps): ReactNode {
  return (
    <nav className="tai-explorer-pagination" aria-label={`${label} pagination`}>
      {/* The pager counts ENTRIES — subfolders plus filtered items in the
          current directory — which is a different unit from the header's total
          item count across every folder. Naming the unit keeps the two honest:
          "1–4 of 4 entries" here versus "7 templates" above. */}
      <span className="tai-muted">{`${String(pageStart + 1)}–${String(Math.min(pageStart + pageSize, total))} of ${String(total)} entries`}</span>
      <div className="tai-row">
        <Select
          aria-label="Items per page"
          value={String(pageSize)}
          onValueChange={(value) => {
            onPageSizeChange(Number(value));
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
            onPageChange(effectivePage - 1);
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
            onPageChange(effectivePage + 1);
          }}
        >
          Next
        </Button>
        <span className="tai-muted">{`Page ${String(effectivePage)} of ${String(pageCount)}`}</span>
      </div>
    </nav>
  );
}

export interface ExplorerBodyProps<T> {
  readonly hasEntries: boolean;
  /** Items in the current folder before filtering, so the empty ladder can tell
   *  "filter emptied it" (>0 → no-match) from "genuinely empty". */
  readonly inFolderCount: number;
  readonly emptyStates: ExplorerEmptyStates;
  readonly viewMode: ViewMode;
  readonly label: string;
  readonly columns: readonly ExplorerColumn[];
  readonly pageEntries: readonly ExplorerEntry<T>[];
  readonly getItemKey: (item: T) => string;
  readonly renderRow: (item: T) => ReactNode;
  readonly renderCard: (item: T) => ReactNode;
  readonly openProps: (item: T) => OpenTargetProps;
  readonly onNavigate: (folderId: string | null) => void;
  readonly renderFolderActions: ((folder: Folder) => ReactNode) | undefined;
  readonly pager: ExplorerPagerProps;
}

/** A card entry (folder card or item card) for the grid view. */
function CardEntry<T>(
  props: ExplorerBodyProps<T> & { readonly entry: ExplorerEntry<T> },
): ReactNode {
  const { entry, onNavigate, renderFolderActions, getItemKey, renderCard, openProps } = props;
  if (entry.kind === 'folder') {
    return (
      <div role="listitem" key={`folder:${entry.folder.id}`}>
        <Card interactive>
          <FolderEntry
            folder={entry.folder}
            onNavigate={onNavigate}
            renderFolderActions={renderFolderActions}
          />
        </Card>
      </div>
    );
  }
  return (
    <div role="listitem" key={`item:${getItemKey(entry.item)}`} {...openProps(entry.item)}>
      {renderCard(entry.item)}
    </div>
  );
}

/** A table row (folder row spanning all columns, or item row) for the list view. */
function RowEntry<T>(
  props: ExplorerBodyProps<T> & { readonly entry: ExplorerEntry<T> },
): ReactNode {
  const { entry, columns, onNavigate, renderFolderActions, getItemKey, renderRow, openProps } =
    props;
  if (entry.kind === 'folder') {
    return (
      <TR key={`folder:${entry.folder.id}`}>
        <TD colSpan={columns.length}>
          <FolderEntry
            folder={entry.folder}
            onNavigate={onNavigate}
            renderFolderActions={renderFolderActions}
          />
        </TD>
      </TR>
    );
  }
  return (
    <TR key={`item:${getItemKey(entry.item)}`} {...openProps(entry.item)}>
      {renderRow(entry.item)}
    </TR>
  );
}

export function ExplorerBody<T>(props: ExplorerBodyProps<T>): ReactNode {
  const { hasEntries, inFolderCount, emptyStates, viewMode, label, columns, pageEntries, pager } =
    props;

  if (!hasEntries) {
    // The current folder renders nothing. A filter emptied it (`inFolderCount` > 0)
    // → "no match"; otherwise the folder is genuinely empty. The ladder decides on
    // the full, unsliced sets, never on a page.
    return <EmptyState {...(inFolderCount > 0 ? emptyStates.noMatch : emptyStates.emptyFolder)} />;
  }

  if (viewMode === 'cards') {
    return (
      <>
        <EntityCardGrid aria-label={label}>
          {pageEntries.map((entry) => (
            <CardEntry key={entryKey(entry, props.getItemKey)} {...props} entry={entry} />
          ))}
        </EntityCardGrid>
        <ExplorerPager {...pager} />
      </>
    );
  }

  // Folder rows share the item table, spanning every column, sorted above items —
  // so a folder-with-only-subfolders is folder ROWS, never a header-only table.
  // A too-wide table scrolls inside its own box rather than widening the page.
  return (
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
            {pageEntries.map((entry) => (
              <RowEntry key={entryKey(entry, props.getItemKey)} {...props} entry={entry} />
            ))}
          </TBody>
        </Table>
      </ScrollRegion>
      <ExplorerPager {...pager} />
    </>
  );
}

/** The stable React key for a page entry, folder or item. */
function entryKey<T>(entry: ExplorerEntry<T>, getItemKey: (item: T) => string): string {
  return entry.kind === 'folder' ? `folder:${entry.folder.id}` : `item:${getItemKey(entry.item)}`;
}
