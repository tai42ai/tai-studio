/** The plugin-detail mutation dialogs: the non-route install (env-aware), and the
 * dispatcher that mounts the install / update / uninstall dialog for the active action. */
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  AppLink,
  ConfirmDialog,
  ErrorState,
  FeatureDisabled,
  Skeleton,
  errorMessage,
  featureDisabledMessage,
  isFeatureDisabled,
  useApi,
} from '@tai42/studio-sdk';
import type { MarketplaceInstallBody, MarketplacePluginDetail } from '@tai42/api-client';

import { MountInstallDialog, type RouteItem } from './install-dialog';
import { InstallEnvDialog } from './install-env-dialog';
import { marketplacePreviewKey } from './keys';
import {
  deliveryOf,
  type ActiveAction,
  type InstallMutation,
  type UninstallMutation,
} from './plugin-detail-data';

/**
 * The install dialog for a NON-route plugin. Whether the plugin needs install-time
 * env is the install PREVIEW's call — the server authority — because the registry's
 * plugin-detail body carries no per-item required_env. This previews with no env and
 * routes on the result: a preview naming required/missing env opens the env dialog; a
 * clean no-env preview (and the pending window) shows the plain confirm; a FAILED
 * preview blocks it there rather than committing an unverified empty body.
 */
function NonRouteInstallDialog({
  refValue,
  version,
  detail,
  requiredEnvSecret,
  envHints,
  isPending,
  error,
  onInstall,
  onClose,
}: {
  readonly refValue: string;
  readonly version: string | null;
  readonly detail: MarketplacePluginDetail;
  readonly requiredEnvSecret: Record<string, boolean>;
  readonly envHints: Record<string, string>;
  readonly isPending: boolean;
  readonly error: Error | null;
  readonly onInstall: (body: Omit<MarketplaceInstallBody, 'ref'>) => void;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  // The env-less install preview: `required_env` (every var the spec needs) and
  // `missing_env` (those the deployment does not already provide). No mounts — env is
  // mount-independent — so this shares its cache key with the env dialog's own preview.
  const previewQuery = useQuery({
    queryKey: marketplacePreviewKey(refValue, version, ''),
    queryFn: ({ signal }) =>
      api.previewMarketplaceInstall({ ref: refValue, version: version ?? undefined }, signal),
  });
  const preview = previewQuery.data;
  // Env is needed only when the SERVER's dry-run says so. A resolved preview that
  // names required or missing env routes to the env-collecting dialog; everything
  // else — the pending window, a clean no-env preview, and a FAILED dry-run — stays
  // on the plain confirm.
  const needsEnv =
    preview !== undefined && (preview.required_env.length > 0 || preview.missing_env.length > 0);

  if (needsEnv) {
    return (
      <InstallEnvDialog
        refValue={refValue}
        version={version}
        requiredEnvSecret={requiredEnvSecret}
        envHints={envHints}
        isPending={isPending}
        error={error}
        onSubmit={(env, secretKeys) => {
          // Every var pre-satisfied → a plain install body; otherwise carry the
          // collected values and their secret marks.
          onInstall(Object.keys(env).length > 0 ? { env, secret_keys: secretKeys } : {});
        }}
        onClose={onClose}
      />
    );
  }

  // The env picture is unverified until the dry-run resolves, so the plain confirm
  // never commits an empty body prematurely: an OFF 501 shows the muted note; a
  // non-OFF preview failure blocks loudly; and the PENDING window blocks too.
  const offError = [previewQuery.error, error].find(isFeatureDisabled) ?? null;
  const previewLoud = isFeatureDisabled(previewQuery.error) ? null : previewQuery.error;
  const disabledNote =
    offError !== null ? (
      <FeatureDisabled feature="Marketplace installs" message={featureDisabledMessage(offError)} />
    ) : previewLoud !== null ? (
      <ErrorState message={errorMessage(previewLoud)} />
    ) : previewQuery.isPending ? (
      <Skeleton height={48} />
    ) : undefined;

  return (
    <ConfirmDialog
      title="Install plugin"
      confirmLabel="Install"
      pendingLabel="Installing"
      confirmVariant="primary"
      isPending={isPending}
      error={disabledNote !== undefined || isFeatureDisabled(error) ? null : error}
      disabledNote={disabledNote}
      onConfirm={() => {
        onInstall({});
      }}
      onClose={onClose}
    >
      <p style={{ margin: 0 }}>
        Install {refValue}
        {detail.latest !== null ? ` v${detail.latest.version}` : ''}?{' '}
        {/* A descriptor plugin installs nothing but its manifest entry; a
            packaged plugin is pip-installed. */}
        {deliveryOf(detail) === 'descriptor'
          ? 'The app will register this plugin and reload.'
          : 'The app will pip-install the package and reload.'}
      </p>
    </ConfirmDialog>
  );
}

/** The confirm for a NON-route update — a packaged/descriptor re-fetch and reload. */
function UpdatePluginDialog({
  refValue,
  detail,
  updateMutation,
  onClose,
}: {
  readonly refValue: string;
  readonly detail: MarketplacePluginDetail;
  readonly updateMutation: InstallMutation;
  readonly onClose: () => void;
}): ReactNode {
  const disabled = isFeatureDisabled(updateMutation.error);
  return (
    <ConfirmDialog
      title="Update plugin"
      confirmLabel="Update"
      pendingLabel="Updating"
      confirmVariant="primary"
      isPending={updateMutation.isPending}
      error={disabled ? null : updateMutation.error}
      disabledNote={
        disabled ? (
          <FeatureDisabled
            feature="Marketplace installs"
            message={featureDisabledMessage(updateMutation.error)}
          />
        ) : undefined
      }
      onConfirm={() => {
        updateMutation.mutate({});
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

/** Mount the dialog for the active mutation, or nothing while none is open. */
export function PluginDetailDialogs({
  activeAction,
  refValue,
  detail,
  routeItems,
  version,
  requiredEnvSecret,
  requiredEnvHints,
  installedMounts,
  installMutation,
  updateMutation,
  uninstallMutation,
  onClose,
}: {
  readonly activeAction: ActiveAction | null;
  readonly refValue: string;
  readonly detail: MarketplacePluginDetail;
  readonly routeItems: readonly RouteItem[];
  readonly version: string | null;
  readonly requiredEnvSecret: Record<string, boolean>;
  readonly requiredEnvHints: Record<string, string>;
  readonly installedMounts?: Record<string, string>;
  readonly installMutation: InstallMutation;
  readonly updateMutation: InstallMutation;
  readonly uninstallMutation: UninstallMutation;
  readonly onClose: () => void;
}): ReactNode {
  if (activeAction === 'install') {
    // Route-carrying plugins mount through the preview dialog, which also collects
    // the preview's missing env in the same flow; a non-route plugin previews for env.
    return routeItems.length > 0 ? (
      <MountInstallDialog
        refValue={refValue}
        version={version}
        verb="Install"
        routeItems={routeItems}
        requiredEnvSecret={requiredEnvSecret}
        envHints={requiredEnvHints}
        onSubmit={(extras) => installMutation.mutateAsync(extras).then(() => undefined)}
        onClose={onClose}
      />
    ) : (
      <NonRouteInstallDialog
        refValue={refValue}
        version={version}
        detail={detail}
        requiredEnvSecret={requiredEnvSecret}
        envHints={requiredEnvHints}
        isPending={installMutation.isPending}
        error={installMutation.error}
        onInstall={(body) => {
          installMutation.mutate(body);
        }}
        onClose={onClose}
      />
    );
  }
  if (activeAction === 'update' && routeItems.length > 0) {
    // Route-carrying plugins update through the same mount dialog: the preview
    // surfaces any new collision or newly-public route to accept.
    return (
      <MountInstallDialog
        refValue={refValue}
        version={version}
        verb="Update"
        routeItems={routeItems}
        storedMounts={installedMounts}
        onSubmit={(extras) => updateMutation.mutateAsync(extras).then(() => undefined)}
        onClose={onClose}
      />
    );
  }
  if (activeAction === 'update') {
    return (
      <UpdatePluginDialog
        refValue={refValue}
        detail={detail}
        updateMutation={updateMutation}
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
