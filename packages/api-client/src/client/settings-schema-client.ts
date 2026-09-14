/** Settings-form schema read sub-client. */
import * as s from '../schemas';
import type { Transport } from './transport';

export function settingsSchemaClient(t: Transport) {
  const { req } = t;
  return {
    getSettingsSchema: (signal?: AbortSignal) =>
      req('/api/config/settings-schema', s.settingsSchema, { signal }),
  };
}
