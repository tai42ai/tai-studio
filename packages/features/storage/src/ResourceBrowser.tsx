/** The Storage list: the ids from the list door explored through
 * {@link ResourceExplorer}, the `?q=` filter commit, and the per-directory delete. */
import {
  Card,
  errorMessage,
  ErrorState,
  type RouteSearch,
  Skeleton,
  useApi,
  useAppNavigate,
  useSearchCommit,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { listKey } from './keys';
import { ResourceExplorer } from './resource-views';
import { DeleteDirDialog } from './storage-dialogs';
import { SEARCH_LABEL } from './storage-view';
import type { StorageDoor } from './use-storage-doors';

export function ResourceBrowser({
  door,
  deleteDoor,
  selected,
  committedQuery,
  onIdsLoaded,
}: {
  readonly door: StorageDoor;
  readonly deleteDoor: StorageDoor | null;
  readonly selected: string | undefined;
  /** The committed `?q=` value from the URL (`''` when the param is absent). */
  readonly committedQuery: string;
  /** Receives the loaded ids, for the upload conflict pre-check. */
  readonly onIdsLoaded: (ids: readonly string[]) => void;
}): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const resources = useQuery({
    queryKey: listKey(door),
    queryFn: async ({ signal }): Promise<string[]> =>
      door === 'storage'
        ? (await api.listStorageResources(signal)).resources
        : api.listTemplates(signal),
  });
  useEffect(() => {
    if (resources.data !== undefined) onIdsLoaded(resources.data);
  }, [resources.data, onIdsLoaded]);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [deleteDir, setDeleteDir] = useState<string | null>(null);

  const [query, setQuery] = useState(committedQuery);
  const [seed, setSeed] = useState(committedQuery);
  // Re-seed the live filter from the committed `?q=` DURING RENDER (React's
  // adjust-state-on-prop-change pattern): a filter arriving from the URL (deep-link,
  // browser back/forward) overwrites the box so it never states a filter the list is
  // not showing.
  if (seed !== committedQuery) {
    setSeed(committedQuery);
    setQuery(committedQuery);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const buildSearch = useCallback(
    (q: string | undefined): RouteSearch<'storage'> => ({ id: selected, q }),
    [selected],
  );
  useSearchCommit({
    token: 'storage',
    containerRef,
    searchLabel: SEARCH_LABEL,
    committedValue: committedQuery,
    draft: query,
    buildSearch,
    containerMissingError: 'Storage browser container ref did not attach.',
  });
  const preserveQuery = query.trim() === '' ? undefined : query.trim();

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
        ids={resources.data}
        selected={selected}
        preserveQuery={preserveQuery}
        currentFolderId={currentFolderId}
        onNavigate={setCurrentFolderId}
        query={query}
        onQueryChange={setQuery}
        onOpen={(id) => {
          navigate('storage', { id, q: preserveQuery });
        }}
        onDeleteDir={deleteDoor === null ? null : setDeleteDir}
      />
    );
  }

  return (
    <Card>
      <div
        ref={containerRef}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
      >
        <h2 className="tai-card-title">All resources</h2>
        {body}
      </div>
      {deleteDir !== null && deleteDoor !== null ? (
        <DeleteDirDialog
          dir={deleteDir}
          door={deleteDoor}
          selected={selected}
          onClose={() => {
            setDeleteDir(null);
          }}
        />
      ) : null}
    </Card>
  );
}
