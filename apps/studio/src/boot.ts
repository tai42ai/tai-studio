/**
 * The studio's boot: load the app through ONE dynamic import and mount it, or,
 * when the app cannot load, recover once and otherwise show why.
 *
 * Everything the app imports through the server-injected import map (React, the
 * SDK, the jq editor) is reached only through `loadApp`, so a module that fails to
 * arrive rejects that one import instead of failing the page's entry before any
 * code runs. A rejected import first goes to the shell's one-shot reload guard
 * (`recoverFromImportFailure`, the same guard and window the stale-chunk listeners
 * use); when the guard declines, the boot error state is rendered into the root.
 *
 * The error state is plain DOM: the thing that failed to load may be React or the
 * SDK itself. It mirrors the SDK's `ErrorState` markup and classes, so the bundled
 * stylesheet paints it in the OS theme (no theme preference is applied before the
 * app mounts). The SDK's crossed-circle mark is not reproduced because the SDK that
 * owns it is not importable here; the title carries the state in words.
 */
import { recoverFromImportFailure } from './stale-chunk-reload';

/** The module `loadApp` resolves to: the app's mount entry. */
export interface StudioAppModule {
  readonly mountStudio: (root: HTMLElement) => void;
}

export interface BootStudioOptions {
  /**
   * The app's dynamic import. It resolves to `undefined` when Vite's preload
   * helper reported the failure and a listener took the recovery reload
   * (`preventDefault()` on `vite:preloadError` makes the import resolve without a
   * module).
   */
  readonly loadApp: () => Promise<StudioAppModule | undefined>;
  readonly root: HTMLElement | null;
}

/** The SDK's error title, the headline every error state wears. */
const ERROR_TITLE = 'Something went wrong';

export async function bootStudio({ loadApp, root }: BootStudioOptions): Promise<void> {
  if (root === null) {
    throw new Error('#root element is missing from index.html — the shell cannot mount');
  }
  try {
    const app = await loadApp();
    if (app === undefined) return;
    app.mountStudio(root);
  } catch (error: unknown) {
    if (recoverFromImportFailure('a failed studio boot', error)) return;
    console.error('[boot] TAI42 Studio could not load', error);
    renderBootError(root, error);
  }
}

function bootErrorMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  const sentence = /[.!?]$/.test(detail) ? detail : `${detail}.`;
  return `TAI42 Studio could not load: ${sentence} Reload to try again.`;
}

/** Render the boot error state into `root`, replacing its content, and focus Reload. */
function renderBootError(root: HTMLElement, error: unknown): void {
  const wrapper = document.createElement('div');
  wrapper.style.padding = 'var(--tai-space-6)';

  const alert = document.createElement('div');
  alert.setAttribute('role', 'alert');
  alert.className = 'tai-error-state';

  const title = document.createElement('strong');
  title.className = 'tai-error-state-title';
  title.textContent = ERROR_TITLE;

  const message = document.createElement('p');
  message.style.margin = 'var(--tai-space-2) 0 0';
  message.style.whiteSpace = 'pre-wrap';
  message.textContent = bootErrorMessage(error);

  const actions = document.createElement('div');
  actions.style.marginTop = 'var(--tai-space-3)';
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'tai-btn tai-btn-secondary';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => {
    window.location.reload();
  });
  actions.append(reload);

  alert.append(title, message, actions);
  wrapper.append(alert);
  root.replaceChildren(wrapper);
  reload.focus();
}
