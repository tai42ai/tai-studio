/**
 * The delete-preset confirm. For a live preset it soft-deletes and tears down the
 * tool (and its branch tools); for a conflicted/quarantined record it only removes
 * the record (no live tool exists). Drops the deleted preset's own caches so a later
 * same-name revisit cannot flash the removed record's (credential-bearing) kwargs.
 */
import {
  Button,
  Dialog,
  errorMessage,
  ErrorState,
  Spinner,
  toolsListKey,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { presetDetailKey, presetsListKey, presetVersionsKey } from './keys';

export function DeletePresetDialog({
  name,
  conflicted,
  onClose,
  onDeleted,
}: {
  readonly name: string;
  readonly conflicted: boolean;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const remove = useMutation({
    mutationFn: () => api.deletePreset(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: presetsListKey });
      void queryClient.invalidateQueries({ queryKey: toolsListKey });
      // Drop the deleted preset's own caches so a later same-name create/revisit
      // cannot flash the removed record's (credential-bearing) kwargs before the
      // fresh fetch lands.
      queryClient.removeQueries({ queryKey: presetDetailKey(name) });
      queryClient.removeQueries({ queryKey: presetVersionsKey(name) });
      onDeleted();
    },
  });

  const consequence = conflicted
    ? 'Removes the quarantined record. No live tool is touched.'
    : 'Soft-deletes the preset and tears down its tool (and its branch tools).';

  return (
    <Dialog
      title={`Delete preset — ${name}`}
      description={consequence}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        <p style={{ margin: 0 }}>
          Delete the preset <strong>{name}</strong>?
        </p>
        {remove.isError ? <ErrorState message={errorMessage(remove.error)} /> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => {
              remove.mutate();
            }}
            disabled={remove.isPending}
          >
            {remove.isPending ? <Spinner label="Deleting preset" /> : null}
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
