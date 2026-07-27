/**
 * The detail panel for the selected preset. Reads `getPreset` (the record plus the
 * active version's baked `fixed_kwargs`, rendered via `JsonTree`) and exposes the
 * lifecycle actions:
 *  - New version (`SaveVersionDialog`) — hidden for a conflicted record;
 *  - Rename (`RenamePresetDialog`) — hidden for a conflicted record (a preset's
 *    name is its live tool name; the server rebinds and 409s a conflicted record);
 *  - Version history (`PresetVersions`) — hidden for a conflicted record;
 *  - Delete (confirm) — the ONLY action on a conflicted record.
 *
 * A conflicted (quarantined) preset is not registered and is DELETE-ONLY (the
 * server 409s every other action), so its detail shows a loud note and only Delete.
 * A successful delete invalidates the list + tools master list and clears `?preset=`.
 *
 * `fixed_kwargs` can carry credentials: it is rendered on this authed surface but
 * NEVER logged or toasted.
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Dialog,
  ErrorState,
  Field,
  JsonTree,
  Skeleton,
  Spinner,
  TextInput,
  errorMessage,
  toolsListKey,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';

import { PresetVersions } from './PresetVersions';
import { SaveVersionDialog } from './SaveVersionDialog';
import { TagChips } from './tags';
import { presetDetailKey, presetRefereesKey, presetVersionsKey, presetsListKey } from './keys';

function DeletePresetDialog({
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

function RenamePresetDialog({
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
          <p role="alert" style={{ margin: 0, color: 'var(--tai-color-danger)' }}>
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

export function PresetDetail({ name }: { readonly name: string }): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const query = useQuery({
    queryKey: presetDetailKey(name),
    queryFn: ({ signal }) => api.getPreset(name, signal),
  });
  const [saveOpen, setSaveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (query.isPending) {
    return (
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <Skeleton height={32} />
          <Skeleton height={120} />
        </div>
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card>
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Card>
    );
  }

  const preset = query.data;
  const conflicted = preset.conflicted;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
          <header
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 'var(--tai-space-4)',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontSize: 'var(--tai-text-lg)',
                fontFamily: 'var(--tai-font-mono)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--tai-space-2)',
                wordBreak: 'break-all',
              }}
            >
              {preset.name}
              {conflicted ? <Badge variant="danger">Conflicted</Badge> : null}
            </h2>
            <div style={{ display: 'flex', gap: 'var(--tai-space-2)', flexShrink: 0 }}>
              {conflicted ? null : (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    setSaveOpen(true);
                  }}
                >
                  New version
                </Button>
              )}
              {conflicted ? null : (
                <Button
                  type="button"
                  aria-label={`Rename preset ${preset.name}`}
                  onClick={() => {
                    setRenameOpen(true);
                  }}
                >
                  Rename
                </Button>
              )}
              <Button
                type="button"
                variant="danger"
                aria-label={`Delete preset ${preset.name}`}
                onClick={() => {
                  setDeleteOpen(true);
                }}
              >
                Delete
              </Button>
            </div>
          </header>

          {conflicted ? (
            <p role="alert" style={{ margin: 0, color: 'var(--tai-color-danger)' }}>
              {preset.conflicted_reason ??
                "This preset's name collided with an existing tool at startup — it is not registered. Delete to resolve."}
            </p>
          ) : null}

          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 'var(--tai-space-2) var(--tai-space-4)',
              margin: 0,
            }}
          >
            <dt style={{ color: 'var(--tai-color-text-muted)' }}>Base tool</dt>
            <dd style={{ margin: 0, fontFamily: 'var(--tai-font-mono)' }}>{preset.base_tool}</dd>
            <dt style={{ color: 'var(--tai-color-text-muted)' }}>Description</dt>
            <dd style={{ margin: 0 }}>{preset.description || '—'}</dd>
            <dt style={{ color: 'var(--tai-color-text-muted)' }}>Active version</dt>
            <dd style={{ margin: 0 }}>{preset.active_version}</dd>
            <dt style={{ color: 'var(--tai-color-text-muted)' }}>Tags</dt>
            <dd style={{ margin: 0 }}>
              {preset.tags.length > 0 ? <TagChips tags={preset.tags} /> : '—'}
            </dd>
            <dt style={{ color: 'var(--tai-color-text-muted)' }}>Extension combos</dt>
            <dd style={{ margin: 0 }}>{preset.extensions.length}</dd>
          </dl>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Fixed kwargs</h3>
            <Card>
              <JsonTree data={preset.fixed_kwargs} label="Fixed kwargs" />
            </Card>
          </section>

          {preset.output_schema !== null ? (
            <section
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}
            >
              <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Output schema</h3>
              <Card>
                <JsonTree data={preset.output_schema} label="Output schema" />
              </Card>
            </section>
          ) : null}

          {renameOpen ? (
            <RenamePresetDialog
              name={preset.name}
              onClose={() => {
                setRenameOpen(false);
              }}
              onRenamed={(newName) => {
                setRenameOpen(false);
                // The preset still exists under the new name — select it so the detail
                // pane stays on the renamed record rather than a now-404 old name.
                navigate('presets', { preset: newName });
              }}
            />
          ) : null}

          {deleteOpen ? (
            <DeletePresetDialog
              name={preset.name}
              conflicted={conflicted}
              onClose={() => {
                setDeleteOpen(false);
              }}
              onDeleted={() => {
                setDeleteOpen(false);
                navigate('presets', {});
              }}
            />
          ) : null}
        </div>
      </Card>

      {conflicted ? null : (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Version history</h3>
          <PresetVersions name={preset.name} />
        </section>
      )}

      {saveOpen ? (
        <SaveVersionDialog
          detail={preset}
          onClose={() => {
            setSaveOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
