/**
 * The secret-marking helpers shared by the Environment tab and the Profiles tab:
 * the class-owned secret map and the env var that carries the user-marked keys.
 */
import type { SettingsSchema } from '@tai42/api-client';

/** The env var whose value is the comma-separated list of user-marked secret keys. */
export const SECRET_MARKS_ENV_VAR = 'TAI_ENV_SECRET_KEYS';

/** Map every env var owned by a settings class to its class-derived secret flag. */
export function ownedSecretMap(schema: SettingsSchema): Map<string, boolean> {
  const owned = new Map<string, boolean>();
  for (const group of schema.groups) {
    for (const field of group.fields) {
      if (field.env_var !== '') owned.set(field.env_var, field.secret);
    }
  }
  return owned;
}
