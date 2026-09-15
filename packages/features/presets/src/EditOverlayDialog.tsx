/**
 * The overlay-details editor: the tool_meta DISPLAY NAME + overlay tags for the
 * preset's live tool, on the shared `OverlayDetailsFields` control. The write is a
 * MERGE-PATCH sending only those two keys (`overlayDetailsPatch`), so `folder_id` and
 * `hidden` are left untouched — this surface never owns them. Seeded from the tool's
 * current overlay row so an unedited save round-trips the same values.
 */
import {
  Button,
  Dialog,
  errorMessage,
  ErrorState,
  FeatureDisabled,
  featureDisabledMessage,
  isFeatureDisabled,
  type OverlayDetails,
  OverlayDetailsFields,
  overlayDetailsPatch,
  Spinner,
  useApi,
  useReloadToolDisplayNames,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';

import { presetToolMetaKey } from './keys';

export function EditOverlayDialog({
  toolName,
  initial,
  onClose,
  onDisabled,
}: {
  readonly toolName: string;
  readonly initial: OverlayDetails;
  readonly onClose: () => void;
  // Fired when the overlay write reveals the tool_meta store off (a 501
  // `tool-meta-not-configured`), so the parent can withdraw the Edit-details button.
  readonly onDisabled: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const reloadDisplayNames = useReloadToolDisplayNames();
  const [value, setValue] = useState<OverlayDetails>(initial);

  const save = useMutation({
    mutationFn: () => api.upsertToolMeta(toolName, overlayDetailsPatch(value)),
    onSuccess: () => {
      // The overlay row changed — refetch the tool_meta map behind the detail grid
      // and the list's display-name/tags cells, and refresh the SDK-level overlay so
      // every tool picker across the app re-labels alongside this surface.
      void queryClient.invalidateQueries({ queryKey: presetToolMetaKey });
      reloadDisplayNames();
      onClose();
    },
  });

  const disabled = isFeatureDisabled(save.error);
  useEffect(() => {
    if (disabled) onDisabled();
  }, [disabled, onDisabled]);

  return (
    <Dialog
      title={`Edit details — ${toolName}`}
      description="A display name and overlay tags for this tool. Both live in the tool_meta overlay, not the preset record."
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
