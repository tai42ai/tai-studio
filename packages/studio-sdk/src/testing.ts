/** Test-only registry reset, used to clear module-level state between cases; never shipped to the browser. */
export { __resetContributions } from './plugin/registry';
/** Test-only plugin host-state reset, cleared between cases beside the registry reset. */
export { __resetPluginHostState } from './plugin/host-state';

/**
 * Every `ResizeObserver` the stub has handed out and not yet had disconnected,
 * with the elements each one is watching. `flushResizeObservers` drives the
 * callbacks from here.
 */
interface LiveResizeObserver {
  readonly callback: ResizeObserverCallback;
  readonly targets: Set<Element>;
  readonly observer: ResizeObserver;
}

const liveResizeObservers = new Set<LiveResizeObserver>();

/**
 * An in-memory Web Storage, installed for both `localStorage` and
 * `sessionStorage`. The platform storage is unreliable across the supported Node
 * range: Node >= 24 defines a native experimental `globalThis.localStorage` that,
 * without `--localstorage-file`, is a non-functional stub, and under Vitest's
 * jsdom environment (`window === globalThis`) it shadows jsdom's own
 * `localStorage`, leaving it `undefined`. Installing one class for the whole
 * subsystem keeps `Storage.prototype` a single spy-able object shared by both
 * stores, so `vi.spyOn(Storage.prototype, ...)` intercepts either.
 */
class MemoryStorage {
  readonly #entries = new Map<string, string>();

  get length(): number {
    return this.#entries.size;
  }

  key(index: number): string | null {
    return [...this.#entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.#entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#entries.set(key, value);
  }

  removeItem(key: string): void {
    this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }
}

/**
 * A full `ResizeObserverEntry` shape for `target`. Radix's `useSize` reads
 * `borderBoxSize[0].inlineSize`, so a `target`-only entry would throw there;
 * jsdom reports zero geometry, which is exactly what a real headless observer
 * would report for an unlaid-out element.
 */
function resizeObserverEntry(target: Element): ResizeObserverEntry {
  const rect = target.getBoundingClientRect();
  const size: ResizeObserverSize = { inlineSize: rect.width, blockSize: rect.height };
  return {
    target,
    contentRect: rect,
    borderBoxSize: [size],
    contentBoxSize: [size],
    devicePixelContentBoxSize: [size],
  };
}

/**
 * Fires every live `ResizeObserver` stub's callback for the elements it is
 * observing. Pair it with `setElementOverflow` to drive a component that
 * measures itself (`ScrollRegion` and `useProseScrollRegions` re-read
 * `scrollWidth`/`clientWidth` from their observer callbacks):
 *
 *     setElementOverflow(region, true);
 *     flushResizeObservers();
 *
 * Only meaningful once `installJsdomStubs` has installed the stub; with a real
 * `ResizeObserver` present (a browser environment) there is nothing to flush.
 */
export function flushResizeObservers(): void {
  for (const live of [...liveResizeObservers]) {
    if (live.targets.size === 0) continue;
    live.callback([...live.targets].map(resizeObserverEntry), live.observer);
  }
}

/**
 * Delivers a resize for ONE element, to every stub observing it — the narrow
 * form of {@link flushResizeObservers}. Use it to prove which element a
 * component is watching: a measurement driven by a resize of a CHILD only
 * arrives if that child is observed, so the assertion fails the moment a
 * component narrows its observation to its own box.
 *
 * @param target - the element whose resize to deliver.
 */
export function flushResizeObserversFor(target: Element): void {
  for (const live of [...liveResizeObservers]) {
    if (!live.targets.has(target)) continue;
    live.callback([resizeObserverEntry(target)], live.observer);
  }
}

/** The faked widths: equal reads as "fits", unequal as "scrolls". */
const FITTING_WIDTH = 100;
const OVERFLOWING_SCROLL_WIDTH = 400;

/**
 * Makes `element` report itself as horizontally overflowing (or not). jsdom runs
 * no layout, so `scrollWidth` and `clientWidth` are both 0 and every
 * overflow test reads as "fits"; this shadows the prototype getters with own,
 * configurable values so a test can drive either state. Call it again with the
 * opposite flag to flip the element back.
 *
 * @param element - the element whose scroll metrics to fake.
 * @param overflowing - true to report content wider than the box.
 */
export function setElementOverflow(element: HTMLElement, overflowing: boolean): void {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: FITTING_WIDTH });
  Object.defineProperty(element, 'scrollWidth', {
    configurable: true,
    value: overflowing ? OVERFLOWING_SCROLL_WIDTH : FITTING_WIDTH,
  });
}

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
 * The `ResizeObserver` stub is a WORKING observer, not an inert one: it keeps a
 * registry of the observers still in use, delivers an entry to the callback as
 * each element is observed (as a real observer does for its initial
 * observation), and lets a test re-deliver on demand via
 * `flushResizeObservers`. Components that size themselves — `ScrollRegion` and
 * `useProseScrollRegions` — are therefore exercised for real, with
 * `setElementOverflow` supplying the scroll metrics jsdom cannot compute.
 *
 * Each stub only fills a MISSING API, so installing the whole set everywhere is
 * harmless — the one exception is `window.scrollTo`, which jsdom ships as a "Not
 * implemented" stub that logs loudly on every navigation, so it is replaced
 * unconditionally. Call once from a package's Vitest `setupFiles` entry.
 */
export function installJsdomStubs(): void {
  if (typeof globalThis.ResizeObserver !== 'function') {
    class ResizeObserverStub implements ResizeObserver {
      readonly #live: LiveResizeObserver;

      constructor(callback: ResizeObserverCallback) {
        this.#live = { callback, targets: new Set<Element>(), observer: this };
        liveResizeObservers.add(this.#live);
      }

      observe(target: Element): void {
        // `disconnect()` stops observation; it does not destroy the observer, so
        // observing again re-registers it exactly as the real API does.
        liveResizeObservers.add(this.#live);
        this.#live.targets.add(target);
        this.#live.callback([resizeObserverEntry(target)], this);
      }

      unobserve(target: Element): void {
        this.#live.targets.delete(target);
      }

      disconnect(): void {
        this.#live.targets.clear();
        liveResizeObservers.delete(this.#live);
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

  // Web Storage: reinstall from one class so `localStorage`/`sessionStorage` are
  // present and their methods share a single spy-able `Storage.prototype`,
  // regardless of the running Node's native-storage behaviour (see MemoryStorage).
  const storage = { value: MemoryStorage, configurable: true, writable: true };
  Object.defineProperty(globalThis, 'Storage', storage);
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
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
