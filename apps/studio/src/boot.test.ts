import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bootStudio, type StudioAppModule } from './boot';

/**
 * The boot loads the app through one dynamic import. These tests drive it with a
 * stand-in `loadApp` and the real one-shot reload guard (sessionStorage key + 60s
 * window), so each outcome is the one a real page load reaches: a mounted app, one
 * recovery reload, or the boot error state in `#root`.
 */

const RELOAD_AT_KEY = 'tai-stale-chunk-reload-at';
const IMPORT_FAILURE =
  'Failed to fetch dynamically imported module: http://host/assets/app-1a2b.js';

let reloadSpy: ReturnType<typeof vi.fn>;
let root: HTMLElement;
/** jsdom's own sessionStorage descriptor, restored after a test overrides it. */
const originalSessionStorage = Object.getOwnPropertyDescriptor(window, 'sessionStorage');

beforeEach(() => {
  window.sessionStorage.clear();
  reloadSpy = vi.fn();
  // jsdom's location.reload is read-only, so stub the whole location object.
  vi.stubGlobal('location', { reload: reloadSpy });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  root = document.createElement('div');
  root.id = 'root';
  document.body.append(root);
});

afterEach(() => {
  root.remove();
  if (originalSessionStorage !== undefined) {
    Object.defineProperty(window, 'sessionStorage', originalSessionStorage);
  }
  window.sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Close the guard window: a recovery reload was taken a moment ago. */
function closeGuardWindow(): void {
  window.sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now() - 1_000));
}

describe('bootStudio', () => {
  it('mounts the loaded app into the root', async () => {
    const mountStudio = vi.fn();
    await bootStudio({ loadApp: () => Promise.resolve({ mountStudio }), root });
    expect(mountStudio).toHaveBeenCalledExactlyOnceWith(root);
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(root.childElementCount).toBe(0);
  });

  it('renders nothing when the import resolved without a module (a recovery reload is under way)', async () => {
    await bootStudio({ loadApp: () => Promise.resolve(undefined), root });
    expect(root.childElementCount).toBe(0);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('takes exactly one reload and renders nothing when the import fails with the window open', async () => {
    await bootStudio({ loadApp: () => Promise.reject(new TypeError(IMPORT_FAILURE)), root });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(root.childElementCount).toBe(0);
  });

  it('renders the error state with a focused Reload button when the window is closed', async () => {
    closeGuardWindow();
    await bootStudio({ loadApp: () => Promise.reject(new TypeError(IMPORT_FAILURE)), root });

    expect(reloadSpy).not.toHaveBeenCalled();
    const alert = root.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert).toHaveClass('tai-error-state');
    expect(alert?.querySelector('strong.tai-error-state-title')).toHaveTextContent(
      'Something went wrong',
    );
    expect(alert?.querySelector('p')).toHaveTextContent(
      `TAI42 Studio could not load: ${IMPORT_FAILURE}. Reload to try again.`,
    );
    const button = alert?.querySelector('button');
    expect(button).toHaveTextContent('Reload');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toHaveFocus();
    expect(console.error).toHaveBeenCalledTimes(1);

    button?.click();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('renders the error state without a reload for a failure that is not a failed import', async () => {
    await bootStudio({ loadApp: () => Promise.reject(new SyntaxError('Unexpected token')), root });
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(root.querySelector('[role="alert"] p')).toHaveTextContent(
      'TAI42 Studio could not load: Unexpected token. Reload to try again.',
    );
  });

  it('does not double the full stop after a message that already ends a sentence', async () => {
    await bootStudio({
      loadApp: () => Promise.reject(new TypeError('Importing a module script failed.')),
      root,
    });
    // Window open and the message is a failed import: the one reload is taken.
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    closeGuardWindow();
    await bootStudio({
      loadApp: () => Promise.reject(new TypeError('Importing a module script failed.')),
      root,
    });
    expect(root.querySelector('[role="alert"] p')).toHaveTextContent(
      'TAI42 Studio could not load: Importing a module script failed. Reload to try again.',
    );
  });

  it('renders the error state when mounting the loaded app throws', async () => {
    const app: StudioAppModule = {
      mountStudio: () => {
        throw new Error('mount failed');
      },
    };
    await bootStudio({ loadApp: () => Promise.resolve(app), root });
    expect(root.querySelector('[role="alert"] p')).toHaveTextContent(
      'TAI42 Studio could not load: mount failed. Reload to try again.',
    );
  });

  it('renders the error state without a reload when sessionStorage is unavailable', async () => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('Access is denied for this document.', 'SecurityError');
      },
    });
    await bootStudio({ loadApp: () => Promise.reject(new TypeError(IMPORT_FAILURE)), root });
    expect(reloadSpy).not.toHaveBeenCalled();
    expect(root.querySelector('[role="alert"] p')).toHaveTextContent(
      `TAI42 Studio could not load: ${IMPORT_FAILURE}. Reload to try again.`,
    );
  });

  it('refuses to boot without a root element', async () => {
    const loadApp = vi.fn();
    await expect(bootStudio({ loadApp, root: null })).rejects.toThrow(
      '#root element is missing from index.html',
    );
    expect(loadApp).not.toHaveBeenCalled();
  });
});
