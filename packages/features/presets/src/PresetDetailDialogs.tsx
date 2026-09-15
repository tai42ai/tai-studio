/**
 * The preset detail's lifecycle dialogs (rename / edit overlay details / delete /
 * save version), mounted only while open. Grouped so the detail panel composes one
 * host rather than four inline conditional mounts.
 */
import type { PresetDetail } from '@tai42/api-client';
import type { ReactNode } from 'react';

import { DeletePresetDialog } from './DeletePresetDialog';
import { EditOverlayDialog } from './EditOverlayDialog';
import { RenamePresetDialog } from './RenamePresetDialog';
import { SaveVersionDialog } from './SaveVersionDialog';

export function PresetDetailDialogs({
  preset,
  overlayDisplayName,
  overlayTags,
  saveOpen,
  renameOpen,
  editOpen,
  deleteOpen,
  onCloseSave,
  onCloseRename,
  onCloseEdit,
  onCloseDelete,
  onRenamed,
  onDeleted,
  onMetaDisabled,
}: {
  readonly preset: PresetDetail;
  readonly overlayDisplayName: string | null;
  readonly overlayTags: readonly string[];
  readonly saveOpen: boolean;
  readonly renameOpen: boolean;
  readonly editOpen: boolean;
  readonly deleteOpen: boolean;
  readonly onCloseSave: () => void;
  readonly onCloseRename: () => void;
  readonly onCloseEdit: () => void;
  readonly onCloseDelete: () => void;
  readonly onRenamed: (newName: string) => void;
  readonly onDeleted: () => void;
  readonly onMetaDisabled: () => void;
}): ReactNode {
  return (
    <>
      {renameOpen ? (
        <RenamePresetDialog name={preset.name} onClose={onCloseRename} onRenamed={onRenamed} />
      ) : null}

      {editOpen ? (
        <EditOverlayDialog
          toolName={preset.name}
          initial={{ displayName: overlayDisplayName ?? '', tags: overlayTags }}
          onClose={onCloseEdit}
          onDisabled={onMetaDisabled}
        />
      ) : null}

      {deleteOpen ? (
        <DeletePresetDialog
          name={preset.name}
          conflicted={preset.conflicted}
          onClose={onCloseDelete}
          onDeleted={onDeleted}
        />
      ) : null}

      {saveOpen ? <SaveVersionDialog detail={preset} onClose={onCloseSave} /> : null}
    </>
  );
}
