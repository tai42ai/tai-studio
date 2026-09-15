import {
  ConfirmDialog,
  FeatureDisabled,
  featureDisabledMessage,
  isFeatureDisabled,
  Skeleton,
  useApi,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { collectEnv, EnvVarFields } from './install-dialog';
import { installEnvBands } from './install-env';
import { marketplacePreviewKey } from './keys';

/**
 * The install confirm for a plugin whose items declare install-time env: it
 * previews to learn the server-computed `missing_env` — the vars the deployment
 * does not already provide — and collects one value per missing var. Each toggle is
 * SEEDED from the preview/detail secret band: a secret var (an OAuth client secret)
 * is locked on (the server masks it regardless, so an off toggle would lie), a free
 * var (a client id / plain marker) starts off. A blank field is omitted (the
 * deployment may still provide it); the server's install-time env refusal is the real
 * enforcement, surfaced loudly here. When `missing_env` is empty the dialog is a plain
 * one-click confirm.
 */
export function InstallEnvDialog({
  refValue,
  version,
  requiredEnvSecret,
  envHints,
  isPending,
  error,
  onSubmit,
  onClose,
}: {
  readonly refValue: string;
  readonly version: string | null;
  readonly requiredEnvSecret: Record<string, boolean>;
  readonly envHints: Record<string, string>;
  readonly isPending: boolean;
  readonly error: Error | null;
  readonly onSubmit: (env: Record<string, string>, secretKeys: string[]) => void;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  // The install preview names `missing_env` server-side (required − env store −
  // process env). No mounts: env is mount-independent, so this shares nothing with
  // the route dialog's per-mount preview.
  const previewQuery = useQuery({
    queryKey: marketplacePreviewKey(refValue, version, ''),
    queryFn: ({ signal }) =>
      api.previewMarketplaceInstall({ ref: refValue, version: version ?? undefined }, signal),
  });
  const missingVars = previewQuery.data?.missing_env ?? [];
  const [values, setValues] = useState<Record<string, string>>({});
  const [secretOverride, setSecretOverride] = useState<Record<string, boolean>>({});
  // The secret band merges the preview's per-var authority, the detail-derived
  // fallback, and the operator override; a preview/detail-secret var is LOCKED on.
  const { secretMap, lockedSecret } = installEnvBands(
    missingVars,
    previewQuery.data?.required_env ?? [],
    requiredEnvSecret,
    secretOverride,
  );

  // An OFF 501 `marketplace-not-configured` on either the preview or the install is
  // a state, not an error: the muted note replaces a loud alert and blocks the
  // confirm. A non-OFF preview failure blocks too — the missing set is unknown.
  const offError = [previewQuery.error, error].find(isFeatureDisabled) ?? null;
  const previewBlocked = previewQuery.isPending || previewQuery.isError;
  const loudError = offError !== null ? null : (error ?? previewQuery.error);

  const submit = (): void => {
    const { env, secretKeys } = collectEnv(missingVars, values, secretMap);
    onSubmit(env, secretKeys);
  };
  return (
    <ConfirmDialog
      title="Install plugin"
      confirmLabel="Install"
      pendingLabel="Installing"
      confirmVariant="primary"
      isPending={isPending || previewQuery.isPending}
      error={loudError}
      disabledNote={
        offError !== null ? (
          <FeatureDisabled
            feature="Marketplace installs"
            message={featureDisabledMessage(offError)}
          />
        ) : previewBlocked ? (
          <Skeleton height={48} />
        ) : undefined
      }
      onConfirm={submit}
      onClose={onClose}
    >
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
            onChangeValue={(name, value) => {
              setValues((prev) => ({ ...prev, [name]: value }));
            }}
            onToggleSecret={(name, checked) => {
              setSecretOverride((prev) => ({ ...prev, [name]: checked }));
            }}
          />
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
