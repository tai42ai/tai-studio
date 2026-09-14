/**
 * The delete confirm for a registered hook. Owns the unregister mutation: a confirm
 * calls `api.unregisterHook` and, on success, invalidates the hooks list and closes;
 * a rejected removal keeps the dialog open with a loud error.
 */
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, useApi } from '@tai42/studio-sdk';

import { HOOKS_KEY_ROOT } from './keys';

export interface DeleteHookDialogProps {
  readonly name: string;
  readonly onClose: () => void;
}

export function DeleteHookDialog({ name, onClose }: DeleteHookDialogProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.unregisterHook(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === HOOKS_KEY_ROOT });
      onClose();
    },
  });

  return (
    <ConfirmDialog
      title="Delete hook"
      confirmLabel="Delete hook"
      pendingLabel="Deleting"
      onConfirm={() => {
        mutation.mutate();
      }}
      onClose={onClose}
      isPending={mutation.isPending}
      error={mutation.isError ? mutation.error : null}
    >
      <p style={{ margin: 0 }}>Unregister the hook &ldquo;{name}&rdquo;? This cannot be undone.</p>
    </ConfirmDialog>
  );
}
