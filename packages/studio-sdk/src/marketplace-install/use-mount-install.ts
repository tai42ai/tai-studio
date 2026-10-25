/**
 * The view-model for the route-mounting install / update form: the per-item base
 * state, the debounced live preview, the derived collision/public/env surfaces, and
 * the body the submit sends.
 */
import type { MarketplaceInstallPreview } from '@tai42/api-client';
import { useMemo, useState } from 'react';

import { buildInstallExtras, deriveEnvSecretMap, type InstallExtras } from './install-mount';
import type { RouteItem } from './route-items';
import { useDebouncedValue } from './use-debounced-value';
import { type InstallPreviewState, useInstallPreview } from './use-install-preview';

/** How long after the last base keystroke the preview refetches. */
const PREVIEW_DEBOUNCE_MS = 250;

/** The inputs the mount form hands its view-model. */
export interface UseMountInstallProps {
  readonly refValue: string;
  readonly version: string | null;
  readonly verb: 'Install' | 'Update';
  readonly routeItems: readonly RouteItem[];
  readonly storedMounts?: Record<string, string>;
  readonly requiredEnvSecret?: Record<string, boolean>;
}

/** The preview on screen: the ready one, else the last ready one while a remap re-previews. */
function shownPreview(state: InstallPreviewState): MarketplaceInstallPreview | undefined {
  if (state.status === 'ready') return state.preview;
  if (state.status === 'loading') return state.previous ?? undefined;
  return undefined;
}

export function useMountInstall(props: UseMountInstallProps) {
  const { refValue, version, verb, routeItems, storedMounts, requiredEnvSecret } = props;

  // The base each item is CURRENTLY mounted at: the stored mount on update, the
  // declared default on install (or for an item the install added). This seeds the
  // inputs and, on update, is the baseline the submit diffs against so an untouched
  // base is OMITTED and the server preserves it.
  const seededBases = useMemo(
    () =>
      Object.fromEntries(
        routeItems.map((item) => [item.name, storedMounts?.[item.name] ?? item.routes.base]),
      ),
    [routeItems, storedMounts],
  );
  const [bases, setBases] = useState<Record<string, string>>(seededBases);
  const [accepted, setAccepted] = useState(false);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  // Only OPERATOR overrides live in state; each toggle's baseline is the derived
  // `requiredEnvSecret`, so a var starts secret iff the server marks it so — no
  // async seed to miss when the preview lands.
  const [envSecretOverride, setEnvSecretOverride] = useState<Record<string, boolean>>({});

  // The serialized map is the debounce key: a stable string that only changes when a
  // base actually changes, so identity churn never re-previews.
  const debouncedKey = useDebouncedValue(JSON.stringify(bases), PREVIEW_DEBOUNCE_MS);
  const request = useMemo(
    () => ({
      ref: refValue,
      version,
      route_mounts: JSON.parse(debouncedKey) as Record<string, string>,
    }),
    [refValue, version, debouncedKey],
  );
  const { state } = useInstallPreview(request);

  const preview = shownPreview(state);
  const previewIsError = state.status === 'failed';
  const collisions = preview?.collisions ?? [];
  const publicRows = preview?.new_public_routes ?? [];
  const requiresAccept = preview?.requires_public_acceptance ?? false;
  // The env to collect is the preview's server-computed missing set — only on
  // INSTALL: an update that would add a required var is refused server-side, so the
  // update flow never collects env.
  const envToCollect = verb === 'Install' ? (preview?.missing_env ?? []) : [];
  const envSecretMap = deriveEnvSecretMap(
    envToCollect,
    preview,
    requiredEnvSecret,
    envSecretOverride,
  );
  // Submit is blocked until a clean preview exists with no collision and any
  // required public acceptance given. A preview error blocks too — an unverified
  // mount must never be committed.
  const blocked =
    previewIsError ||
    preview === undefined ||
    collisions.length > 0 ||
    (requiresAccept && !accepted);

  const extras = (): InstallExtras =>
    buildInstallExtras(verb, bases, seededBases, accepted, envToCollect, envValues, envSecretMap);

  return {
    bases,
    setBases,
    accepted,
    setAccepted,
    envValues,
    setEnvValues,
    setEnvSecretOverride,
    preview,
    previewIsError,
    collisions,
    publicRows,
    requiresAccept,
    envToCollect,
    envSecretMap,
    blocked,
    extras,
  };
}

export type MountInstallModel = ReturnType<typeof useMountInstall>;
