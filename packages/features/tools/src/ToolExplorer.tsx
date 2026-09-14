/**
 * The tools explorer body: the empty-catalog prompt, or the folder-aware
 * {@link ExplorerView} of the visible tools (a hidden tool is excluded outright —
 * unhiding is a CLI/API operation). A tags/overlay side-read failure renders a loud
 * notice above the list and suppresses the tag chips, never a filter built from
 * partial data.
 */
import type { ReactNode } from 'react';
import {
  AppLink,
  Card,
  EmptyState,
  ErrorState,
  ExplorerView,
  TD,
  errorMessage,
  useAppNavigate,
  type ExplorerColumn,
  type ExplorerEmptyStates,
  type Folder,
} from '@tai42/studio-sdk';

import { ToolItem } from './ToolItem';
import { toolMatches, type ToolView } from './toolView';

/** The search box's accessible name; the commit listener keys the search input on it. */
export const SEARCH_LABEL = 'Filter tools';

/** The untagged pseudo-tag's chip label. */
const UNTAGGED_LABEL = 'Untagged';

/** How many tag chips the filter row shows before collapsing the rest into "+N more". */
const MAX_VISIBLE_TAG_CHIPS = 8;

/** The explorer's list/card view-mode persistence key. */
const TOOLS_VIEW_SURFACE = 'tools';

/** The tools table's single column; folder rows span it. */
const COLUMNS: ExplorerColumn[] = [{ key: 'name', header: 'Name' }];

const EMPTY_STATES: ExplorerEmptyStates = {
  empty: {
    title: 'No visible tools',
    description: 'Every installed tool is hidden. Unhide one with the tai tool-meta command.',
  },
  emptyFolder: {
    title: 'This folder is empty',
    description: 'No tools or subfolders are filed here.',
  },
  noMatch: {
    title: 'No tools match',
    description: 'No tool matches the search or the selected tags.',
  },
};

export interface ToolExplorerProps {
  readonly allViews: readonly ToolView[];
  readonly folders: readonly Folder[];
  readonly sideReadError: unknown;
  readonly onRetrySideRead: () => void;
  readonly selected: string | undefined;
  readonly selectedTags: readonly string[];
  readonly preserveQuery: string | undefined;
  readonly canWrite: boolean;
  readonly currentFolderId: string | null;
  readonly onNavigateFolder: (id: string | null) => void;
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly onEdit: (view: ToolView, folders: readonly Folder[]) => void;
  readonly renderFolderActions: ((folder: Folder) => ReactNode) | undefined;
}

export function ToolExplorer({
  allViews,
  folders,
  sideReadError,
  onRetrySideRead,
  selected,
  selectedTags,
  preserveQuery,
  canWrite,
  currentFolderId,
  onNavigateFolder,
  query,
  onQueryChange,
  onEdit,
  renderFolderActions,
}: ToolExplorerProps): ReactNode {
  const navigate = useAppNavigate();

  if (allViews.length === 0) {
    return (
      <EmptyState
        title="No tools available"
        description="Tools arrive as marketplace plugins — install one to run it here."
        action={
          <AppLink to="marketplace" search={{ kind: 'tool' }} className="tai-btn tai-btn-secondary">
            Browse marketplace
          </AppLink>
        }
      />
    );
  }

  const visibleViews = allViews.filter((view) => !view.hidden);
  const renderTool = (view: ToolView): ReactNode => (
    <ToolItem
      view={view}
      selected={view.name === selected}
      preserveTags={selectedTags}
      preserveQuery={preserveQuery}
      canWrite={canWrite}
      onEdit={(edited) => {
        onEdit(edited, folders);
      }}
    />
  );

  return (
    <>
      {sideReadError !== null ? (
        <ErrorState message={errorMessage(sideReadError)} onRetry={onRetrySideRead} />
      ) : null}

      <ExplorerView<ToolView>
        items={visibleViews}
        getItemKey={(view) => view.name}
        getFolderId={(view) => view.folderId}
        folders={folders}
        currentFolderId={currentFolderId}
        onNavigate={onNavigateFolder}
        rootLabel="All tools"
        viewSurface={TOOLS_VIEW_SURFACE}
        label="Tools"
        columns={COLUMNS}
        renderRow={(view) => <TD>{renderTool(view)}</TD>}
        renderCard={(view) => <Card interactive>{renderTool(view)}</Card>}
        onOpenItem={(view) => {
          navigate('tools', {
            tool: view.name,
            tags: selectedTags.length > 0 ? [...selectedTags] : undefined,
            q: preserveQuery,
          });
        }}
        renderFolderActions={renderFolderActions}
        search={{
          value: query,
          onChange: onQueryChange,
          matches: toolMatches,
          label: SEARCH_LABEL,
          placeholder: 'Filter by name',
        }}
        tags={
          sideReadError !== null
            ? undefined
            : {
                getTags: (view) => view.tags,
                selected: selectedTags,
                onChange: (next) => {
                  navigate('tools', {
                    tool: selected,
                    tags: next.length > 0 ? [...next] : undefined,
                    q: preserveQuery,
                  });
                },
                untaggedLabel: UNTAGGED_LABEL,
                filterLabel: 'Filter tools by tag',
                maxVisibleTags: MAX_VISIBLE_TAG_CHIPS,
              }
        }
        emptyStates={EMPTY_STATES}
      />
    </>
  );
}
