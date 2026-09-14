/**
 * Pure model for the route-mounting install flow: the env value/secret split, the
 * per-var secret band derivation, and the install/update body assembly.
 */
import type { MarketplaceInstallPreview } from '@tai42/api-client';

/** The install/update body fields the mount dialog contributes. */
export interface InstallExtras {
  route_mounts: Record<string, string>;
  accept_public_routes: boolean;
  env?: Record<string, string>;
  secret_keys?: string[];
}

/**
 * The env value + secret-key split from the collected inputs: a blank field is
 * omitted (the deployment may already provide it); a filled field is marked secret
 * only when its toggle is ON.
 *
 * The toggle state is SEEDED from the server's per-var `required_env[].secret`, so
 * secret-ness comes from that authority, not a blanket default: a `secret: true`
 * var (an OAuth client secret) is masked, a `secret: false` var (a client id) is
 * not unless the operator turns it on. Keying off `=== true` honors an off toggle
 * and never force-masks — an un-seeded var stays out of the secret band.
 */
export function collectEnv(
  requiredVars: readonly string[],
  values: Record<string, string>,
  secret: Record<string, boolean>,
): { env: Record<string, string>; secretKeys: string[] } {
  const env: Record<string, string> = {};
  const secretKeys: string[] = [];
  for (const name of requiredVars) {
    const value = values[name] ?? '';
    if (value === '') continue;
    env[name] = value;
    if (secret[name] === true) secretKeys.push(name);
  }
  return { env, secretKeys };
}

/**
 * The effective per-var secret band for the vars to collect: the SERVER's per-var
 * `required_env[].secret` from the preview (the authority), OR the caller-supplied
 * `requiredEnvSecret`, OR an operator override.
 */
export function deriveEnvSecretMap(
  envToCollect: readonly string[],
  preview: MarketplaceInstallPreview | undefined,
  requiredEnvSecret: Record<string, boolean> | undefined,
  envSecretOverride: Record<string, boolean>,
): Record<string, boolean> {
  const previewEnvSecret: Record<string, boolean> = {};
  for (const req of preview?.required_env ?? []) previewEnvSecret[req.name] = req.secret;
  return Object.fromEntries(
    envToCollect.map((name) => [
      name,
      previewEnvSecret[name] === true ||
        requiredEnvSecret?.[name] === true ||
        envSecretOverride[name] === true,
    ]),
  );
}

/**
 * Assemble the install/update body. INSTALL sends every base (declared default is
 * correct). UPDATE sends ONLY the items whose base changed from its current stored
 * base — omitted items are preserved by the server's stored-mount precedence, so a
 * plugin installed at a non-default base is never reset to default on an edit-free
 * update. Collected env is attached only when at least one value was filled.
 */
export function buildInstallExtras(
  verb: 'Install' | 'Update',
  bases: Record<string, string>,
  seededBases: Record<string, string>,
  accepted: boolean,
  envToCollect: readonly string[],
  envValues: Record<string, string>,
  envSecretMap: Record<string, boolean>,
): InstallExtras {
  const route_mounts =
    verb === 'Update'
      ? Object.fromEntries(
          Object.entries(bases).filter(([name, base]) => base !== seededBases[name]),
        )
      : bases;
  const extras: InstallExtras = { route_mounts, accept_public_routes: accepted };
  if (envToCollect.length > 0) {
    const { env, secretKeys } = collectEnv(envToCollect, envValues, envSecretMap);
    if (Object.keys(env).length > 0) {
      extras.env = env;
      extras.secret_keys = secretKeys;
    }
  }
  return extras;
}
