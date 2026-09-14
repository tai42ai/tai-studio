/**
 * The real-DOM implementations of the plugin loader's injected seams: a native
 * dynamic `import()` and a same-origin SRI'd `<link rel="stylesheet">` injector.
 * Kept apart from the composition root so tests inject their own without pulling in
 * the DOM ones.
 */
import type { ImportModule, LoadStylesheet } from './plugin-loader';

export const nativeImport: ImportModule = (url) => import(/* @vite-ignore */ url);

/**
 * Inject a plugin stylesheet as a same-origin SRI'd `<link rel="stylesheet">` in
 * the document head and resolve once it loads, with a remover that detaches it. A
 * same-origin response is SRI-eligible with no `crossorigin`, so a byte mismatch
 * fails the integrity check and fires `error`, which rejects loudly. The link is
 * appended synchronously so its styles are in the cascade before the plugin's JS
 * imports and any contributed component renders.
 */
export const nativeLoadStylesheet: LoadStylesheet = (url, integrity) =>
  new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.integrity = integrity;
    const remove = (): void => {
      link.remove();
    };
    link.addEventListener(
      'load',
      () => {
        resolve(remove);
      },
      { once: true },
    );
    link.addEventListener(
      'error',
      () => {
        link.remove();
        reject(new Error(`stylesheet failed to load (fetch or integrity): ${url}`));
      },
      { once: true },
    );
    document.head.appendChild(link);
  });
