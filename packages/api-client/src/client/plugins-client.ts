/** Studio front-end plugin registry sub-client. */
import * as s from '../schemas';
import type { Transport } from './transport';

export function pluginsClient(t: Transport) {
  const { req } = t;
  return {
    listStudioPlugins: (signal?: AbortSignal) =>
      req('/api/plugins', s.studioPluginRegistry, { signal }),
  };
}
