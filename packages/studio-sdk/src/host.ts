/**
 * @tai42/studio-sdk/host — the HOST-ONLY registry API. `loadPlugin` (the one entry
 * through which a plugin's `register` contributes) and `getContributions` (what the
 * shell reads) live here, apart from the plugin surface, so the served plugin asset
 * carries no way to forge, wipe, or enumerate the registry. Only the host bundle
 * imports this. See SECURITY.md for the trust boundary.
 */
export type {
  LoadedPlugin,
  PluginContributionsSnapshot,
  PluginLoaderState,
} from './plugin/host-state';
export {
  getPluginHostState,
  setPluginHostState,
  subscribePluginHost,
  usePluginContributions,
} from './plugin/host-state';
export { getContributions, loadPlugin } from './plugin/registry';
