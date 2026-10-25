/** Shared manifest-view fixtures for the manifest feature tests. */
import type { ManifestExtensionSettings } from '@tai42/api-client';

/** Extension settings that declare nothing. */
export function emptyExtensionSettings(): ManifestExtensionSettings {
  return { extensions_modules: [], backend_module: null, tools: [], mcp: [], api_tools: {} };
}

/** Extension settings with every part declared: modules, backend, and a map of each kind. */
export function fullExtensionSettings(): ManifestExtensionSettings {
  return {
    extensions_modules: ['pkg.ext', 'pkg.more'],
    backend_module: 'pkg.backend',
    tools: [{ title: 'a', extensions: { echo: [['label_ext', 'ask_external']] } }],
    mcp: [
      {
        title: 'srv',
        extensions: {
          fetch: [
            ['ask_external'],
            [{ name: 'label_ext', config: { label: '!ENV ${EXT_TOKEN}' } }],
          ],
        },
      },
    ],
    api_tools: { shout: [['ask_external']] },
  };
}
