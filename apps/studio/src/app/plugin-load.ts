/**
 * The per-plugin load mechanics behind {@link createPluginLoader}: classifying a
 * registry-fetch failure (login redirect vs absence vs loud error), injecting a
 * plugin's SRI'd stylesheets before its JS, and loading one bundle's `register`
 * entry through {@link loadPlugin} with full cleanup on any failure.
 */
import { type ApiClient, ApiError, ApiUnauthorizedError } from '@tai42/api-client';
import { checkPluginApiVersion, errorMessage, type PluginEntry } from '@tai42/studio-sdk';
import { loadPlugin } from '@tai42/studio-sdk/host';

import type { ImportModule, LoadStylesheet } from './plugin-loader';

/** One entry of the authed Studio-plugin registry. */
type PluginManifest = Awaited<ReturnType<ApiClient['listStudioPlugins']>>[number];

/** `/api/plugins/{name}/studio/{entry}` — the server-injected import map resolves
 * and integrity-checks this URL; the bundle needs no auth header (public asset). */
function bundleUrl(name: string, entry: string): string {
  return `/api/plugins/${name}/studio/${entry}`;
}

/** How a registry-fetch failure is handled: a login redirect, silent absence, or a loud error. */
export type RegistryDisposition =
  | { readonly kind: 'unauthorized'; readonly error: ApiUnauthorizedError }
  | { readonly kind: 'absent' }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Classify a registry-fetch error: a 401 is a LOGIN REDIRECT (never a plugin error),
 * a 403 is ABSENCE (the route is outside this session's capabilities — the pass
 * completes empty), and anything else is a loud error surfaced on `/plugins/*`.
 */
export function classifyRegistryError(error: unknown): RegistryDisposition {
  if (error instanceof ApiUnauthorizedError) return { kind: 'unauthorized', error };
  if (error instanceof ApiError && error.status === 403) return { kind: 'absent' };
  return { kind: 'error', message: errorMessage(error) };
}

/**
 * Inject a plugin's manifest-listed `.css` assets as SRI'd stylesheet links BEFORE
 * its JS, so its styles are in the cascade before any contributed component renders.
 * The css entries are sorted lexicographically for a deterministic cascade order,
 * and each remover is appended to `removers` so a later failure can detach exactly
 * the links this plugin added.
 */
async function injectPluginStylesheets(
  manifest: PluginManifest,
  loadStylesheet: LoadStylesheet,
  removers: (() => void)[],
): Promise<void> {
  const cssAssets = Object.entries(manifest.integrity)
    .filter(([file]) => file.endsWith('.css'))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [cssFile, integrity] of cssAssets) {
    const remove = await loadStylesheet(bundleUrl(manifest.name, cssFile), integrity);
    removers.push(remove);
  }
}

/** The outcome of loading one plugin bundle: its version on success, else a loud message. */
export type PluginLoadResult =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly message: string };

/**
 * Load one plugin bundle: gate on its API version, inject its stylesheets, import
 * its module and commit its `register` entry through {@link loadPlugin}. Any failure
 * past stylesheet injection removes the links already added — a failed plugin leaves
 * nothing behind — and returns a loud message instead of throwing.
 */
export async function loadOnePlugin(
  manifest: PluginManifest,
  importModule: ImportModule,
  loadStylesheet: LoadStylesheet,
): Promise<PluginLoadResult> {
  const gate = checkPluginApiVersion(manifest.api_version);
  if (!gate.ok) {
    return { ok: false, message: gate.reason ?? 'incompatible Studio-plugin API version' };
  }
  // Stylesheets injected for THIS plugin, so any failure past this point can remove
  // exactly them and nothing else.
  const removeStylesheets: (() => void)[] = [];
  try {
    await injectPluginStylesheets(manifest, loadStylesheet, removeStylesheets);
    const mod = await importModule(bundleUrl(manifest.name, manifest.entry));
    const register = (mod as { register?: unknown }).register;
    if (typeof register !== 'function') {
      // A bundle with no `register` entry cannot contribute — surface it loudly
      // rather than skip it silently.
      throw new Error('plugin bundle does not export a register(context) function');
    }
    // `loadPlugin` awaits `register` (sync or async), stages its contributions, and
    // commits them only if it resolves — a throw here commits nothing, so a failed
    // plugin never leaves a partial registration.
    await loadPlugin(manifest.name, register as PluginEntry);
    return { ok: true, version: manifest.version };
  } catch (error) {
    for (const remove of removeStylesheets) remove();
    return { ok: false, message: errorMessage(error) };
  }
}
