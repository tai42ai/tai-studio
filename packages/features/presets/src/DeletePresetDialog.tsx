/**
 * The delete-preset confirm. For a live preset it soft-deletes and tears down the
 * tool (and its branch tools); for a conflicted/quarantined record it only removes
 * the record (no live tool exists); when no row read says which (`conflicted` is
 * `null`, a stored row the server cannot read) the description names both. Drops the
 * deleted preset's own caches so a later same-name revisit cannot flash the removed
 * record's (credential-bearing) kwargs.
 * The delete preview lists, as links, everything that still uses the name and
 * disables Delete while it is non-empty; a 409 naming holders shows them in the same
 * list.
 */
import {
  Button,
  Dialog,
  errorMessage,
  ErrorState,
  HolderPreview,
  previewHolders,
  Spinner,
  toolsListKey,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { presetDetailKey, presetRefereesKey, presetsListKey, presetVersionsKey } from './keys';
import { refusalHeadline, usePresetHolders } from './usePresetHolders';

export function DeletePresetDialog({
  name,
  conflicted,
  onClose,
  onDeleted,
}: {
  readonly name: string;
  readonly conflicted: boolean | null;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const preview = usePresetHolders(name, 'delete');

  const remove = useMutation({
    mutationFn: () => api.deletePreset(name),
    onError: preview.invalidate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: presetsListKey });
      void queryClient.invalidateQueries({ queryKey: toolsListKey });
      // Drop the deleted preset's own caches so a later same-name create/revisit
      // cannot flash the removed record's (credential-bearing) kwargs before the
      // fresh fetch lands.
      queryClient.removeQueries({ queryKey: presetDetailKey(name) });
      queryClient.removeQueries({ queryKey: presetVersionsKey(name) });
      queryClient.removeQueries({ queryKey: presetRefereesKey(name) });
      onDeleted();
    },
  });

  const consequence =
    conflicted === null
      ? "Deletes the stored preset; a registered preset's tool (and its branch tools) is torn down with it, a quarantined record is removed alone."
      : conflicted
        ? 'Removes the quarantined record. No live tool is touched.'
        : 'Soft-deletes the preset and tears down its tool (and its branch tools).';

  const holderState = remove.isError ? preview.afterRefusal(remove.error) : preview.state;
  const hasHolders = previewHolders(holderState).length > 0;

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
        <HolderPreview
          state={holderState}
          lead="Still used by — remove these first:"
          label={`Holders of ${name}`}
          onNavigate={onClose}
        />
        {remove.isError ? (
          <ErrorState
            message={refusalHeadline(
              api.holdersFromError(remove.error),
              errorMessage(remove.error),
            )}
          />
        ) : null}
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
            disabled={remove.isPending || hasHolders}
          >
            {remove.isPending ? <Spinner label="Deleting preset" /> : null}
            Delete
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
