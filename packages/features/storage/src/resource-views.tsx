/** The resource browser's presentational views: the per-resource action cluster and
 * the ExplorerView wiring (row, card, folder actions, search, empty states). */
import type { ReactNode } from 'react';

import {
  Button,
  Card,
  ExplorerView,
  TD,
  type ExplorerColumn,
  type Folder,
} from '@tai42/studio-sdk';

import { deriveFolders, parentPrefix } from './folders';
import { EMPTY_STATES, SEARCH_LABEL, STORAGE_VIEW_SURFACE, basename } from './storage-view';

/** The resource table's columns; folder rows span both. */
const COLUMNS: ExplorerColumn[] = [
  { key: 'resource', header: 'Resource' },
  { key: 'actions', header: <span style={{ display: 'block', textAlign: 'right' }}>Actions</span> },
];

/** The Stat / Download / Delete controls shared by a resource's row and card. */
export function ResourceActions({
  id,
  onStat,
  onDelete,
  onDownload,
  downloading,
}: {
  readonly id: string;
  readonly onStat: () => void;
  readonly onDelete: () => void;
  readonly onDownload: () => void;
  readonly downloading: boolean;
}): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 'var(--tai-space-2)', justifyContent: 'flex-end' }}>
      <Button aria-label={`Stat ${id}`} onClick={onStat}>
        Stat
      </Button>
      <Button aria-label={`Download ${id}`} onClick={onDownload} disabled={downloading}>
        Download
      </Button>
      <Button variant="ghost" aria-label={`Delete ${id}`} onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}

/** The resource id list explored through the shared {@link ExplorerView}: path-shaped
 * ids fold into virtual folders, per-file actions stay on the row/card, and a folder
 * carries the delete-directory action for its own prefix. */
export function ResourceExplorer({
  ids,
  currentFolderId,
  onNavigate,
  query,
  onQueryChange,
  downloading,
  onStat,
  onDelete,
  onDownload,
  onDeleteDir,
}: {
  readonly ids: readonly string[];
  readonly currentFolderId: string | null;
  readonly onNavigate: (id: string | null) => void;
  readonly query: string;
  readonly onQueryChange: (q: string) => void;
  readonly downloading: boolean;
  readonly onStat: (id: string) => void;
  readonly onDelete: (id: string) => void;
  readonly onDownload: (id: string) => void;
  readonly onDeleteDir: (dir: string) => void;
}): ReactNode {
  const renderActions = (id: string): ReactNode => (
    <ResourceActions
      id={id}
      downloading={downloading}
      onStat={() => {
        onStat(id);
      }}
      onDelete={() => {
        onDelete(id);
      }}
      onDownload={() => {
        onDownload(id);
      }}
    />
  );

  const renderRow = (id: string): ReactNode => (
    <>
      <TD className="tai-table-id" style={{ wordBreak: 'break-all' }}>
        {id}
      </TD>
      <TD>{renderActions(id)}</TD>
    </>
  );

  const renderCard = (id: string): ReactNode => {
    const name = basename(id);
    return (
      <Card interactive>
        <div className="tai-stack tai-stack-2">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ wordBreak: 'break-all' }}>{name}</span>
            {name !== id ? (
              <span className="tai-muted tai-mono" style={{ wordBreak: 'break-all' }}>
                {id}
              </span>
            ) : null}
          </div>
          {renderActions(id)}
        </div>
      </Card>
    );
  };

  const renderFolderActions = (folder: Folder): ReactNode => (
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
      rootLabel="All resources"
      viewSurface={STORAGE_VIEW_SURFACE}
      label="Resources"
      columns={COLUMNS}
      renderRow={renderRow}
      renderCard={renderCard}
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
