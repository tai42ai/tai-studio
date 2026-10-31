/**
 * The folder WRITES of the tool-organization tree — create, rename, move and delete —
 * shared by every screen that shows the tree, so each offers the same actions over
 * the same client doors (`createFolder` / `renameFolder` / `moveFolder` /
 * `deleteFolder`).
 *
 * The SDK owns no query cache, so every write takes the screen's
 * `onFoldersChanged`: the screen re-reads the overlay under the shared `toolMetaKey`,
 * and the write resolves only after that refresh, so the tree on screen is never stale when
 * a dialog closes. Each dialog owns its own pending and error state, so a failure on
 * one folder never bleeds onto another, and every failure is shown in its dialog.
 *
 * Move offers every folder EXCEPT the folder itself and its descendants (a folder
 * cannot become its own ancestor), with inline create. Delete asks first and lets the
 * server enforce that only an empty folder can go; a refusal is shown in the dialog.
 *
 * Each action is offered only where the caller may make that write
 * ({@link useToolMetaWriteAccess}): its own route, and the tool_meta store not known
 * off. A not-configured refusal is reported, so every screen withdraws its overlay
 * writes; the open dialog stays to show the server's off note.
 */
import { type ReactNode, useCallback, useState } from 'react';

import { errorMessage } from '../errors';
import { FeatureDisabled, featureDisabledMessage, isFeatureDisabled } from '../feature-disabled';
import { useApi } from '../hooks/useApi';
import { ConfirmDialog } from './confirm-dialog';
import { Dialog } from './dialog';
import { Field } from './field';
import { type Folder, FolderPicker } from './folder-nav';
import { TextInput } from './inputs';
import { Button, Spinner } from './primitives';
import {
  ToolMetaWriteError,
  useReportToolMetaRefusal,
  useToolMetaWriteAccess,
} from './tool-meta-access';

/** Re-read the folder tree after a write; the write resolves once this settles. */
export type FoldersChanged = () => Promise<void>;

/** Create a folder under `parentId` and resolve with its id. */
export type CreateFolder = (name: string, parentId: string | null) => Promise<string>;

/**
 * Create a folder through the folder door and refresh the screen's tree, resolving
 * with the new folder's id — the shape {@link FolderPicker}'s `onCreateFolder`
 * takes. `undefined` when the caller may not create a folder, so the picker offers
 * no create. A rejection propagates to the picker, which shows it; a not-configured
 * refusal is also reported, withdrawing every overlay write.
 */
export function useCreateFolder(onFoldersChanged: FoldersChanged): CreateFolder | undefined {
  const api = useApi();
  const { createFolder: allowed } = useToolMetaWriteAccess();
  const reportRefusal = useReportToolMetaRefusal();
  const create = useCallback(
    async (name: string, parentId: string | null): Promise<string> => {
      let created: { readonly id: string };
      try {
        created = await api.createFolder(name, parentId);
      } catch (error: unknown) {
        reportRefusal(error);
        throw error;
      }
      await onFoldersChanged();
      return created.id;
    },
    [api, onFoldersChanged, reportRefusal],
  );
  return allowed ? create : undefined;
}

/** One write's pending + error state: `run` clears the last error, awaits the write
 *  and keeps a rejection for the dialog to show, reporting a not-configured one. */
function useFolderWrite(write: () => Promise<void>): {
  readonly run: () => void;
  readonly pending: boolean;
  readonly error: unknown;
} {
  const reportRefusal = useReportToolMetaRefusal();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const run = (): void => {
    if (pending) return;
    setPending(true);
    setError(null);
    write().then(
      () => {
        setPending(false);
      },
      (failure: unknown) => {
        setError(failure);
        setPending(false);
        reportRefusal(failure);
      },
    );
  };
  return { run, pending, error };
}

/** The ids of `folder` and every folder nested beneath it — linear in the folder
 *  count and safe on a cyclic parent chain. */
function subtreeIds(folder: Folder, folders: readonly Folder[]): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const candidate of folders) {
    if (candidate.parentId === null) continue;
    const siblings = childrenByParent.get(candidate.parentId) ?? [];
    siblings.push(candidate.id);
    childrenByParent.set(candidate.parentId, siblings);
  }
  const ids = new Set<string>([folder.id]);
  const queue = [folder.id];
  for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
    for (const childId of childrenByParent.get(next) ?? []) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      queue.push(childId);
    }
  }
  return ids;
}

interface FolderDialogProps {
  readonly folder: Folder;
  readonly onFoldersChanged: FoldersChanged;
  readonly onClose: () => void;
}

function RenameFolderDialog({ folder, onFoldersChanged, onClose }: FolderDialogProps): ReactNode {
  const api = useApi();
  const [name, setName] = useState(folder.name);
  const trimmed = name.trim();
  const rename = useFolderWrite(async () => {
    await api.renameFolder(folder.id, trimmed);
    await onFoldersChanged();
    onClose();
  });
  const blocked = trimmed === '' || trimmed === folder.name || rename.pending;

  return (
    <Dialog
      title="Rename folder"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Field label="Folder name">
        <TextInput
          value={name}
          autoComplete="off"
          onChange={(event) => {
            setName(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !blocked) {
              event.preventDefault();
              rename.run();
            }
          }}
        />
      </Field>
      <ToolMetaWriteError error={rename.error} />
      <div className="tai-dialog-actions">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" variant="primary" disabled={blocked} onClick={rename.run}>
          {rename.pending ? <Spinner label="Renaming folder" /> : null}
          Rename
        </Button>
      </div>
    </Dialog>
  );
}

function MoveFolderDialog({
  folder,
  folders,
  onFoldersChanged,
  onClose,
}: FolderDialogProps & { readonly folders: readonly Folder[] }): ReactNode {
  const api = useApi();
  const [parentId, setParentId] = useState<string | null>(folder.parentId);
  const createFolder = useCreateFolder(onFoldersChanged);
  const move = useFolderWrite(async () => {
    await api.moveFolder(folder.id, parentId);
    await onFoldersChanged();
    onClose();
  });

  const forbidden = subtreeIds(folder, folders);
  const targets = folders.filter((candidate) => !forbidden.has(candidate.id));

  return (
    <Dialog
      title={`Move ${folder.name}`}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Field label="Destination folder" description="Choose a new parent, or the root." group>
        <FolderPicker
          value={parentId}
          onChange={setParentId}
          folders={targets}
          onCreateFolder={createFolder}
          unfiledLabel="Root (no folder)"
        />
      </Field>
      <ToolMetaWriteError error={move.error} />
      <div className="tai-dialog-actions">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={parentId === folder.parentId || move.pending}
          onClick={move.run}
        >
          {move.pending ? <Spinner label="Moving folder" /> : null}
          Move
        </Button>
      </div>
    </Dialog>
  );
}

function DeleteFolderDialog({ folder, onFoldersChanged, onClose }: FolderDialogProps): ReactNode {
  const api = useApi();
  const remove = useFolderWrite(async () => {
    await api.deleteFolder(folder.id);
    await onFoldersChanged();
    onClose();
  });
  const off = isFeatureDisabled(remove.error);
  return (
    <ConfirmDialog
      title={`Delete ${folder.name}?`}
      confirmLabel="Delete folder"
      pendingLabel="Deleting folder"
      onConfirm={remove.run}
      onClose={onClose}
      isPending={remove.pending}
      error={remove.error !== null && !off ? errorMessage(remove.error) : null}
      disabledNote={
        off ? (
          <FeatureDisabled feature="Tool metadata" message={featureDisabledMessage(remove.error)} />
        ) : undefined
      }
    >
      <p>
        Only an empty folder can be deleted — one that still holds tools (hidden ones count) or
        subfolders cannot be.
      </p>
    </ConfirmDialog>
  );
}

/** Props of {@link FolderActionsMenu}. */
export interface FolderActionsMenuProps {
  /** The folder the actions act on. */
  readonly folder: Folder;
  /** The FULL folder tree, offered as move destinations. */
  readonly folders: readonly Folder[];
  /** The screen's refresh of its overlay read, awaited after every write. */
  readonly onFoldersChanged: FoldersChanged;
}

/** The Rename, Move and Delete buttons for one folder row/card, each owning its
 *  dialog — for an explorer's `renderFolderActions` slot. Each button shows only
 *  where the caller may make that write; a dialog already open stays open after its
 *  button is withdrawn, so its outcome is still shown. Renders nothing for a caller
 *  who may make none of the three writes. */
export function FolderActionsMenu({
  folder,
  folders,
  onFoldersChanged,
}: FolderActionsMenuProps): ReactNode {
  const access = useToolMetaWriteAccess();
  const [action, setAction] = useState<'rename' | 'move' | 'delete' | null>(null);
  const close = (): void => {
    setAction(null);
  };
  if (!access.renameFolder && !access.moveFolder && !access.deleteFolder && action === null) {
    return null;
  }
  return (
    <div className="tai-row">
      {access.renameFolder ? (
        <Button
          variant="ghost"
          aria-label={`Rename folder ${folder.name}`}
          onClick={() => {
            setAction('rename');
          }}
        >
          Rename
        </Button>
      ) : null}
      {access.moveFolder ? (
        <Button
          variant="ghost"
          aria-label={`Move folder ${folder.name}`}
          onClick={() => {
            setAction('move');
          }}
        >
          Move
        </Button>
      ) : null}
      {access.deleteFolder ? (
        <Button
          variant="ghost"
          aria-label={`Delete folder ${folder.name}`}
          onClick={() => {
            setAction('delete');
          }}
        >
          Delete
        </Button>
      ) : null}
      {action === 'rename' ? (
        <RenameFolderDialog folder={folder} onFoldersChanged={onFoldersChanged} onClose={close} />
      ) : null}
      {action === 'move' ? (
        <MoveFolderDialog
          folder={folder}
          folders={folders}
          onFoldersChanged={onFoldersChanged}
          onClose={close}
        />
      ) : null}
      {action === 'delete' ? (
        <DeleteFolderDialog folder={folder} onFoldersChanged={onFoldersChanged} onClose={close} />
      ) : null}
    </div>
  );
}
