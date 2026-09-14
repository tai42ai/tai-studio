/**
 * The view-model for the route-mounting install / update dialog: the per-item base
 * state, the debounced live preview, the derived collision/public/env surfaces, and
 * the submit-body assembly. The parent owns the mutation via `onSubmit`.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@tai42/studio-sdk';

import { marketplacePreviewKey } from './keys';
import type { RouteItem } from './install-dialog';
import { buildInstallExtras, deriveEnvSecretMap, type InstallExtras } from './install-mount';

/** How long after the last base keystroke the preview refetches. */
const PREVIEW_DEBOUNCE_MS = 250;

/**
 * Track a value that only settles `delayMs` after it last changed. The first
 * value settles immediately, so a preview fires on open before any edit.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return settled;
}

/** The props the mount dialog hands its view-model. */
export interface UseMountInstallProps {
  readonly refValue: string;
  readonly version: string | null;
  readonly verb: 'Install' | 'Update';
  readonly routeItems: readonly RouteItem[];
  readonly storedMounts?: Record<string, string>;
  readonly requiredEnvSecret?: Record<string, boolean>;
  readonly onSubmit: (extras: InstallExtras) => Promise<void>;
}

export function useMountInstall(props: UseMountInstallProps) {
  const { refValue, version, verb, routeItems, storedMounts, requiredEnvSecret, onSubmit } = props;
  const api = useApi();

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

  // The serialized map is the debounce + cache key: a stable string that only
  // changes when a base actually changes, so identity churn never refetches.
  const basesKey = JSON.stringify(bases);
  const debouncedKey = useDebouncedValue(basesKey, PREVIEW_DEBOUNCE_MS);
  const debouncedBases = useMemo(
    () => JSON.parse(debouncedKey) as Record<string, string>,
    [debouncedKey],
  );

  const previewQuery = useQuery({
    queryKey: marketplacePreviewKey(refValue, version, debouncedKey),
    queryFn: ({ signal }) =>
      api.previewMarketplaceInstall(
        { ref: refValue, version: version ?? undefined, route_mounts: debouncedBases },
        signal,
      ),
    // Keep the last resolved paths on screen while a remap re-previews, so the
    // list does not blank on every keystroke.
    placeholderData: (prev) => prev,
  });

  const preview = previewQuery.data;
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
    previewQuery.isError ||
    preview === undefined ||
    collisions.length > 0 ||
    (requiresAccept && !accepted);

  const submit = (): Promise<void> =>
    onSubmit(
      buildInstallExtras(verb, bases, seededBases, accepted, envToCollect, envValues, envSecretMap),
    );

  return {
    bases,
    setBases,
    accepted,
    setAccepted,
    envValues,
    setEnvValues,
    setEnvSecretOverride,
    preview,
    previewIsError: previewQuery.isError,
    collisions,
    publicRows,
    requiresAccept,
    envToCollect,
    envSecretMap,
    blocked,
    submit,
  };
}
