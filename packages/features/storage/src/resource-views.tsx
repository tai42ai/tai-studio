/** The Storage list's ExplorerView wiring: each file row opens the object's detail
 * (`?id=`) and carries no actions; a folder row carries its delete-directory action. */
import {
  AppLink,
  Button,
  Card,
  type ExplorerColumn,
  ExplorerView,
  type Folder,
  TD,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { deriveFolders, parentPrefix } from './folders';
import { basename, EMPTY_STATES, SEARCH_LABEL, STORAGE_VIEW_SURFACE } from './storage-view';

/** The resource table's one column; folder rows span it. */
const COLUMNS: ExplorerColumn[] = [{ key: 'resource', header: 'Resource' }];

function ResourceLink({
  id,
  selected,
  preserveQuery,
  children,
}: {
  readonly id: string;
  readonly selected: boolean;
  readonly preserveQuery: string | undefined;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <AppLink
      to="storage"
      search={{ id, q: preserveQuery }}
      aria-label={`Open ${id}`}
      aria-current={selected ? 'page' : undefined}
      className="tai-nav-item"
    >
      {children}
    </AppLink>
  );
}

/** The resource id list explored through the shared {@link ExplorerView}: path-shaped
 * ids fold into virtual folders, and a folder carries the delete-directory action for
 * its own prefix when the caller reaches a delete door. */
export function ResourceExplorer({
  ids,
  selected,
  preserveQuery,
  currentFolderId,
  onNavigate,
  query,
  onQueryChange,
  onOpen,
  onDeleteDir,
}: {
  readonly ids: readonly string[];
  readonly selected: string | undefined;
  readonly preserveQuery: string | undefined;
  readonly currentFolderId: string | null;
  readonly onNavigate: (id: string | null) => void;
  readonly query: string;
  readonly onQueryChange: (q: string) => void;
  readonly onOpen: (id: string) => void;
  readonly onDeleteDir: ((dir: string) => void) | null;
}): ReactNode {
  const renderRow = (id: string): ReactNode => (
    <TD className="tai-table-id" style={{ overflowWrap: 'anywhere' }}>
      <ResourceLink id={id} selected={id === selected} preserveQuery={preserveQuery}>
        <span className="tai-mono">{id}</span>
      </ResourceLink>
    </TD>
  );

  const renderCard = (id: string): ReactNode => {
    const name = basename(id);
    return (
      <Card interactive>
        <ResourceLink id={id} selected={id === selected} preserveQuery={preserveQuery}>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ overflowWrap: 'anywhere' }}>{name}</span>
            {name !== id ? (
              <span className="tai-muted tai-mono" style={{ overflowWrap: 'anywhere' }}>
                {id}
              </span>
            ) : null}
          </span>
        </ResourceLink>
      </Card>
    );
  };

  const renderFolderActions =
    onDeleteDir === null
      ? undefined
      : (folder: Folder): ReactNode => (
          <Button
            variant="ghost"
            aria-label={`Delete directory ${folder.id}`}
            onClick={() => {
              onDeleteDir(folder.id);
            }}
          >
            Delete
          </Button>
        );

  return (
    <ExplorerView<string>
      items={ids}
      getItemKey={(id) => id}
      getFolderId={(id) => parentPrefix(id)}
      folders={deriveFolders(ids)}
      currentFolderId={currentFolderId}
      onNavigate={onNavigate}
      selectedItemKey={selected}
      rootLabel="All resources"
      viewSurface={STORAGE_VIEW_SURFACE}
      label="Resources"
      columns={COLUMNS}
      renderRow={renderRow}
      renderCard={renderCard}
      onOpenItem={onOpen}
      search={{
        value: query,
        onChange: onQueryChange,
        matches: (id, q) => id.includes(q),
        label: SEARCH_LABEL,
        placeholder: 'Substring of the resource id',
      }}
      renderFolderActions={renderFolderActions}
      emptyStates={EMPTY_STATES}
    />
  );
}
