/**
 * The config soft-restart control on the Settings surface.
 *
 * `POST /api/config/reload` re-reads env from the config manager, resets the settings
 * caches, and re-initializes the deployment from its manifest, on the serving worker and
 * across the fleet; then it restarts, one at a time, the workers whose moved settings need
 * a new process. It is DISTINCT from the System page's fleet door
 * (`/api/fleet/reload-config`): this is the config surface's own "apply the saved
 * configuration" action, so it lives beside the config-mode card.
 *
 * The door is admin-`fenced` server-side, so the control gates on the caller's
 * projection reaching this exact route+method (`useCanWrite`): fail-closed (disabled)
 * while the projection is not ready, and hidden entirely once ready-and-denied so a
 * non-admin never sees a button that would 403.
 *
 * A confirm dialog owns the mutation. The outcome renders through the shared
 * `FleetReloadReport`, the same report the System page's reload mounts. A failed request
 * surfaces loudly inside the dialog.
 */
import { apiRoutes, type FleetReloadResult, summarizeFleetReload } from '@tai42/api-client';
import {
  Button,
  ConfirmDialog,
  FleetReloadReport,
  useApi,
  useCanWrite,
  useCapabilities,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { configModeKey, envConfigKey, settingsSchemaKey } from './keys';

/**
 * The admin-only local soft-restart door. Admin-`fenced` server-side, so the control
 * gates on the caller's projection reaching this exact route+method.
 */
const RELOAD_ROUTE = apiRoutes.post_api_config_reload.path;

/**
 * The reload confirmation. Self-contained: it owns its mutation and is mounted only
 * while the operator confirms, so any close discards a prior error — a reopened dialog
 * starts clean. On success it invalidates the config reads the surface shows (so the
 * freshly loaded env/mode/schema are re-fetched) and hands the per-worker report back
 * through `onReloaded` for the card to render after this dialog unmounts.
 */
function ReloadConfigDialog({
  onReloaded,
  onClose,
}: {
  readonly onReloaded: (result: FleetReloadResult) => void;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const reload = useMutation({
    mutationFn: () => api.reloadConfig(null),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: envConfigKey });
      void queryClient.invalidateQueries({ queryKey: configModeKey });
      void queryClient.invalidateQueries({ queryKey: settingsSchemaKey });
      onReloaded(result);
    },
  });

  return (
    <ConfirmDialog
      title="Reload configuration"
      confirmLabel="Reload config"
      pendingLabel="Reloading config"
      confirmVariant="primary"
      isPending={reload.isPending}
      failure={{ error: reload.error, scope: 'reload' }}
      onConfirm={() => {
        reload.mutate();
      }}
      onClose={onClose}
    >
      <p style={{ margin: 0 }}>
        Soft-restart the deployment? Each worker re-reads its environment and reloads its manifest
        registries. A worker whose changed settings need a new process is then restarted, one at a
        time. No configuration is changed.
      </p>
    </ConfirmDialog>
  );
}

/**
 * The reload-configuration action for the Settings surface. Hidden for a caller whose
 * projection cannot reach the fenced door; disabled (fail-closed) until the projection
 * resolves.
 */
export function ReloadConfigButton(): ReactNode {
  const { state } = useCapabilities();
  const canReload = useCanWrite(RELOAD_ROUTE, 'POST');
  const ready = state.status === 'ready';
  const hide = ready && !canReload;

  const [confirming, setConfirming] = useState(false);
  // The last successful reload's per-worker report, kept so it persists after the
  // dialog closes; cleared when a fresh reload opens.
  const [lastReloaded, setLastReloaded] = useState<FleetReloadResult | null>(null);

  if (hide) return null;

  return (
    <div className="tai-stack tai-stack-3">
      <div>
        <Button
          variant="primary"
          disabled={!canReload}
          onClick={() => {
            setLastReloaded(null);
            setConfirming(true);
          }}
        >
          Reload configuration
        </Button>
      </div>

      {lastReloaded !== null ? (
        <FleetReloadReport
          summary={summarizeFleetReload(lastReloaded, null)}
          recycle={lastReloaded.recycle}
          scope="reload"
        />
      ) : null}

      {confirming ? (
        <ReloadConfigDialog
          onReloaded={(result) => {
            setLastReloaded(result);
            setConfirming(false);
          }}
          onClose={() => {
            setConfirming(false);
          }}
        />
      ) : null}
    </div>
  );
}
