/**
 * The Studio-plugin loader. After a credential exists the shell fetches the
 * authed registry, then dynamic-`import()`s each bundle and calls its exported
 * `register(context)` through {@link loadPlugin}, which stages the plugin's
 * contributions (tool panels / pages / settings tabs) and commits them atomically.
 * `loadPlugin` and the registry it commits into live in the served
 * `@tai42/studio-sdk/host` singleton that the shell and this loader share, so a
 * plugin's contributions land in the SAME registry the shell reads. `loadPlugin`
 * runs shell-side; the plugin only receives a closure-bound `context`.
 *
 * Load rules (the loud-error contract):
 *  - a 401 during the registry fetch is a LOGIN REDIRECT, never a plugin error
 *    card — it is handed to `onUnauthorized` and the pass is reset so a
 *    re-authenticated session retries it;
 *  - a 403 during the registry fetch is ABSENCE, never a plugin error card — the
 *    registry route is outside this session's capabilities, so the pass completes
 *    empty and a deep-linked plugin page shows its neutral not-available state;
 *  - a plugin's manifest-listed `.css` assets are injected as SRI'd stylesheet
 *    links BEFORE its JS is imported, so its styles are applied before any
 *    contributed component can render; a stylesheet that fails (fetch error,
 *    integrity rejection) is a plugin load failure — every link already injected
 *    for that plugin is removed, the JS import is skipped, and a loud error card
 *    is recorded. Likewise a JS import or `register` that throws AFTER the links
 *    were injected removes them first, so a failed plugin leaves nothing behind;
 *  - a Studio-plugin API version mismatch, a genuine bundle load failure (fetch
 *    error, integrity rejection), or a broken registry response is recorded
 *    LOUDLY and surfaced as an error card on the affected plugin's page — never a
 *    silent skip;
 *  - core routes never wait on this; only `/plugins/*` resolution gates on the
 *    pass having completed via {@link PluginLoader.ensureLoaded}.
 */
import { type ApiClient, type ApiUnauthorizedError } from '@tai42/api-client';
import { type PluginLoaderState, setPluginHostState } from '@tai42/studio-sdk/host';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { classifyRegistryError, loadOnePlugin } from './plugin-load';

export type { PluginLoaderState };

/** Resolve a bundle URL to a module. Injected so tests drive it without a network. */
export type ImportModule = (url: string) => Promise<unknown>;

/**
 * Inject a plugin stylesheet as an SRI'd `<link rel="stylesheet">` and resolve
 * once it has loaded, with a remover that detaches it. Rejects if the stylesheet
 * fails to fetch or fails its integrity check. Injected so tests drive it without
 * a network or a real DOM.
 */
export type LoadStylesheet = (url: string, integrity: string) => Promise<() => void>;

export interface PluginLoaderDeps {
  readonly api: Pick<ApiClient, 'listStudioPlugins'>;
  readonly importModule: ImportModule;
  readonly loadStylesheet: LoadStylesheet;
  /** Called when the registry fetch 401s — the shell redirects to `/login`. */
  readonly onUnauthorized: (error: ApiUnauthorizedError) => void;
}

export interface PluginLoader {
  /** The zustand store the shell subscribes to for loud plugin state. */
  readonly store: StoreApi<PluginLoaderState>;
  /**
   * Run the load pass at most once per authenticated session (idempotent: the
   * in-flight promise is shared by the eager post-login effect and the
   * `/plugins/*` route loader). A 401 resets the pass so re-auth retries it.
   */
  readonly ensureLoaded: () => Promise<void>;
}

const INITIAL: PluginLoaderState = {
  status: 'idle',
  loaded: [],
  plugins: [],
  errors: {},
  registryError: null,
};

export function createPluginLoader(deps: PluginLoaderDeps): PluginLoader {
  const store = createStore<PluginLoaderState>(() => INITIAL);
  let inFlight: Promise<void> | null = null;

  // The loader stays the single driver of load-pass state; the SDK host-state
  // store is a mirror of it that feature pages subscribe to (they cannot import
  // this app shell). Seed it with the initial state and forward every transition.
  setPluginHostState(store.getState());
  store.subscribe((state) => {
    setPluginHostState(state);
  });

  const run = async (): Promise<void> => {
    store.setState({ ...INITIAL, status: 'loading' });

    let manifests;
    try {
      manifests = await deps.api.listStudioPlugins();
    } catch (error) {
      const disposition = classifyRegistryError(error);
      if (disposition.kind === 'unauthorized') {
        // A 401 is a login redirect, NOT a plugin error. Reset so the next
        // authenticated pass re-fetches the registry.
        inFlight = null;
        store.setState(INITIAL);
        deps.onUnauthorized(disposition.error);
        return;
      }
      // A 403 (absence) completes the pass empty; any other failure completes it
      // "done" but carries the error so `/plugins/*` renders it, not a blank gate.
      const registryError = disposition.kind === 'error' ? disposition.message : null;
      store.setState({ ...INITIAL, status: 'ready', registryError });
      return;
    }

    const loaded: string[] = [];
    const plugins: { name: string; version: string }[] = [];
    const errors: Record<string, string> = {};
    for (const manifest of manifests) {
      const result = await loadOnePlugin(manifest, deps.importModule, deps.loadStylesheet);
      if (result.ok) {
        loaded.push(manifest.name);
        // Record identity (name + version) so host chrome can attribute a
        // contribution to its plugin (the nav provenance badge).
        plugins.push({ name: manifest.name, version: result.version });
      } else {
        errors[manifest.name] = result.message;
      }
    }

    store.setState({ status: 'ready', loaded, plugins, errors, registryError: null });
  };

  const ensureLoaded = (): Promise<void> => {
    inFlight ??= run();
    return inFlight;
  };

  return { store, ensureLoaded };
}
