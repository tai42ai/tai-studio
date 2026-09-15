/**
 * The detail panel for the selected preset. Reads `getPreset` (the record plus the
 * active version's baked `fixed_kwargs`, rendered via `JsonTree`) and exposes the
 * lifecycle actions: New version, Edit details (the tool_meta overlay's display name +
 * tags), Rename, Version history, and Delete. A conflicted (quarantined) preset is not
 * registered and is DELETE-ONLY (the server 409s every other action).
 *
 * The record does not carry categorization tags; the Tags row and the display name
 * both read the tool_meta overlay (`listToolMeta`), keyed by the preset's tool name.
 *
 * `fixed_kwargs` can carry credentials: it is rendered on this authed surface but
 * NEVER logged or toasted.
 */
import {
  Card,
  errorMessage,
  ErrorState,
  Skeleton,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, type Ref, useState } from 'react';

import { presetDetailKey, presetToolMetaKey } from './keys';
import { PresetBodyCards } from './PresetBodyCards';
import { PresetDetailDialogs } from './PresetDetailDialogs';
import { PresetDetailHeader } from './PresetDetailHeader';
import { PresetRecordFields } from './PresetRecordFields';
import { PresetVersions } from './PresetVersions';

export function PresetDetail({
  name,
  headingRef,
}: {
  readonly name: string;
  // Focus target for the page's master/detail focus management: the parent moves
  // focus here on a client-side selection (WCAG 2.4.3). Optional so the detail stays
  // usable standalone.
  readonly headingRef?: Ref<HTMLHeadingElement>;
}): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const query = useQuery({
    queryKey: presetDetailKey(name),
    queryFn: ({ signal }) => api.getPreset(name, signal),
  });
  // The overlay row (display name + tags) for this preset's live tool. Enrichment, not
  // load-bearing for the record — but the Edit affordance stays disabled until it
  // lands, since a merge-patch built on unread tags would clear them.
  const metaQuery = useQuery({ queryKey: presetToolMetaKey, queryFn: () => api.listToolMeta() });
  const [saveOpen, setSaveOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  // Set once an overlay write reveals the tool_meta store off (501): the Edit-details
  // affordance is then hidden — a write it can only refuse is not offered.
  const [metaWriteDisabled, setMetaWriteDisabled] = useState(false);

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
  const overlay = metaQuery.data?.meta.find((row) => row.tool_name === preset.name);
  const overlayTags = overlay?.tags ?? [];
  const overlayDisplayName = overlay?.display_name ?? null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
          <PresetDetailHeader
            presetName={preset.name}
            conflicted={conflicted}
            headingRef={headingRef}
            metaReady={metaQuery.isSuccess}
            metaWriteDisabled={metaWriteDisabled}
            onNewVersion={() => {
              setSaveOpen(true);
            }}
            onEditDetails={() => {
              setEditOpen(true);
            }}
            onRename={() => {
              setRenameOpen(true);
            }}
            onDelete={() => {
              setDeleteOpen(true);
            }}
          />

          {conflicted ? (
            <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
              {preset.conflicted_reason ??
                "This preset's name collided with an existing tool at startup — it is not registered. Delete to resolve."}
            </p>
          ) : null}

          <PresetRecordFields
            preset={preset}
            overlayDisplayName={overlayDisplayName}
            overlayTags={overlayTags}
          />

          {metaQuery.isError ? (
            // The display name + overlay tags come from a SECONDARY read; its failure
            // degrades those two rows to their empty state rather than walling the
            // detail, but it is stated (never a silent "no tags") and it is why Edit
            // details stays disabled.
            <p role="alert" style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
              Overlay details unavailable: {errorMessage(metaQuery.error)}
            </p>
          ) : null}

          <PresetBodyCards preset={preset} />
        </div>
      </Card>

      {conflicted ? null : (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Version history</h3>
          <PresetVersions name={preset.name} />
        </section>
      )}

      <PresetDetailDialogs
        preset={preset}
        overlayDisplayName={overlayDisplayName}
        overlayTags={overlayTags}
        saveOpen={saveOpen}
        renameOpen={renameOpen}
        editOpen={editOpen}
        deleteOpen={deleteOpen}
        onCloseSave={() => {
          setSaveOpen(false);
        }}
        onCloseRename={() => {
          setRenameOpen(false);
        }}
        onCloseEdit={() => {
          setEditOpen(false);
        }}
        onCloseDelete={() => {
          setDeleteOpen(false);
        }}
        onRenamed={(newName) => {
          setRenameOpen(false);
          // The preset still exists under the new name — select it so the detail pane
          // stays on the renamed record rather than a now-404 old name.
          navigate('presets', { preset: newName });
        }}
        onDeleted={() => {
          setDeleteOpen(false);
          navigate('presets', {});
        }}
        onMetaDisabled={() => {
          setMetaWriteDisabled(true);
        }}
      />
    </div>
  );
}
