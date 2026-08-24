import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * These tests exercise the global stale-chunk recovery in isolation. Each test
 * re-imports the module fresh (to reset its in-memory guard) and unregisters the
 * window listeners it installed afterwards, so no cross-test bleed.
 */

const RELOAD_AT_KEY = 'tai-stale-chunk-reload-at';

let reloadSpy: ReturnType<typeof vi.fn>;
/** Listeners the module registered this test, captured so we can remove them. */
let registered: [string, EventListenerOrEventListenerObject][];
/** jsdom's own sessionStorage descriptor, restored after a test overrides it. */
const originalSessionStorage = Object.getOwnPropertyDescriptor(window, 'sessionStorage');

/** Load a pristine module instance and install it, tracking the listeners it adds. */
async function install(): Promise<void> {
  vi.resetModules();
  const { installStaleChunkReload } = await import('./stale-chunk-reload');
  installStaleChunkReload();
}

/** Dispatch Vite's cancelable preload-error event with an Error payload. */
function dispatchPreloadError(
  message = 'Failed to fetch dynamically imported module /a.js',
): Event {
  const event = new Event('vite:preloadError', { cancelable: true });
  Object.assign(event, { payload: new Error(message) });
  window.dispatchEvent(event);
  return event;
}

/** Dispatch an unhandledrejection carrying `reason` (message-string or Error). */
function dispatchRejection(reason: unknown): Event {
  const event = new Event('unhandledrejection', { cancelable: true });
  Object.assign(event, { reason });
  window.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  registered = [];
  window.sessionStorage.clear();
  reloadSpy = vi.fn();
  // jsdom's location.reload is read-only, so stub the whole location object.
  vi.stubGlobal('location', { reload: reloadSpy });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);

  // Capture every listener the module installs so afterEach can remove it, and
  // prevent accumulation across the suite's repeated install() calls.
  const original = window.addEventListener.bind(window);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    registered.push([type, listener]);
    original(type, listener, options);
  });
});

afterEach(() => {
  vi.mocked(window.addEventListener).mockRestore();
  for (const [type, listener] of registered) window.removeEventListener(type, listener);
  // Restore jsdom's real sessionStorage if a test overrode it.
  if (originalSessionStorage !== undefined) {
    Object.defineProperty(window, 'sessionStorage', originalSessionStorage);
  }
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('installStaleChunkReload', () => {
  it('reloads once and prevents Vite from re-throwing on vite:preloadError', async () => {
    await install();
    const event = dispatchPreloadError();
    expect(event.defaultPrevented).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    'Failed to fetch dynamically imported module: https://host/chunk-abc.js', // Chrome
    'error loading dynamically imported module', // Firefox
    'Importing a module script failed.', // Safari
  ])('reloads on a matching unhandledrejection: %s', async (message) => {
    await install();
    const event = dispatchRejection(new Error(message));
    expect(event.defaultPrevented).toBe(true);
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT reload on an unrelated unhandledrejection', async () => {
    await install();
    const event = dispatchRejection(new TypeError('x is not a function'));
    expect(event.defaultPrevented).toBe(false);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('reloads only ONCE for a second qualifying event inside the 60s window', async () => {
    await install();
    dispatchPreloadError();
    dispatchRejection(new Error('Failed to fetch dynamically imported module /b.js'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('still reloads once via the in-memory fallback when sessionStorage throws', async () => {
    const throwing = {
      getItem: () => {
        throw new Error('storage denied');
      },
      setItem: () => {
        throw new Error('storage denied');
      },
      clear: () => undefined,
    };
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: throwing });

    await install();
    dispatchPreloadError();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    // Second qualifying event stays suppressed by the module-level flag.
    dispatchPreloadError();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('reloads again once the stored timestamp is older than the 60s window', async () => {
    window.sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now() - 61_000));
    await install();
    dispatchPreloadError();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
