/**
 * The reload-config confirmation. A self-contained dialog that owns its own mutation
 * and is mounted only while the operator is confirming, so any close discards the
 * mutation's error state — a reopened dialog always starts clean. On success it
 * invalidates the census and hands the per-worker fleet report back through
 * `onReloaded` so the card can render it after this (now-unmounted) dialog closes.
 */
import type { FleetResult } from '@tai42/api-client';
import { ConfirmDialog, useApi } from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { fleetWorkersKey } from './keys';

export interface ReloadConfigDialogProps {
  readonly targets: string[] | null;
  readonly onReloaded: (result: FleetResult) => void;
  readonly onClose: () => void;
}

export function ReloadConfigDialog({
  targets,
  onReloaded,
  onClose,
}: ReloadConfigDialogProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const reload = useMutation({
    mutationFn: () => api.reloadFleetConfig(targets),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: fleetWorkersKey });
      onReloaded(result);
    },
  });

  return (
    <ConfirmDialog
      title="Reload worker config"
      confirmLabel="Reload config"
      pendingLabel="Reloading config"
      confirmVariant="primary"
      isPending={reload.isPending}
      error={reload.error}
      onConfirm={() => {
        reload.mutate();
      }}
      onClose={onClose}
    >
      <p style={{ margin: 0 }}>
        {targets === null
          ? 'Soft-restart every worker in the fleet? '
          : `Soft-restart ${String(targets.length)} selected worker${targets.length === 1 ? '' : 's'}? `}
        Each targeted worker re-reads its environment and reloads its manifest registries.
      </p>
    </ConfirmDialog>
  );
}
