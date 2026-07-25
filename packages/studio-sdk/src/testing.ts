/** Test-only registry reset, used to clear module-level state between cases; never shipped to the browser. */
export { __resetContributions } from './plugin/registry';
/** Test-only plugin host-state reset, cleared between cases beside the registry reset. */
export { __resetPluginHostState } from './plugin/host-state';

/**
 * jsdom omits a handful of browser APIs the Studio components reach for while a
 * test drives them. Installing every stub in one place keeps each feature's
 * `test-setup.ts` identical and lets interaction tests exercise the real
 * components instead of mocking them out:
 *
 * - Radix primitives observe element size (`ResizeObserver`), scroll the active
 *   item into view, and capture the pointer while opening.
 * - Export/download paths create and revoke object URLs.
 * - File-import flows read the picked file via `Blob.text()`.
 * - Router scroll restoration calls `scrollTo` on navigation.
 *
 * Each stub only fills a MISSING API, so installing the whole set everywhere is
 * harmless — the one exception is `window.scrollTo`, which jsdom ships as a "Not
 * implemented" stub that logs loudly on every navigation, so it is replaced
 * unconditionally. Call once from a package's Vitest `setupFiles` entry.
 */
export function installJsdomStubs(): void {
  if (typeof globalThis.ResizeObserver !== 'function') {
    class ResizeObserverStub {
      observe(): void {
        /* jsdom stub */
      }
      unobserve(): void {
        /* jsdom stub */
      }
      disconnect(): void {
        /* jsdom stub */
      }
    }
    globalThis.ResizeObserver = ResizeObserverStub;
  }

  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {
      /* jsdom stub */
    };
  }
  if (typeof Element.prototype.hasPointerCapture !== 'function') {
    Element.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
      return false;
    };
  }
  if (typeof Element.prototype.setPointerCapture !== 'function') {
    Element.prototype.setPointerCapture = function setPointerCapture(): void {
      /* jsdom stub */
    };
  }
  if (typeof Element.prototype.releasePointerCapture !== 'function') {
    Element.prototype.releasePointerCapture = function releasePointerCapture(): void {
      /* jsdom stub */
    };
  }

  // TanStack Router's scroll restoration calls scrollTo on every navigation.
  // jsdom omits `Element.prototype.scrollTo`, so fill it like the others; but it
  // DOES ship `window.scrollTo` as a "Not implemented" stub that logs loudly on
  // every call, so that one is REPLACED unconditionally to silence the noise.
  if (typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = function scrollTo(): void {
      /* jsdom stub */
    };
  }
  window.scrollTo = function scrollTo(): void {
    /* jsdom stub */
  };

  // jsdom does not implement object URLs; export/download paths create and
  // revoke one.
  if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = (): string => 'blob:stub';
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = (): void => {
      /* jsdom stub */
    };
  }

  // jsdom's Blob/File omit the `text()` reader browsers ship, so file-import
  // flows that call `file.text()` cannot run. Back it with the FileReader jsdom
  // does provide.
  if (typeof Blob.prototype.text !== 'function') {
    Blob.prototype.text = function readAsText(this: Blob): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (): void => {
          resolve(typeof reader.result === 'string' ? reader.result : '');
        };
        reader.onerror = (): void => {
          reject(reader.error ?? new Error('FileReader failed'));
        };
        reader.readAsText(this);
      });
    };
  }
}

/**
 * A promise whose settlement the test controls, returned alongside its own
 * `resolve`/`reject`. It pins a component's loading state for assertion: hand the
 * unsettled `promise` to the code under test (e.g. as a mocked api call's return
 * value), assert the in-flight UI while it hangs, then call `resolve`/`reject` to
 * drive the success or failure branch and assert the settled UI. Each call
 * returns a fresh, independent deferred.
 *
 * @typeParam T - the value the promise resolves to.
 */
export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
