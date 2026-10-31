/**
 * The overlay-details editor: the tool_meta DISPLAY NAME, overlay tags and FOLDER for
 * the preset's live tool — the name and tags on the shared `OverlayDetailsFields`
 * control, the folder on the shared `FolderPicker` over the FULL tree (with inline
 * create). The write is a MERGE-PATCH sending only those three keys
 * (`overlayDetailsPatch` plus `folder_id`), so `hidden` is left untouched — this
 * surface never owns it. Seeded from the tool's current overlay row so an unedited
 * save round-trips the same values.
 */
import {
  Button,
  Dialog,
  errorMessage,
  ErrorState,
  FeatureDisabled,
  featureDisabledMessage,
  Field,
  type Folder,
  FolderPicker,
  isFeatureDisabled,
  type OverlayDetails,
  OverlayDetailsFields,
  overlayDetailsPatch,
  Spinner,
  toolMetaKey,
  useApi,
  useCreateFolder,
  useReloadToolDisplayNames,
  useReportToolMetaRefusal,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useState } from 'react';

export function EditOverlayDialog({
  toolName,
  initial,
  initialFolderId,
  folders,
  onClose,
}: {
  readonly toolName: string;
  readonly initial: OverlayDetails;
  /** The folder the tool is filed in now (`null` = unfiled). */
  readonly initialFolderId: string | null;
  /** The FULL folder tree, offered as destinations. */
  readonly folders: readonly Folder[];
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const reloadDisplayNames = useReloadToolDisplayNames();
  // A not-configured refusal withdraws every overlay write app-wide, this dialog's
  // opener included; the dialog itself stays to show the off note.
  const reportRefusal = useReportToolMetaRefusal();
  const [value, setValue] = useState<OverlayDetails>(initial);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const createFolder = useCreateFolder(
    useCallback(() => queryClient.invalidateQueries({ queryKey: toolMetaKey }), [queryClient]),
  );

  const save = useMutation({
    mutationFn: () =>
      api.upsertToolMeta(toolName, { ...overlayDetailsPatch(value), folder_id: folderId }),
    onSuccess: () => {
      // The overlay row changed — refetch the tool_meta map behind the detail grid
      // and the list's display-name/tags cells, and refresh the SDK-level overlay so
      // every tool picker across the app re-labels alongside this surface.
      void queryClient.invalidateQueries({ queryKey: toolMetaKey });
      reloadDisplayNames();
      onClose();
    },
    onError: reportRefusal,
  });

  const disabled = isFeatureDisabled(save.error);

  return (
    <Dialog
      title={`Edit details — ${toolName}`}
      description="A display name, overlay tags and a folder for this tool. All live in the tool_meta overlay, not the preset record."
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {disabled ? (
        // The overlay write refused with a 501 `tool-meta-not-configured`: the store
        // is off, so no save can land. Show the muted OFF note in place of the form.
        <FeatureDisabled feature="Tool metadata" message={featureDisabledMessage(save.error)} />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
        >
          <OverlayDetailsFields
            value={value}
            onChange={setValue}
            disabled={save.isPending}
            namePlaceholder={toolName}
          />
          <Field label="Folder" description="Where this preset is filed." group>
            <FolderPicker
              value={folderId}
              onChange={setFolderId}
              folders={folders}
              onCreateFolder={createFolder}
              unfiledLabel="No folder"
              disabled={save.isPending}
            />
          </Field>
          {save.isError ? <ErrorState message={errorMessage(save.error)} /> : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={save.isPending}>
              {save.isPending ? <Spinner label="Saving details" /> : null}
              Save details
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
