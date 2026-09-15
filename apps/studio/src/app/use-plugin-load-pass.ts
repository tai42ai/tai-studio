/**
 * The Studio-plugin load pass, as the shell consumes it: it kicks off the eager
 * post-login load (gated on the capability projection — a scoped session that cannot
 * reach the registry route skips it, absence not error) and derives the
 * capability-filtered visible nav entries + their provenance versions from the loader
 * store. Core nav never waits on the pass.
 */
import {
  type CapabilityState,
  coversAnyRoute,
  isFullProjection,
  type RegisteredNavEntry,
} from '@tai42/studio-sdk';
import { getContributions } from '@tai42/studio-sdk/host';
import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';

import type { PluginVersions } from './nav-entries';
import type { PluginLoader } from './plugin-loader';
import { contributionCovered } from './token-requirements';

/** The authed plugin-registry read route the load pass fetches; a scoped session
 * loads plugins only when its projection reaches it. */
const PLUGIN_REGISTRY_ROUTE = '/api/plugins';

export function usePluginLoadPass(
  loader: PluginLoader,
  state: CapabilityState,
): { visibleNavEntries: readonly RegisteredNavEntry[]; pluginVersions: PluginVersions } {
  // Plugin nav entries are read only once the load pass has committed them; the
  // status subscription re-renders when the pass completes. Core nav never waits.
  const status = useStore(loader.store, (s) => s.status);
  const navEntries = useMemo(
    () => (status === 'ready' ? getContributions().navEntries : []),
    [status],
  );
  // Plugin id → version, for the host provenance badge. A plugin not yet loaded is
  // absent from the map, so the badge names the plugin without a version.
  const loadedPlugins = useStore(loader.store, (s) => s.plugins);
  const pluginVersions = useMemo<PluginVersions>(
    () => new Map(loadedPlugins.map((p) => [p.name, p.version])),
    [loadedPlugins],
  );
  // A plugin nav entry shows only when the projection covers its declared
  // `requiredCapabilities` (absent ⇒ full projection only); hidden until ready.
  const visibleNavEntries = useMemo(
    () =>
      state.status === 'ready'
        ? navEntries.filter((entry) =>
            contributionCovered(state.projection, entry.requiredCapabilities),
          )
        : [],
    [navEntries, state],
  );

  useEffect(() => {
    // Eager post-login load so contributed tool panels are ready; loud plugin
    // errors surface on `/plugins/*`, and a 401 here redirects to /login. The pass
    // is gated on the capability projection: a full projection always loads; a
    // scoped session loads only when it can reach the registry route, else it skips
    // with no plugin nav and no error card (absence is the correct rendering of
    // "not yours"). On `failed`/`loading` it defers.
    if (state.status !== 'ready') return;
    const projection = state.projection;
    if (isFullProjection(projection) || coversAnyRoute(projection, [PLUGIN_REGISTRY_ROUTE])) {
      void loader.ensureLoaded();
    } else {
      console.info(
        'Studio plugins are outside this session’s capabilities; skipping the load pass.',
      );
    }
  }, [loader, state]);

  return { visibleNavEntries, pluginVersions };
}
