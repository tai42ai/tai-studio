/** The storage browser's per-resource and per-directory dialogs: stat, delete
 * resource, and delete directory. */
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ConfirmDialog,
  Dialog,
  ErrorState,
  JsonTree,
  Skeleton,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { storageResourcesKey, storageStatKey } from './keys';
import { monoStyle } from './storage-view';

/**
 * A dialog showing one resource's stat fields (`statStorageResource`) rendered as a
 * `JsonTree`. The stat is fetched on open; a `content_type: null` (unknown suffix)
 * renders without error.
 */
export function StatDialog({ id, onClose }: { id: string; onClose: () => void }): ReactNode {
  const api = useApi();
  const stat = useQuery({
    queryKey: storageStatKey(id),
    queryFn: ({ signal }) => api.statStorageResource(id, signal),
  });

  return (
    <Dialog
      title="Resource stat"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <p style={{ margin: '0 0 var(--tai-space-3)', ...monoStyle }}>{id}</p>
      {stat.isPending ? (
        <Skeleton height={64} />
      ) : stat.isError ? (
        <ErrorState message={errorMessage(stat.error)} onRetry={() => void stat.refetch()} />
      ) : (
        <JsonTree data={stat.data} defaultExpanded label={`Metadata for ${id}`} />
      )}
    </Dialog>
  );
}

/** The danger confirm that removes one resource and invalidates the id list. */
export function DeleteResourceDialog({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.deleteStorageResource(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: storageResourcesKey });
      onClose();
    },
  });

  return (
    <ConfirmDialog
      title="Delete resource"
      confirmLabel="Delete"
      pendingLabel="Deleting resource"
      onConfirm={() => {
        remove.mutate();
      }}
      onClose={onClose}
      isPending={remove.isPending}
      error={remove.error}
    >
      <p style={{ margin: 0 }}>
        Delete <strong style={monoStyle}>{id}</strong>? This cannot be undone.
      </p>
    </ConfirmDialog>
  );
}

/**
 * The delete-directory confirm for one folder prefix: a danger confirm that removes
 * the whole subtree (`deleteStorageDir`) and invalidates the id list. A rejected
 * delete renders the server message verbatim.
 */
export function DeleteDirDialog({ dir, onClose }: { dir: string; onClose: () => void }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.deleteStorageDir(dir),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: storageResourcesKey });
      onClose();
    },
  });

  return (
    <ConfirmDialog
      title="Delete directory"
      confirmLabel="Delete directory"
      pendingLabel="Deleting directory"
      onConfirm={() => {
        remove.mutate();
      }}
      onClose={onClose}
      isPending={remove.isPending}
      error={remove.error}
    >
      <p style={{ margin: 0 }}>
        Delete <strong style={monoStyle}>{dir}</strong> and everything under it? This cannot be
        undone.
      </p>
    </ConfirmDialog>
  );
}
