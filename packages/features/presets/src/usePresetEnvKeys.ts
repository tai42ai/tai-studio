/**
 * The env-key read shared by both fixed-kwargs authoring doors (create + save-version):
 * one `GET /api/config/env` whose names feed the secret-reference row's key picker.
 *
 * It is an ENRICHMENT read — a caller passes `enabled` from whether a base is in play,
 * so the empty create form never queries before a base is picked. A failed or not-yet-run
 * read is not an error line: `keyPickingAvailable` is false and the reference row degrades
 * to a plain variable-name input (fail closed but still authorable).
 *
 * `availableKeys` lists the declared secret keys first, then the other environment names,
 * de-duplicated — both are legal reference targets, and a secret-marked key is the first
 * an author reaches for.
 */
import { useApi } from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { presetEnvConfigKey } from './keys';

/** The key list and picking-availability the reference row reads. */
export interface PresetEnvKeys {
  readonly availableKeys: readonly string[];
  readonly keyPickingAvailable: boolean;
}

export function usePresetEnvKeys(enabled: boolean): PresetEnvKeys {
  const api = useApi();
  const query = useQuery({
    queryKey: presetEnvConfigKey,
    queryFn: ({ signal }) => api.getEnvConfig(signal),
    enabled,
  });

  const availableKeys = useMemo<readonly string[]>(() => {
    const data = query.data;
    if (data === undefined) return [];
    const seen = new Set<string>();
    const keys: string[] = [];
    for (const key of [...data.secret_keys, ...Object.keys(data.env)]) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
    return keys;
  }, [query.data]);

  return { availableKeys, keyPickingAvailable: query.isSuccess };
}
