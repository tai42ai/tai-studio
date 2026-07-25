/**
 * @tai42/studio-sdk/host — the HOST-ONLY registry API. `loadPlugin` (the one entry
 * through which a plugin's `register` contributes) and `getContributions` (what the
 * shell reads) live here, apart from the plugin surface, so the served plugin asset
 * carries no way to forge, wipe, or enumerate the registry. Only the host bundle
 * imports this. See SECURITY.md for the trust boundary.
 */
export { loadPlugin, getContributions } from './plugin/registry';
export {
  setPluginHostState,
  getPluginHostState,
  subscribePluginHost,
  usePluginContributions,
} from './plugin/host-state';
export type { PluginLoaderState, PluginContributionsSnapshot } from './plugin/host-state';
