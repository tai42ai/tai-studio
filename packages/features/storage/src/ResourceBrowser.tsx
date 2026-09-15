/** The resource browser, rendered only when a storage provider is present: the id
 * list explored through {@link ResourceExplorer}, the upload dialog, and the
 * per-resource stat/delete and per-directory delete dialogs. */
import {
  Button,
  Card,
  downloadBlob,
  errorMessage,
  ErrorState,
  type RouteSearch,
  Skeleton,
  useApi,
  useSearchCommit,
} from '@tai42/studio-sdk';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type ReactNode, useCallback, useRef, useState } from 'react';

import { storageResourcesKey } from './keys';
import { ResourceExplorer } from './resource-views';
import { DeleteDirDialog, DeleteResourceDialog, StatDialog } from './storage-dialogs';
import { basename, SEARCH_LABEL } from './storage-view';
import { UploadDialog } from './UploadDialog';

export function ResourceBrowser({ initialFilter }: { initialFilter: string }): ReactNode {
  const api = useApi();
  const resources = useQuery({
    queryKey: storageResourcesKey,
    queryFn: ({ signal }) => api.listStorageResources(signal),
  });

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [statId, setStatId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteDir, setDeleteDir] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [query, setQuery] = useState(initialFilter);
  const [seed, setSeed] = useState(initialFilter);
  // Re-seed the live filter from the committed `?q=` DURING RENDER (React's
  // adjust-state-on-prop-change pattern): a filter arriving from the URL (deep-link,
  // browser back/forward) overwrites the box so it never states a filter the list is
  // not showing.
  if (seed !== initialFilter) {
    setSeed(initialFilter);
    setQuery(initialFilter);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const buildSearch = useCallback((q: string | undefined): RouteSearch<'storage'> => ({ q }), []);
  useSearchCommit({
    token: 'storage',
    containerRef,
    searchLabel: SEARCH_LABEL,
    committedValue: initialFilter,
    draft: query,
    buildSearch,
    containerMissingError: 'Storage browser container ref did not attach.',
  });

  const download = useMutation({
    mutationFn: async (id: string) => {
      const blob = await api.downloadStorageResource(id);
      downloadBlob(blob, basename(id));
    },
  });

  let body: ReactNode;
  if (resources.isPending) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={32} />
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  } else if (resources.isError) {
    body = (
      <ErrorState
        message={errorMessage(resources.error)}
        onRetry={() => void resources.refetch()}
      />
    );
  } else {
    body = (
      <ResourceExplorer
        ids={resources.data.resources}
        currentFolderId={currentFolderId}
        onNavigate={setCurrentFolderId}
        query={query}
        onQueryChange={setQuery}
        downloading={download.isPending}
        onStat={setStatId}
        onDelete={setDeleteId}
        onDownload={(id) => {
          download.mutate(id);
        }}
        onDeleteDir={setDeleteDir}
      />
    );
  }

  return (
    <Card>
      <div
        ref={containerRef}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            onClick={() => {
              setUploadOpen(true);
            }}
          >
            Upload
          </Button>
        </div>

        {download.isError ? <ErrorState message={errorMessage(download.error)} /> : null}
        {body}
      </div>

      {statId !== null ? (
        <StatDialog
          id={statId}
          onClose={() => {
            setStatId(null);
          }}
        />
      ) : null}
      {deleteId !== null ? (
        <DeleteResourceDialog
          id={deleteId}
          onClose={() => {
            setDeleteId(null);
          }}
        />
      ) : null}
      {deleteDir !== null ? (
        <DeleteDirDialog
          dir={deleteDir}
          onClose={() => {
            setDeleteDir(null);
          }}
        />
      ) : null}
      {uploadOpen ? (
        <UploadDialog
          existingIds={resources.data?.resources ?? []}
          onClose={() => {
            setUploadOpen(false);
          }}
        />
      ) : null}
    </Card>
  );
}
