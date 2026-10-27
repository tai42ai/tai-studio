/**
 * Filing ONE tool into a folder of the tool-organization tree — for a screen whose
 * rows have no edit dialog of their own to carry a folder field. The folder is part
 * of the tool's overlay row, so the write is a single `upsertToolMeta` merge-patch of
 * `folder_id`; the tool's display name, tags and visibility are left untouched.
 *
 * The picker offers the FULL tree with inline create. The write resolves only after
 * the screen's `onFoldersChanged` refresh, and a failure is shown in the dialog — a
 * not-configured refusal as the server's off note, reported so every screen withdraws
 * its overlay writes.
 */
import { type ReactNode, useState } from 'react';

import { useApi } from '../hooks/useApi';
import { Dialog } from './dialog';
import { Field } from './field';
import { type FoldersChanged, useCreateFolder } from './folder-actions';
import { type Folder, FolderPicker } from './folder-nav';
import { Button, Spinner } from './primitives';
import { ToolMetaWriteError, useReportToolMetaRefusal } from './tool-meta-access';

/** Props of {@link MoveToFolderDialog}. */
export interface MoveToFolderDialogProps {
  /** The tool whose overlay row is filed (its registered tool name). */
  readonly toolName: string;
  /** What the dialog title calls the item (e.g. the agent's name). */
  readonly label: string;
  /** The tool's current folder (`null` = unfiled). */
  readonly currentFolderId: string | null;
  /** The FULL folder tree, offered as destinations. */
  readonly folders: readonly Folder[];
  /** The screen's refresh of its overlay read, awaited after the write. */
  readonly onFoldersChanged: FoldersChanged;
  /** Close the dialog (Cancel, dismiss, or after a successful move). */
  readonly onClose: () => void;
}

/** A dialog that files one tool into a folder (or unfiles it). Mount while open. */
export function MoveToFolderDialog({
  toolName,
  label,
  currentFolderId,
  folders,
  onFoldersChanged,
  onClose,
}: MoveToFolderDialogProps): ReactNode {
  const api = useApi();
  const createFolder = useCreateFolder(onFoldersChanged);
  const reportRefusal = useReportToolMetaRefusal();
  const [folderId, setFolderId] = useState<string | null>(currentFolderId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = (): void => {
    if (pending) return;
    setPending(true);
    setError(null);
    api
      .upsertToolMeta(toolName, { folder_id: folderId })
      .then(() => onFoldersChanged())
      .then(
        () => {
          setPending(false);
          onClose();
        },
        (failure: unknown) => {
          setError(failure);
          setPending(false);
          reportRefusal(failure);
        },
      );
  };

  return (
    <Dialog
      title={`Move ${label} to a folder`}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Field label="Destination folder" description="Choose a folder, or no folder." group>
        <FolderPicker
          value={folderId}
          onChange={setFolderId}
          folders={folders}
          onCreateFolder={createFolder}
          unfiledLabel="No folder"
          disabled={pending}
        />
      </Field>
      <ToolMetaWriteError error={error} />
      <div className="tai-dialog-actions">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={folderId === currentFolderId || pending}
          onClick={save}
        >
          {pending ? <Spinner label="Moving" /> : null}
          Move
        </Button>
      </div>
    </Dialog>
  );
}
