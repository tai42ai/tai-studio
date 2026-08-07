/**
 * TanStack Query key factory for the settings surface. Centralising the keys
 * keeps the query definitions and the post-mutation invalidations referring to
 * the exact same tuples.
 *
 * `subMcpKey` and `tokensPayloadKey` are SDK-owned — two features read each.
 */
export { subMcpKey, tokensPayloadKey } from '@tai42/studio-sdk';

/** Key for the config-source mode (mode label + read-only flag). */
export const configModeKey = ['config-mode'] as const;

/** Key for the environment map (`{ env, secret_keys }`). */
export const envConfigKey = ['env-config'] as const;

/** Key for the settings-class schema (grouped, typed field descriptions). */
export const settingsSchemaKey = ['settings-schema'] as const;

/** Key for the `{ url: scope_id }` scope map. */
export const scopesKey = ['auth-scopes'] as const;

/** Key for the app's HTTP route catalog (`[{ path, methods, mapped }]`). */
export const authRoutesKey = ['auth-routes'] as const;

/** Key for the urls pinned to the public marker. */
export const publicRoutesKey = ['auth-public-routes'] as const;

/** Key for the deployment's auth capabilities (`{ mintable, providers }`). */
export const authCapabilitiesKey = ['auth-capabilities'] as const;

/** Key for a user's append-only AC-policy version history. */
export const policyVersionsKey = (userId: string) => ['auth-policy-versions', userId] as const;

/** Key for the editable role list (full bodies incl. the per-tag grant map). */
export const rolesKey = ['auth-roles'] as const;

/** Key for a role's append-only version history + audit trail. */
export const roleVersionsKey = (name: string) => ['auth-role-versions', name] as const;

/** Key for the template-manager template ids (named-condition selector source). */
export const templateNamesKey = ['auth-template-names'] as const;

/** Key for the available backup sections (`{ name, secret }`). */
export const backupSectionsKey = ['backup-sections'] as const;

/** Key for the settings-profile list (names + descriptions only). */
export const settingsProfilesKey = ['settings-profiles'] as const;

/** Key for one settings profile's stored body (`{ description, env, secret_keys }`). */
export const settingsProfileKey = (name: string) => ['settings-profiles', name] as const;

/** Key for a settings profile's append-only version history (metadata rows). */
export const settingsProfileVersionsKey = (name: string) =>
  ['settings-profiles', name, 'versions'] as const;

/** Key for one immutable settings-profile version (metadata + body). */
export const settingsProfileVersionKey = (name: string, version: number) =>
  ['settings-profiles', name, 'versions', version] as const;
