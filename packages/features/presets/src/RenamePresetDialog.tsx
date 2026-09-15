/**
 * The rename-preset dialog. A preset's name IS its live tool name, so a rename
 * rebinds the tool. A referee preflight (the presets that name this one as a tool)
 * blocks a rename that would strand them; the preflight is ADVISORY — its own failure
 * leaves submit enabled and the server 409 backstops. On success it moves the record
 * and history to the new key and drops the OLD name's (credential-bearing) caches.
 */
import {
  Button,
  Dialog,
  errorMessage,
  ErrorState,
  Field,
  Spinner,
  TextInput,
  toolsListKey,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { presetDetailKey, presetRefereesKey, presetsListKey, presetVersionsKey } from './keys';

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

  // Preflight: the presets that name this one as a tool. A rename would strand them
  // (the server 409s), so a non-empty list blocks submit with a danger callout. The
  // preflight is ADVISORY — its own failure must not block a legal rename, so a fetch
  // error leaves submit enabled and the server 409 backstops.
  const refereesQuery = useQuery({
    queryKey: presetRefereesKey(name),
    queryFn: ({ signal }) => api.getPresetReferees(name, signal),
  });
  const referees = refereesQuery.data?.referees ?? [];
  const hasReferees = referees.length > 0;

  const rename = useMutation({
    mutationFn: () => api.renamePreset(name, trimmed),
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
          // Only the empty-name rule and the referee preflight are enforced
          // client-side; the server owns the pattern / collision / referee rules and
          // its message renders verbatim.
          if (trimmed === '' || hasReferees) return;
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
        {hasReferees ? (
          <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
            Referenced by: {referees.join(', ')} — update those presets first.
          </p>
        ) : null}
        {refereesQuery.isError ? (
          // Advisory preflight: a failed referees fetch must NOT block a legal
          // rename, so submit stays enabled and the error is shown small.
          <p
            style={{
              margin: 0,
              fontSize: 'var(--tai-text-sm)',
              color: 'var(--tai-color-text-muted)',
            }}
          >
            Could not check referees: {errorMessage(refereesQuery.error)}
          </p>
        ) : null}
        {rename.isError ? <ErrorState message={errorMessage(rename.error)} /> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={rename.isPending || hasReferees}>
            {rename.isPending ? <Spinner label="Renaming preset" /> : null}
            Rename
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
