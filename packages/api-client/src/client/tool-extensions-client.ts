/** Tool extension listing and authoring sub-client. */
import { apiRoutes, buildPath } from '../generated/api-routes';
import * as s from '../schemas';
import type { Transport } from './transport';

export function toolExtensionsClient(t: Transport) {
  const { req } = t;
  return {
    listExtensions: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_extensions.path, s.extensions, { signal }),
    // A MANIFEST-provided tool's current combos + the extension catalog. (A preset
    // tool's extensions live on the preset spec, read via `getPreset`.)
    getToolExtensions: (name: string, signal?: AbortSignal) =>
      req(buildPath(apiRoutes.get_api_tools_name_extensions.path, { name }), s.toolExtensions, {
        signal,
      }),
    // Author ALL of a MANIFEST tool's combos at once (the full lossless list; `[]`
    // clears). Returns the apply result: the local reload (`status` + `env_keys`) plus
    // the mode-wrapped fleet `fanout` of the reload it broadcast, from which the shared
    // fleet-report handler surfaces any failed propagation.
    setToolExtensions: (name: string, combos: readonly s.PresetExtensionElement[][]) =>
      req(
        buildPath(apiRoutes.post_api_tools_name_extensions.path, { name }),
        s.toolExtensionsApplyResult,
        {
          method: 'POST',
          body: { combos },
        },
      ),
  };
}
