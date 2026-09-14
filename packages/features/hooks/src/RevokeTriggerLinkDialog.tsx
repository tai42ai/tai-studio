/**
 * The revoke confirm for a trigger link. Owns the delete mutation: a confirm calls
 * `api.deleteTriggerLink` and, on success, invalidates the list and closes; a
 * rejected revoke keeps the dialog open with a loud error, so the kill switch never
 * fails silently. Mounted fresh per open, so no prior row's error leaks in.
 */
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, useApi } from '@tai42/studio-sdk';

import { TRIGGER_LINKS_KEY_ROOT } from './keys';

export interface RevokeTriggerLinkDialogProps {
  readonly name: string;
  readonly onClose: () => void;
}

export function RevokeTriggerLinkDialog({
  name,
  onClose,
}: RevokeTriggerLinkDialogProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.deleteTriggerLink(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === TRIGGER_LINKS_KEY_ROOT,
      });
      onClose();
    },
  });

  return (
    <ConfirmDialog
      title="Revoke trigger link"
      confirmLabel="Revoke link"
      pendingLabel="Revoking"
      onConfirm={() => {
        mutation.mutate();
      }}
      onClose={onClose}
      isPending={mutation.isPending}
      error={mutation.isError ? mutation.error : null}
    >
      <p style={{ margin: 0 }}>
        Revoke &ldquo;{name}&rdquo;? Its URL stops working immediately and cannot be restored — a
        new link means revoke and re-create.
      </p>
    </ConfirmDialog>
  );
}
