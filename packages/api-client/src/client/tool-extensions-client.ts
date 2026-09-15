/** Tool extension listing and authoring sub-client. */
import { encodeSegment } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

export function toolExtensionsClient(t: Transport) {
  const { req } = t;
  return {
    listExtensions: (signal?: AbortSignal) => req('/api/extensions', s.extensions, { signal }),
    // A MANIFEST-provided tool's current combos + the extension catalog. (A preset
    // tool's extensions live on the preset spec, read via `getPreset`.)
    getToolExtensions: (name: string, signal?: AbortSignal) =>
      req(`/api/tools/${encodeSegment(name)}/extensions`, s.toolExtensions, { signal }),
    // Author ALL of a MANIFEST tool's combos at once (the full lossless list; `[]`
    // clears). Returns the apply result: the local reload (`status` + `env_keys`) plus
    // the mode-wrapped fleet `fanout` of the reload it broadcast, from which the shared
    // fleet-report handler surfaces any failed propagation.
    setToolExtensions: (name: string, combos: readonly s.PresetExtensionElement[][]) =>
      req(`/api/tools/${encodeSegment(name)}/extensions`, s.toolExtensionsApplyResult, {
        method: 'POST',
        body: { combos },
      }),
  };
}
