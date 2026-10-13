/** Settings-form schema read sub-client. */
import { apiRoutes } from '../generated/api-routes';
import * as s from '../schemas';
import type { Transport } from './transport';

export function settingsSchemaClient(t: Transport) {
  const { req } = t;
  return {
    getSettingsSchema: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_config_settings_schema.path, s.settingsSchema, { signal }),
  };
}
