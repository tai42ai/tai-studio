/** Studio front-end plugin registry sub-client. */
import { apiRoutes } from '../generated/api-routes';
import * as s from '../schemas';
import type { Transport } from './transport';

export function pluginsClient(t: Transport) {
  const { req } = t;
  return {
    listStudioPlugins: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_plugins.path, s.studioPluginRegistry, { signal }),
  };
}
