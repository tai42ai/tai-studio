/**
 * The settings-profile data types and the CLIENT-SIDE secret masking for the
 * Profiles tab: a value is masked whenever the profile marks its key secret OR a
 * settings class owns it as secret (the secret-mask union).
 */
import type { ApiClient } from '@tai42/api-client';

/** The stored profile document (`{ description, env, secret_keys }`). */
export type ProfileBody = Awaited<ReturnType<ApiClient['getSettingsProfile']>>;
export type ProfileDiff = Awaited<ReturnType<ApiClient['diffSettingsProfile']>>;
export type ApplyResponse = Awaited<ReturnType<ApiClient['applySettingsProfile']>>;
export type ProfileVersion = Awaited<ReturnType<ApiClient['getSettingsProfileVersion']>>;

/** The masked stand-in for a secret value — display only; the real value never renders. */
export const MASK = '••••••';

/** The secret-mask union: a key is masked when the settings class owns it as secret OR the profile marks it secret. */
export function isSecretKey(
  key: string,
  secretKeys: ReadonlySet<string>,
  ownedSecret: ReadonlyMap<string, boolean>,
): boolean {
  return (ownedSecret.get(key) ?? false) || secretKeys.has(key);
}

/** A profile/version body with every secret env value replaced by the mask — a read view. */
export function maskBody(body: ProfileBody, ownedSecret: ReadonlyMap<string, boolean>): unknown {
  const secretKeys = new Set(body.secret_keys);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(body.env)) {
    env[key] = isSecretKey(key, secretKeys, ownedSecret) ? MASK : value;
  }
  return { description: body.description, env, secret_keys: body.secret_keys };
}

/**
 * The diff carries REAL env values (secret route). The preview masks every value —
 * the key names and the recycle/refused key lists are the actionable safety
 * information, and the change kind is spelled out by `JsonDiff` from the masked
 * before/after (`was`/`now` differ, so a changed key never collapses to no row).
 */
export function maskedDiffSides(diff: ProfileDiff): { before: unknown; after: unknown } {
  const before: Record<string, string> = {};
  const after: Record<string, string> = {};
  for (const key of diff.removed) before[key] = MASK;
  for (const key of diff.added) after[key] = MASK;
  for (const change of diff.changed) {
    before[change.key] = `${MASK} (was)`;
    after[change.key] = `${MASK} (now)`;
  }
  return { before, after };
}
