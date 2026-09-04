/**
 * Per-folder actions for the tools explorer — Rename and Move, the UI over the
 * existing `renameFolder` / `moveFolder` client doors (folder records the overlay
 * backs). Rendered through the explorer's `renderFolderActions` slot, so each folder
 * row/card carries its own action buttons; each opens a small dialog and owns its own
 * mutation, so a failure on one row never bleeds onto another.
 *
 * Move offers the folder tree as a parent picker (with inline create), excluding the
 * folder itself and its descendants — a folder cannot become its own ancestor. Both
 * writes invalidate the overlay so the tree re-reads. Rendered only for a caller that
 * can write the overlay (the same gate the per-tool edit affordance uses).
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  ErrorState,
  Field,
  FolderPicker,
  Spinner,
  TextInput,
  errorMessage,
  useApi,
  type Folder,
} from '@tai42/studio-sdk';

import { toolMetaKey } from './keys';

/** The ids of `folder` and every folder nested beneath it — the illegal move targets
 *  (a folder cannot move into itself or one of its own descendants). */
export function subtreeIds(folder: Folder, folders: readonly Folder[]): Set<string> {
  const ids = new Set<string>([folder.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const candidate of folders) {
      if (candidate.parentId !== null && ids.has(candidate.parentId) && !ids.has(candidate.id)) {
        ids.add(candidate.id);
        grew = true;
      }
    }
  }
  return ids;
}

function RenameFolderDialog({
  folder,
  onClose,
}: {
  readonly folder: Folder;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [name, setName] = useState(folder.name);
  const rename = useMutation({
    mutationFn: (next: string) => api.renameFolder(folder.id, next),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: toolMetaKey });
      onClose();
    },
  });

  const trimmed = name.trim();
  const unchanged = trimmed === folder.name;
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
            if (event.key === 'Enter' && trimmed !== '' && !unchanged) {
              event.preventDefault();
              rename.mutate(trimmed);
            }
          }}
        />
      </Field>
      {rename.isError ? <ErrorState message={errorMessage(rename.error)} /> : null}
      <div className="tai-dialog-actions">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={trimmed === '' || unchanged || rename.isPending}
          onClick={() => {
            rename.mutate(trimmed);
          }}
        >
          {rename.isPending ? <Spinner label="Renaming folder" /> : null}
          Rename
        </Button>
      </div>
    </Dialog>
  );
}

function MoveFolderDialog({
  folder,
  folders,
  onClose,
}: {
  readonly folder: Folder;
  readonly folders: readonly Folder[];
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [parentId, setParentId] = useState<string | null>(folder.parentId);

  // A folder cannot move into itself or one of its descendants — offer every OTHER
  // folder as a parent, plus the root.
  const forbidden = subtreeIds(folder, folders);
  const targets = folders.filter((candidate) => !forbidden.has(candidate.id));

  const move = useMutation({
    mutationFn: (next: string | null) => api.moveFolder(folder.id, next),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: toolMetaKey });
      onClose();
    },
  });

  const createFolder = async (name: string, underParent: string | null): Promise<string> => {
    const created = await api.createFolder(name, underParent);
    await queryClient.invalidateQueries({ queryKey: toolMetaKey });
    return created.id;
  };

  const unchanged = parentId === folder.parentId;
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
      {move.isError ? <ErrorState message={errorMessage(move.error)} /> : null}
      <div className="tai-dialog-actions">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={unchanged || move.isPending}
          onClick={() => {
            move.mutate(parentId);
          }}
        >
          {move.isPending ? <Spinner label="Moving folder" /> : null}
          Move
        </Button>
      </div>
    </Dialog>
  );
}

/** The Rename + Move buttons for one folder row/card, each owning its dialog. */
export function FolderActionsMenu({
  folder,
  folders,
}: {
  readonly folder: Folder;
  readonly folders: readonly Folder[];
}): ReactNode {
  const [action, setAction] = useState<'rename' | 'move' | null>(null);
  return (
    <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
      <Button
        variant="ghost"
        aria-label={`Rename folder ${folder.name}`}
        onClick={() => {
          setAction('rename');
        }}
      >
        Rename
      </Button>
      <Button
        variant="ghost"
        aria-label={`Move folder ${folder.name}`}
        onClick={() => {
          setAction('move');
        }}
      >
        Move
      </Button>
      {action === 'rename' ? (
        <RenameFolderDialog
          folder={folder}
          onClose={() => {
            setAction(null);
          }}
        />
      ) : null}
      {action === 'move' ? (
        <MoveFolderDialog
          folder={folder}
          folders={folders}
          onClose={() => {
            setAction(null);
          }}
        />
      ) : null}
    </div>
  );
}
