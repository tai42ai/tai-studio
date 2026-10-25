/**
 * The install of one marketplace plugin, in place (`PluginInstallPanel`) or in a
 * dialog (`PluginInstallDialog`). A plugin with route-carrying items installs through
 * the mount form, which also collects the preview's missing env; any other plugin
 * previews once and either collects the env the preview names or shows a plain
 * confirm.
 */
import type {
  MarketplaceInstallBody,
  MarketplaceInstallResult,
  MarketplacePluginDetail,
} from '@tai42/api-client';
import { type ReactNode, useMemo, useState } from 'react';

import { Skeleton } from '../components/primitives';
import { EnvVarFields } from './env-var-fields';
import { installEnvBands } from './install-env';
import { collectEnv } from './install-mount';
import { InstallFailure, type InstallLayout, InstallShell, storeOffNote } from './install-shell';
import { MountInstallDialog, MountInstallForm } from './mount-install';
import { deliveryOf, requiredEnvFromDetail } from './plugin-detail';
import { routeItemsOf } from './route-items';
import { useInstallAction } from './use-install-action';
import { type InstallPreviewState, useInstallPreview } from './use-install-preview';

export interface PluginInstallProps {
  readonly refValue: string;
  readonly version: string | null;
  readonly detail: MarketplacePluginDetail;
  /** After a 2xx install; the host invalidates its own caches and renders the report. */
  readonly onInstalled: (result: MarketplaceInstallResult) => void;
  /** After a failed install, already rendered in place; the host may record a store-off refusal. */
  readonly onFailed?: (error: unknown) => void;
  /** The user closed or cancelled without installing. */
  readonly onDismiss: () => void;
}

/** The env-collecting body: one value per var the deployment does not already provide. */
function EnvInstallFields({
  refValue,
  version,
  missingVars,
  values,
  secretMap,
  lockedSecret,
  envHints,
  onChangeValue,
  onToggleSecret,
}: {
  readonly refValue: string;
  readonly version: string | null;
  readonly missingVars: readonly string[];
  readonly values: Record<string, string>;
  readonly secretMap: Record<string, boolean>;
  readonly lockedSecret: Record<string, boolean>;
  readonly envHints: Record<string, string>;
  readonly onChangeValue: (name: string, value: string) => void;
  readonly onToggleSecret: (name: string, checked: boolean) => void;
}): ReactNode {
  return (
    <div className="tai-stack tai-stack-3">
      <p style={{ margin: 0 }}>
        Install {refValue}
        {version !== null ? ` v${version}` : ''}?
        {missingVars.length > 0
          ? ' This plugin needs these values to install. Leave a field blank if the deployment already provides it.'
          : ''}
      </p>
      {missingVars.length > 0 ? (
        <EnvVarFields
          requiredVars={missingVars}
          values={values}
          secret={secretMap}
          requiredSecret={lockedSecret}
          hints={envHints}
          onChangeValue={onChangeValue}
          onToggleSecret={onToggleSecret}
        />
      ) : null}
    </div>
  );
}

/**
 * The install of a plugin with no route-carrying item. Whether it needs install-time
 * env is the install PREVIEW's call — the server authority — because the registry's
 * plugin-detail body carries no per-item required_env. A preview naming required or
 * missing env collects one value per missing var (a secret var's toggle is locked
 * on, a free var starts off; a blank field is omitted, the deployment may still
 * provide it). A clean no-env preview shows the plain confirm. The submit stays
 * blocked while the preview loads or after it failed: the env picture is unverified.
 */
function NonRouteInstall({
  layout,
  refValue,
  version,
  detail,
  onInstalled,
  onFailed,
  onDismiss,
}: PluginInstallProps & { readonly layout: InstallLayout }): ReactNode {
  const request = useMemo(() => ({ ref: refValue, version }), [refValue, version]);
  const { state: previewState } = useInstallPreview(request);
  const action = useInstallAction(refValue, 'Install');
  const { requiredEnvSecret, requiredEnvHints } = requiredEnvFromDetail(detail);
  const [values, setValues] = useState<Record<string, string>>({});
  const [secretOverride, setSecretOverride] = useState<Record<string, boolean>>({});

  const preview = previewState.status === 'ready' ? previewState.preview : null;
  const needsEnv =
    preview !== null && (preview.required_env.length > 0 || preview.missing_env.length > 0);
  const missingVars = preview?.missing_env ?? [];
  // The secret band merges the preview's per-var authority, the detail-derived
  // fallback, and the operator override; a preview/detail-secret var is LOCKED on.
  const { secretMap, lockedSecret } = installEnvBands(
    missingVars,
    preview?.required_env ?? [],
    requiredEnvSecret,
    secretOverride,
  );

  const failure = action.state.status === 'failed' ? action.state.error : null;
  const submit = (): void => {
    let body: Omit<MarketplaceInstallBody, 'ref'> = {};
    if (needsEnv) {
      const { env, secretKeys } = collectEnv(missingVars, values, secretMap);
      // Every var pre-satisfied → a plain install body.
      if (Object.keys(env).length > 0) body = { env, secret_keys: secretKeys };
    }
    action.run(body).then(onInstalled, (error: unknown) => {
      onFailed?.(error);
    });
  };

  return (
    <InstallShell
      layout={layout}
      title="Install plugin"
      submitLabel="Install"
      pendingLabel="Installing"
      isPending={action.state.status === 'pending'}
      error={storeOffNote(failure) === undefined ? failure : null}
      disabledNote={previewNote(previewState) ?? storeOffNote(failure)}
      onSubmit={submit}
      onDismiss={onDismiss}
    >
      {needsEnv ? (
        <EnvInstallFields
          refValue={refValue}
          version={version}
          missingVars={missingVars}
          values={values}
          secretMap={secretMap}
          lockedSecret={lockedSecret}
          envHints={requiredEnvHints}
          onChangeValue={(name, value) => {
            setValues((prev) => ({ ...prev, [name]: value }));
          }}
          onToggleSecret={(name, checked) => {
            setSecretOverride((prev) => ({ ...prev, [name]: checked }));
          }}
        />
      ) : (
        <p style={{ margin: 0 }}>
          Install {refValue}
          {detail.latest !== null ? ` v${detail.latest.version}` : ''}?{' '}
          {/* A descriptor plugin installs nothing but its manifest entry; a packaged
              plugin is pip-installed. */}
          {deliveryOf(detail) === 'descriptor'
            ? 'The app will register this plugin and reload.'
            : 'The app will pip-install the package and reload.'}
        </p>
      )}
    </InstallShell>
  );
}

/** What the preview puts in the failure slot: a skeleton while it loads, its failure after. */
function previewNote(state: InstallPreviewState): ReactNode {
  if (state.status === 'loading') return <Skeleton height={48} />;
  if (state.status === 'failed') return <InstallFailure error={state.error} />;
  return undefined;
}

function PluginInstall({
  layout,
  ...props
}: PluginInstallProps & { readonly layout: InstallLayout }): ReactNode {
  const { refValue, version, detail, onInstalled, onFailed, onDismiss } = props;
  const routeItems = useMemo(() => routeItemsOf(detail.latest?.items ?? []), [detail]);
  if (routeItems.length === 0) return <NonRouteInstall layout={layout} {...props} />;
  const { requiredEnvSecret, requiredEnvHints } = requiredEnvFromDetail(detail);
  const Mount = layout === 'dialog' ? MountInstallDialog : MountInstallForm;
  return (
    <Mount
      refValue={refValue}
      version={version}
      verb="Install"
      routeItems={routeItems}
      requiredEnvSecret={requiredEnvSecret}
      envHints={requiredEnvHints}
      onDone={onInstalled}
      onFailed={onFailed}
      onDismiss={onDismiss}
    />
  );
}

/** The install in place, with its own Install button. */
export function PluginInstallPanel(props: PluginInstallProps): ReactNode {
  return <PluginInstall layout="panel" {...props} />;
}

/** The install in a dialog titled "Install plugin". */
export function PluginInstallDialog(props: PluginInstallProps): ReactNode {
  return <PluginInstall layout="dialog" {...props} />;
}

/** The line that stands in for an Install control this session's grant does not admit. */
export const INSTALL_NO_GRANT =
  'This session cannot install from the marketplace. Installing needs administrator access to POST /api/marketplace/install; ask an administrator to install it.';
