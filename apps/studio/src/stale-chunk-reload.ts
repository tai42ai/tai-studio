/**
 * One-shot page reload when a dynamically imported chunk fails to load — the
 * industry-standard "stale-chunk recovery".
 *
 * Studio's hashed assets are served `immutable, max-age=1y`. A tab holding an
 * OLD bundle that lazily imports a sibling chunk by its old hashed name AFTER a
 * new deploy hits a 404 ("Failed to fetch dynamically imported module") and the
 * feature silently breaks. This covers the shell's OWN chunks AND the Vite-built
 * plugin bundles loaded into the same page (e.g. the flows plugin).
 *
 * The cure is to reload ONCE: the reload re-fetches the no-cache HTML entry and
 * with it a consistent, current chunk set. The one-shot guard is load-bearing —
 * a genuinely broken deploy (a chunk that 404s even when fresh) must surface the
 * error, NOT reload-loop. So we reload at most once per 60s window, and not at
 * all when the browser gives the guard no storage to remember the reload in.
 *
 * The page's boot (`boot.ts`) applies the same guard to the app's own dynamic
 * import through {@link recoverFromImportFailure}, so the boot and a later lazy
 * chunk share one window and can never reload twice inside it.
 */

/** Guard window: never auto-reload twice inside this span (a broken deploy stays visible). */
const RELOAD_WINDOW_MS = 60_000;

/** sessionStorage key holding the epoch-ms of the last auto-reload. */
const RELOAD_AT_KEY = 'tai-stale-chunk-reload-at';

/**
 * Message fragments the three browsers use for a failed dynamic import, matched
 * case-insensitively as a substring. Kept deliberately narrow: an unrelated
 * rejection must NEVER trigger a reload.
 */
const DYNAMIC_IMPORT_ERROR_FRAGMENTS = [
  'failed to fetch dynamically imported module', // Chrome / Chromium
  'error loading dynamically imported module', // Firefox
  'importing a module script failed', // Safari
];

/**
 * Read the last-reload timestamp. Throws when sessionStorage is unavailable (a
 * browser that refuses storage for the site throws on access).
 */
function lastReloadAt(): number | undefined {
  const raw = window.sessionStorage.getItem(RELOAD_AT_KEY);
  if (raw === null) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Reload the page unless we already did so within the guard window. Logs one
 * warning first so the blip is diagnosable in the field. Returns whether the
 * reload was actually taken — the caller suppresses the original error ONLY
 * then. A guard-blocked failure keeps propagating (Vite re-throws, a rejection
 * stays unhandled), so a genuinely broken deploy — a chunk that 404s even when
 * fresh, failing again right after the recovery reload — surfaces loudly
 * instead of being silently swallowed while the page quietly stays broken.
 *
 * The guard's memory is sessionStorage, the one store that outlives the reload.
 * When it cannot be read or written, no reload is taken: the reloaded page would
 * remember nothing and reload again on the same failure, without end. The
 * failure then surfaces on this load, with a warning naming why.
 */
function reloadOnce(signal: string, specifier: string | undefined): boolean {
  const detail = specifier !== undefined ? `: ${specifier}` : '';
  const now = Date.now();
  try {
    const previous = lastReloadAt();
    if (previous !== undefined && now - previous < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_AT_KEY, String(now));
  } catch (error: unknown) {
    console.warn(
      `[stale-chunk-reload] not reloading after ${signal}${detail} — the reload guard ` +
        `cannot record a reload (sessionStorage unavailable: ${String(error)})`,
    );
    return false;
  }

  console.warn(`[stale-chunk-reload] reloading once after ${signal}${detail}`);
  window.location.reload();
  return true;
}

/**
 * Install global listeners that recover from stale-chunk import failures.
 * Idempotent per intent; call ONCE from the entry, before anything renders, so
 * a failing lazy route during boot is caught too.
 */
export function installStaleChunkReload(): void {
  // Vite's built preload helper dispatches this cancelable event on window when a
  // dynamic chunk (or its css) fails; plugin bundles are Vite-built too, so their
  // failures land here as well. `event.payload` is the underlying Error (see the
  // installed vite's client.d.ts: VitePreloadErrorEvent). preventDefault() — which
  // stops Vite re-throwing — is called ONLY when the reload was actually taken;
  // a guard-blocked failure re-throws and stays visible.
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnce('vite:preloadError', event.payload.message)) {
      event.preventDefault();
    }
  });

  // Fallback for direct import() failures that bypass the preload helper (older
  // plugin builds / non-Vite bundlers): match the browser error message narrowly.
  // Same rule: suppress the rejection only when the reload was taken.
  window.addEventListener('unhandledrejection', (event) => {
    if (recoverFromImportFailure('unhandledrejection', event.reason)) {
      event.preventDefault();
    }
  });
}

/**
 * Recover from one rejected dynamic import: when `reason` carries a browser's
 * failed-dynamic-import message, reload once under the shared guard. Returns
 * whether the reload was taken; `false` (an unrelated error, or the guard window
 * still closed) leaves the failure for the caller to surface. `signal` names the
 * observer in the console warning.
 */
export function recoverFromImportFailure(signal: string, reason: unknown): boolean {
  const message = errorMessage(reason);
  if (message === undefined) return false;
  const lower = message.toLowerCase();
  if (!DYNAMIC_IMPORT_ERROR_FRAGMENTS.some((fragment) => lower.includes(fragment))) return false;
  return reloadOnce(signal, message);
}

/** Best-effort message extraction from an arbitrary rejection reason. */
function errorMessage(reason: unknown): string | undefined {
  if (typeof reason === 'string') return reason;
  if (reason instanceof Error) return reason.message;
  return undefined;
}
