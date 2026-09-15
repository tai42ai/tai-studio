/**
 * The preset detail header actions. A conflicted (quarantined) record is DELETE-ONLY
 * (the server 409s every other action), so only Delete shows for it. Edit details
 * stays disabled until the overlay read lands (a merge-patch on unread tags would
 * clear them) and is withdrawn entirely once a write reveals the store off.
 */
import { Button } from '@tai42/studio-sdk';
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
  return (
    <div style={{ display: 'flex', gap: 'var(--tai-space-2)', flexShrink: 0 }}>
      {conflicted ? null : (
        <Button type="button" variant="primary" onClick={onNewVersion}>
          New version
        </Button>
      )}
      {conflicted || metaWriteDisabled ? null : (
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
      {conflicted ? null : (
        <Button type="button" aria-label={`Rename preset ${presetName}`} onClick={onRename}>
          Rename
        </Button>
      )}
      <Button
        type="button"
        variant="danger"
        aria-label={`Delete preset ${presetName}`}
        onClick={onDelete}
      >
        Delete
      </Button>
    </div>
  );
}
