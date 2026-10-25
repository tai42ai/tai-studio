/** The Storage screen's delete dialogs: one object, and one directory. A delete the
 * server refuses because something still names the object answers 409 with its
 * holders; the dialog stays open and lists them as links. */
import {
  ConfirmDialog,
  errorMessage,
  ErrorState,
  HolderList,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { listKey, storageEntryKey, storageEntryRoot, templateNamesKey } from './keys';
import { monoStyle } from './storage-view';
import type { StorageDoor } from './use-storage-doors';

/** A refused delete: the headline (the first line when holders follow) and the list. */
function DeleteRefusal({
  error,
  subject,
  onNavigate,
}: {
  readonly error: Error;
  readonly subject: string;
  readonly onNavigate: () => void;
}): ReactNode {
  const holders = useApi().holdersFromError(error);
  const message = errorMessage(error);
  if (holders === null) return <ErrorState message={message} />;
  return (
    <>
      <ErrorState message={message.split('\n')[0] ?? message} />
      <HolderList
        holders={holders}
        lead="Still used by — remove these first:"
        label={`Holders of ${subject}`}
        onNavigate={onNavigate}
      />
    </>
  );
}

/** The danger confirm that removes one object through the delete door. */
export function DeleteResourceDialog({
  id,
  door,
  onDeleted,
  onClose,
}: {
  readonly id: string;
  readonly door: StorageDoor;
  readonly onDeleted: () => void;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: async (): Promise<void> => {
      if (door === 'storage') await api.deleteStorageResource(id);
      else await api.deleteTemplate(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKey(door) });
      void queryClient.invalidateQueries({ queryKey: templateNamesKey });
      queryClient.removeQueries({ queryKey: storageEntryKey(id) });
      onDeleted();
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
    >
      <p style={{ margin: 0 }}>
        Delete <strong style={monoStyle}>{id}</strong>? This cannot be undone.
      </p>
      {remove.isError ? (
        <DeleteRefusal error={remove.error} subject={id} onNavigate={onClose} />
      ) : null}
    </ConfirmDialog>
  );
}

/**
 * The delete-directory confirm for one folder prefix: a danger confirm that removes
 * the whole subtree and invalidates the list and every object's detail. When the open
 * object lived under the prefix, the selection clears. A rejected delete renders the
 * server message verbatim.
 */
export function DeleteDirDialog({
  dir,
  door,
  selected,
  onClose,
}: {
  readonly dir: string;
  readonly door: StorageDoor;
  readonly selected: string | undefined;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useAppNavigate();
  const remove = useMutation({
    mutationFn: async (): Promise<void> => {
      if (door === 'storage') await api.deleteStorageDir(dir);
      else await api.deleteTemplateDir(dir);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: listKey(door) });
      void queryClient.invalidateQueries({ queryKey: templateNamesKey });
      queryClient.removeQueries({ queryKey: storageEntryRoot });
      if (selected?.startsWith(`${dir}/`)) navigate('storage');
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
    >
      <p style={{ margin: 0 }}>
        Delete <strong style={monoStyle}>{dir}</strong> and everything under it? This cannot be
        undone.
      </p>
      {remove.isError ? (
        <DeleteRefusal error={remove.error} subject={dir} onNavigate={onClose} />
      ) : null}
    </ConfirmDialog>
  );
}
