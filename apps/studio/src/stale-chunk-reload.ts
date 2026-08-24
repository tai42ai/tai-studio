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
 * error, NOT reload-loop. So we reload at most once per 60s window.
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
 * In-memory fallback for the guard when sessionStorage is unavailable (some
 * privacy modes throw on access). At worst this allows one reload per page life.
 */
let reloadedThisPageLife = false;

/** Read the last-reload timestamp, preferring sessionStorage, tolerating its absence. */
function lastReloadAt(): number | undefined {
  try {
    const raw = window.sessionStorage.getItem(RELOAD_AT_KEY);
    if (raw === null) return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  } catch {
    return reloadedThisPageLife ? Date.now() : undefined;
  }
}

/** Persist the reload timestamp, falling back to the in-memory flag if storage throws. */
function recordReload(now: number): void {
  try {
    window.sessionStorage.setItem(RELOAD_AT_KEY, String(now));
  } catch {
    reloadedThisPageLife = true;
  }
}

/**
 * Reload the page unless we already did so within the guard window. Logs one
 * warning first so the blip is diagnosable in the field. Returns whether the
 * reload was actually taken — the caller suppresses the original error ONLY
 * then. A guard-blocked failure keeps propagating (Vite re-throws, a rejection
 * stays unhandled), so a genuinely broken deploy — a chunk that 404s even when
 * fresh, failing again right after the recovery reload — surfaces loudly
 * instead of being silently swallowed while the page quietly stays broken.
 */
function reloadOnce(signal: string, specifier: string | undefined): boolean {
  const now = Date.now();
  const previous = lastReloadAt();
  if (previous !== undefined && now - previous < RELOAD_WINDOW_MS) return false;

  console.warn(
    `[stale-chunk-reload] reloading once after ${signal}` +
      (specifier !== undefined ? `: ${specifier}` : ''),
  );
  recordReload(now);
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
    const message = errorMessage(event.reason);
    if (message === undefined) return;
    const lower = message.toLowerCase();
    if (!DYNAMIC_IMPORT_ERROR_FRAGMENTS.some((fragment) => lower.includes(fragment))) return;
    if (reloadOnce('unhandledrejection', message)) {
      event.preventDefault();
    }
  });
}

/** Best-effort message extraction from an arbitrary rejection reason. */
function errorMessage(reason: unknown): string | undefined {
  if (typeof reason === 'string') return reason;
  if (reason instanceof Error) return reason.message;
  return undefined;
}
