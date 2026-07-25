/**
 * The revoke confirmation dialog: deletes a key after the user confirms,
 * immediately stopping it from authenticating.
 */
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, useApi } from '@tai42/studio-sdk';

import { tokensPayloadKey } from './keys';

export function RevokeKeyDialog({
  userId,
  onClose,
}: {
  readonly userId: string;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.revokeApiKey(userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: tokensPayloadKey });
      onClose();
    },
  });
  return (
    <ConfirmDialog
      title="Revoke API key"
      confirmLabel="Revoke"
      pendingLabel="Revoking"
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={() => {
        mutation.mutate();
      }}
      onClose={onClose}
    >
      <p style={{ margin: 0 }}>
        Revoke the key for <strong>{userId}</strong>? This immediately stops it authenticating.
      </p>
    </ConfirmDialog>
  );
}
