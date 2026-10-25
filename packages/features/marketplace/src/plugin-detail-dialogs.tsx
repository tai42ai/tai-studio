/** The plugin-detail action dialogs: the dispatcher that mounts the install / update /
 * uninstall dialog for the active action, and the confirm for a non-route update. */
import type { MarketplaceInstallResult, MarketplacePluginDetail } from '@tai42/api-client';
import {
  AppLink,
  ConfirmDialog,
  deliveryOf,
  errorMessage,
  FeatureDisabled,
  featureDisabledMessage,
  isFeatureDisabled,
  MountInstallDialog,
  PluginInstallDialog,
  type RouteItem,
  useInstallAction,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import type { ActiveAction, UninstallMutation } from './plugin-detail-data';

/** The host callbacks of an install or update. */
export interface PluginActionCallbacks {
  readonly onInstalled: (result: MarketplaceInstallResult) => void;
  readonly onUpdated: (result: MarketplaceInstallResult) => void;
  readonly onInstallFailed: (error: unknown) => void;
}

/** The confirm for a NON-route update — a packaged/descriptor re-fetch and reload. */
function UpdatePluginDialog({
  refValue,
  detail,
  onUpdated,
  onFailed,
  onClose,
}: {
  readonly refValue: string;
  readonly detail: MarketplacePluginDetail;
  readonly onUpdated: (result: MarketplaceInstallResult) => void;
  readonly onFailed: (error: unknown) => void;
  readonly onClose: () => void;
}): ReactNode {
  const action = useInstallAction(refValue, 'Update');
  const failure = action.state.status === 'failed' ? action.state.error : null;
  const disabled = isFeatureDisabled(failure);
  return (
    <ConfirmDialog
      title="Update plugin"
      confirmLabel="Update"
      pendingLabel="Updating"
      confirmVariant="primary"
      isPending={action.state.status === 'pending'}
      error={failure === null || disabled ? null : errorMessage(failure)}
      disabledNote={
        disabled ? (
          <FeatureDisabled
            feature="Marketplace installs"
            message={featureDisabledMessage(failure)}
          />
        ) : undefined
      }
      onConfirm={() => {
        action.run({}).then(onUpdated, onFailed);
      }}
      onClose={onClose}
    >
      <p style={{ margin: 0 }}>
        Update {refValue} to the latest version?{' '}
        {/* A descriptor plugin installs nothing but its manifest entry; a
            packaged plugin is pip-installed. */}
        {deliveryOf(detail) === 'descriptor'
          ? 'The app will re-fetch the descriptor and reload.'
          : 'The app will pip-install the package and reload.'}
      </p>
      {/* An upgrade that adds a required variable is loudly refused by the server
          (no env dialog on update); name the recourse. */}
      <p className="tai-muted" style={{ margin: 0 }}>
        If the update needs a new required variable, set it in the{' '}
        <AppLink to="settings">environment editor</AppLink>, then retry.
      </p>
    </ConfirmDialog>
  );
}

/** Mount the dialog for the active action, or nothing while none is open. */
export function PluginDetailDialogs({
  activeAction,
  refValue,
  detail,
  routeItems,
  version,
  installedMounts,
  callbacks,
  uninstallMutation,
  onClose,
}: {
  readonly activeAction: ActiveAction | null;
  readonly refValue: string;
  readonly detail: MarketplacePluginDetail;
  readonly routeItems: readonly RouteItem[];
  readonly version: string | null;
  readonly installedMounts?: Record<string, string>;
  readonly callbacks: PluginActionCallbacks;
  readonly uninstallMutation: UninstallMutation;
  readonly onClose: () => void;
}): ReactNode {
  if (activeAction === 'install') {
    return (
      <PluginInstallDialog
        refValue={refValue}
        version={version}
        detail={detail}
        onInstalled={callbacks.onInstalled}
        onFailed={callbacks.onInstallFailed}
        onDismiss={onClose}
      />
    );
  }
  if (activeAction === 'update' && routeItems.length > 0) {
    // Route-carrying plugins update through the mount dialog: the preview surfaces
    // any new collision or newly-public route to accept.
    return (
      <MountInstallDialog
        refValue={refValue}
        version={version}
        verb="Update"
        routeItems={routeItems}
        storedMounts={installedMounts}
        onDone={callbacks.onUpdated}
        onFailed={callbacks.onInstallFailed}
        onDismiss={onClose}
      />
    );
  }
  if (activeAction === 'update') {
    return (
      <UpdatePluginDialog
        refValue={refValue}
        detail={detail}
        onUpdated={callbacks.onUpdated}
        onFailed={callbacks.onInstallFailed}
        onClose={onClose}
      />
    );
  }
  if (activeAction === 'uninstall') {
    return (
      <ConfirmDialog
        title="Uninstall plugin"
        confirmLabel="Uninstall"
        pendingLabel="Uninstalling"
        isPending={uninstallMutation.isPending}
        error={uninstallMutation.error}
        onConfirm={() => {
          uninstallMutation.mutate();
        }}
        onClose={onClose}
      >
        <p style={{ margin: 0 }}>
          Uninstall {refValue}? The app will remove the package and reload.
        </p>
      </ConfirmDialog>
    );
  }
  return null;
}
