/**
 * The rename-preset dialog. A preset's name IS its live tool name, so a rename
 * rebinds the tool. The rename preview lists, as links, everything that still uses
 * the name and blocks submit while it is non-empty; the preview is ADVISORY — loading,
 * no grant or a failed read leave submit enabled and the server 409 backstops, and a
 * 409 naming holders shows them in the same list. On success it moves the record and
 * history to the new key and drops the OLD name's (credential-bearing) caches.
 */
import {
  Button,
  Dialog,
  errorMessage,
  ErrorState,
  Field,
  HolderPreview,
  previewHolders,
  Spinner,
  TextInput,
  toolsListKey,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { presetDetailKey, presetRefereesKey, presetsListKey, presetVersionsKey } from './keys';
import { refusalHeadline, usePresetHolders } from './usePresetHolders';

export function RenamePresetDialog({
  name,
  onClose,
  onRenamed,
}: {
  readonly name: string;
  readonly onClose: () => void;
  readonly onRenamed: (newName: string) => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const trimmed = newName.trim();

  const preview = usePresetHolders(name, 'rename');
  const rename = useMutation({
    mutationFn: () => api.renamePreset(name, trimmed),
    onError: preview.invalidate,
    onSuccess: (result) => {
      // A rename changes the tool listing (old gone, new present), so the master
      // list and the tool universe both go stale.
      void queryClient.invalidateQueries({ queryKey: presetsListKey });
      void queryClient.invalidateQueries({ queryKey: toolsListKey });
      // The history now lives under the new key — refetch it there.
      void queryClient.invalidateQueries({ queryKey: presetVersionsKey(result.name) });
      // Drop the OLD name's caches: they are stale (the record + history moved) and
      // can carry credential-bearing kwargs, so they must not linger.
      queryClient.removeQueries({ queryKey: presetDetailKey(name) });
      queryClient.removeQueries({ queryKey: presetVersionsKey(name) });
      queryClient.removeQueries({ queryKey: presetRefereesKey(name) });
      onRenamed(result.name);
    },
  });

  const holderState = rename.isError ? preview.afterRefusal(rename.error) : preview.state;
  const hasHolders = previewHolders(holderState).length > 0;

  return (
    <Dialog
      title={`Rename preset — ${name}`}
      description="A preset's name is its live tool name, so renaming rebinds the tool."
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          // Only the empty-name rule and the holder preview are enforced client-side;
          // the server owns the pattern / collision / holder rules and its message
          // renders verbatim.
          if (trimmed === '' || hasHolders) return;
          rename.mutate();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
      >
        <Field
          label="New name"
          error={submitted && trimmed === '' ? 'A new name is required.' : undefined}
        >
          <TextInput
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
            }}
            placeholder="renamed_tool"
            aria-required
          />
        </Field>
        <HolderPreview
          state={holderState}
          lead="Still used by — update these first:"
          label={`Holders of ${name}`}
          onNavigate={onClose}
        />
        {rename.isError ? (
          <ErrorState
            message={refusalHeadline(
              api.holdersFromError(rename.error),
              errorMessage(rename.error),
            )}
          />
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={rename.isPending || hasHolders}>
            {rename.isPending ? <Spinner label="Renaming preset" /> : null}
            Rename
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
