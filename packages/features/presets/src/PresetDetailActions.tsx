/**
 * The preset detail header actions. A conflicted (quarantined) record is DELETE-ONLY
 * (the server 409s every other action), so only Delete shows for it. Edit details
 * stays disabled until the overlay read lands (a merge-patch on unread tags would
 * clear them) and is withdrawn entirely once a write reveals the store off.
 *
 * Each control is drawn only when the caller's access projection admits the route it
 * calls. Without the version-save grant a muted status line takes the place of "New
 * version"; the secondary controls hide without a line.
 */
import { apiRoutes } from '@tai42/api-client';
import { Button, useCanWrite } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

export function PresetDetailActions({
  presetName,
  conflicted,
  metaReady,
  metaWriteDisabled,
  onNewVersion,
  onEditDetails,
  onRename,
  onDelete,
}: {
  readonly presetName: string;
  readonly conflicted: boolean;
  readonly metaReady: boolean;
  readonly metaWriteDisabled: boolean;
  readonly onNewVersion: () => void;
  readonly onEditDetails: () => void;
  readonly onRename: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  const canSaveVersion = useCanWrite(apiRoutes.post_api_presets_name_versions.path);
  const canEditDetails = useCanWrite(apiRoutes.patch_api_tool_meta_tools_tool_name.path, 'PATCH');
  const canRename = useCanWrite(apiRoutes.post_api_presets_name_rename.path);
  const canDelete = useCanWrite(apiRoutes.delete_api_presets_name.path, 'DELETE');
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 'var(--tai-space-2)',
        flexShrink: 0,
      }}
    >
      {conflicted ? null : canSaveVersion ? (
        <Button type="button" variant="primary" onClick={onNewVersion}>
          New version
        </Button>
      ) : (
        <p
          role="status"
          style={{
            margin: 0,
            color: 'var(--tai-color-text-muted)',
            fontSize: 'var(--tai-text-sm)',
          }}
        >
          Saving a new version is outside your access — this preset is shown read-only.
        </p>
      )}
      {conflicted || metaWriteDisabled || !canEditDetails ? null : (
        <Button
          type="button"
          aria-label={`Edit details for ${presetName}`}
          // Disabled until the overlay read lands: the editor seeds from the current
          // tags, and a merge-patch built on an unread set would clear them.
          disabled={!metaReady}
          onClick={onEditDetails}
        >
          Edit details
        </Button>
      )}
      {conflicted || !canRename ? null : (
        <Button type="button" aria-label={`Rename preset ${presetName}`} onClick={onRename}>
          Rename
        </Button>
      )}
      {canDelete ? (
        <Button
          type="button"
          variant="danger"
          aria-label={`Delete preset ${presetName}`}
          onClick={onDelete}
        >
          Delete
        </Button>
      ) : null}
    </div>
  );
}
