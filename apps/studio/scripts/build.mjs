/**
 * The one coherent production pipeline, run as `pnpm build`:
 *
 *   1. SPA         — the shell, with react/react-dom/@tai42/studio-sdk EXTERNAL
 *                    (consumed via the import map). Empties dist/ and emits
 *                    index.html (importmap anchor preserved) + hashed assets.
 *   2. Vendor      — the shared ESM singletons at the exact served-vendor paths
 *                    the skeleton's import map resolves to,
 *                    dist/vendor/{react,react-jsx-runtime,react-dom,
 *                    react-dom-client,studio-sdk,studio-sdk-host}.js. `react` is
 *                    bundled only into react.js; every other vendor entry keeps
 *                    react (and react-dom where relevant) external so all bind ONE
 *                    react instance. studio-sdk is the plugin surface;
 *                    studio-sdk-host carries the registry, and it is the only served
 *                    asset that does, so the registry state is a true singleton.
 *                    studio-sdk also carries @tai42/jq-studio, so it leaves lib
 *                    mode (see buildStudioSdkVendor) to ship the jq worker chunk and
 *                    jq.wasm as REAL same-origin files beside studio-sdk.js rather
 *                    than CSP-blocked data: URLs.
 *   3. Bridge      — the standalone, directory-self-contained OAuth bridge artifact
 *                    (dist/bridge/), whose allow-list is an anchored-root constant.
 *
 * Stage 1 runs first (it empties dist/); stages 2 and 3 append with
 * emptyOutDir:false so they never clobber the SPA or each other.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { build } from 'vite';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The shared-vendor entries, keyed by the served filename (== wrapper basename).
 * The output paths MUST match the served-vendor paths the skeleton's import map
 * resolves to exactly. */
const VENDOR_ENTRIES = [
  { out: 'react', external: [] },
  { out: 'react-jsx-runtime', external: ['react'] },
  { out: 'react-dom', external: ['react'] },
  { out: 'react-dom-client', external: ['react', 'react-dom'] },
  {
    out: 'studio-sdk',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
  {
    out: 'studio-sdk-host',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client'],
  },
];

async function buildSpa() {
  await build({
    root: appRoot,
    configFile: resolve(appRoot, 'vite.config.ts'),
    mode: 'production',
  });
}

/**
 * The SPA stage must NOT bundle a second jq runtime.
 *
 * The one jq runtime the deployment ships is jq-studio bundled INSIDE the
 * studio-sdk vendor entry (dist/vendor/studio-sdk.js + its worker chunk +
 * jq.wasm), reached at runtime through the import map. jq-studio builds a
 * module-scoped React context, so the shell MUST consume its jq surface —
 * including `PrimitivesProvider` — through the external `@tai42/studio-sdk`
 * (import-mapped to that one vendor copy), never from `@tai42/jq-studio`
 * directly. A stray direct import re-bundles jq-studio into dist/assets: Vite
 * splits its Web Worker into a `jq-studio-worker-*.js` chunk and emits a hashed
 * `jq-*.wasm` — a ~2.9MB duplicate that no loaded chunk even references (dead
 * weight), while its own `PrimitivesProvider` context, being a different object
 * than the vendor `JqField` reads, silently breaks the design-system injection.
 *
 * This assertion fails the build LOUDLY on that regression: dist/assets may hold
 * NO `*.wasm` and NO `jq-studio-worker-*.js`. It walks RECURSIVELY (Vite nests
 * emitted assets) — the mirror of `assertVendorHasOnlyJsAndWasm`, which guards
 * dist/vendor but says nothing about dist/assets.
 */
async function assertSpaShipsNoJqRuntime() {
  const assetsDir = resolve(appRoot, 'dist/assets');
  const entries = await readdir(assetsDir, { recursive: true, withFileTypes: true });
  const stray = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith('.wasm') || /^jq-studio-worker-.*\.js$/.test(entry.name)),
    )
    .map((entry) => relative(assetsDir, join(entry.parentPath, entry.name)));
  if (stray.length > 0) {
    throw new Error(
      `dist/assets must not contain a jq runtime, but the SPA build emitted ${stray.join(', ')}. ` +
        'The one jq runtime ships inside dist/vendor/studio-sdk.js (reached via the import map); a ' +
        'jq-studio-worker-*.js or a jq-*.wasm here means the shell re-bundled @tai42/jq-studio — a ~2.9MB ' +
        'orphan duplicate. Import jq-studio (JqField, PrimitivesProvider, …) through @tai42/studio-sdk, ' +
        'never from @tai42/jq-studio directly (only its /styles.css subpath, a pure CSS asset, is allowed).',
    );
  }
}

/** Drop extracted stylesheets from a lib-mode vendor entry.
 *
 * `vendor/studio-sdk.ts` re-exports the SDK barrel, and that barrel is declared
 * side-effectful (`sideEffects` in @tai42/studio-sdk) precisely so bundling
 * consumers keep its bare CSS imports. Rollup therefore keeps them in the vendor
 * entries too, and Vite would extract them into a `<pkg>.css` beside the vendor
 * JS — an asset no served document references, because the shell delivers the
 * design system itself through `src/styles.css` in stage 1. Dropping the extracted
 * stylesheets keeps the served vendor directory free of dead weight without
 * weakening the published `sideEffects` contract. (studio-sdk itself uses the
 * broader `dropExtractedAssetsExceptWasm` below; this plugin serves the remaining
 * lib-mode entries.) */
const dropExtractedCss = {
  name: 'tai-vendor-drop-extracted-css',
  enforce: 'post',
  generateBundle(_options, bundle) {
    for (const [fileName, output] of Object.entries(bundle)) {
      // `bundle` is Rollup's own keyed record, not a Map, so removal goes
      // through Reflect rather than a computed `delete`.
      if (output.type === 'asset' && fileName.endsWith('.css')) {
        Reflect.deleteProperty(bundle, fileName);
      }
    }
  },
};

/**
 * The studio-sdk vendor entry is the only one that carries `@tai42/jq-studio`, and
 * jq-studio's runtime is a Web Worker plus a `jq.wasm` binary the worker (and the
 * main-thread loader) resolve with `new URL('jq.wasm', import.meta.url)`. That
 * entry is therefore built OUT of Vite lib mode (see buildStudioSdkVendor), which
 * inlines both the worker and the wasm as `data:` URLs — blocked by the studio CSP
 * (`script-src 'self' 'wasm-unsafe-eval'`, no `data:`/`worker-src`). Out of lib
 * mode the worker and wasm are emitted as REAL same-origin files, but the same
 * build also extracts the SDK's stylesheet and its @font-face `.woff2` assets into
 * dist/vendor — dead weight, because the shell delivers the design system and its
 * fonts through `src/styles.css` in stage 1. This plugin keeps the jq runtime — the
 * `jq.wasm` binary and the worker (which Vite emits as a `.js` ASSET, not a chunk) —
 * and drops every other extracted asset, so the served vendor directory stays free
 * of dead weight without weakening jq-studio's embed contract (worker file +
 * `jq.wasm` beside it).
 */
const dropExtractedAssetsExceptWasm = {
  name: 'tai-vendor-drop-extracted-assets-except-wasm',
  enforce: 'post',
  generateBundle(_options, bundle) {
    for (const [fileName, output] of Object.entries(bundle)) {
      // Vite emits a bundled worker as an `asset` whose name ends in `.js`; keep it
      // (and `jq.wasm`), drop only the genuine dead weight (`.css`, `.woff2`, maps).
      if (output.type === 'asset' && !fileName.endsWith('.wasm') && !fileName.endsWith('.js')) {
        Reflect.deleteProperty(bundle, fileName);
      }
    }
  },
};

/**
 * Pin the properties above: dist/vendor holds JS singletons plus the one jq
 * runtime binary, and NOTHING else.
 *
 * The allow-list is precise. Every emitted file must be a `.js` (the vendor
 * singletons, the jq worker chunk, and the jq engine chunk are all JS) OR exactly
 * `jq.wasm` — jq-studio's WebAssembly binary, which the worker and the main-thread
 * loader resolve by that exact bare name relative to the emitted chunk. Anything
 * else — an extracted `.css`, a `.woff2`, a source map, a `.json`, or a hashed
 * `jq-<hash>.wasm` that no `import.meta.url` reference would resolve — is dead
 * weight and fails the build. It walks RECURSIVELY, because Vite emits extracted
 * assets under `assets/` by default and a flat read would pass over a nested stray.
 */
async function assertVendorHasOnlyJsAndWasm() {
  const vendorDir = resolve(appRoot, 'dist/vendor');
  const entries = await readdir(vendorDir, { recursive: true, withFileTypes: true });
  const stray = entries
    .filter((entry) => entry.isFile() && !entry.name.endsWith('.js') && entry.name !== 'jq.wasm')
    .map((entry) => relative(vendorDir, join(entry.parentPath, entry.name)));
  if (stray.length > 0) {
    throw new Error(
      `dist/vendor must contain JS singletons and jq.wasm only, but the build emitted ${stray.join(', ')}. ` +
        'Nothing in dist references a vendor stylesheet; the shell loads the design system via src/styles.css. ' +
        "The only permitted non-JS asset is jq-studio's jq.wasm, emitted beside its worker chunk.",
    );
  }
}

/**
 * Positive proof that the studio-sdk vendor entry shipped jq-studio's runtime as
 * REAL same-origin files — the exact regression this build stage exists to prevent.
 *
 * assertVendorHasOnlyJsAndWasm above only catches STRAY files, and it passes SILENTLY
 * on the regression: if studio-sdk ever slips back into Vite lib mode, the worker and
 * jq.wasm get inlined as `data:` URLs INSIDE studio-sdk.js, no jq.wasm and no worker
 * chunk are emitted, dist/vendor holds zero strays — the stray check stays green while
 * the jq Test panel breaks for every SPA user (the studio CSP blocks `data:`). These
 * assertions fail LOUDLY on that layout: they check the runtime is present as real
 * files and that studio-sdk.js carries no inlining signature.
 */
async function assertStudioSdkShipsRealJqRuntime() {
  const vendorDir = resolve(appRoot, 'dist/vendor');

  // 1. jq.wasm is a REAL WebAssembly binary beside studio-sdk.js (not an inlined data: URL).
  let wasmHead;
  try {
    wasmHead = await readFile(resolve(vendorDir, 'jq.wasm'));
  } catch {
    throw new Error(
      'dist/vendor/jq.wasm is missing: studio-sdk inlined jq.wasm as a data: URL (Vite lib mode) instead of ' +
        'emitting it as a real same-origin file. The studio CSP blocks data: wasm, so the jq Test panel would break for every SPA user.',
    );
  }
  if (!wasmHead.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d]))) {
    throw new Error(
      "dist/vendor/jq.wasm does not begin with the wasm magic bytes (\\0asm): it is not jq-studio's WebAssembly binary. " +
        'The worker and main-thread loader fetch it by that exact name, so a non-wasm file there breaks the jq Test panel for every SPA user.',
    );
  }

  // 2. The jq worker shipped as a real sibling chunk (not an inlined data: worker).
  const entries = await readdir(vendorDir, { withFileTypes: true });
  if (!entries.some((entry) => entry.isFile() && /^jq-studio-worker-.*\.js$/.test(entry.name))) {
    throw new Error(
      'dist/vendor has no jq-studio-worker-*.js chunk: studio-sdk inlined the jq Web Worker as a data: URL (Vite lib mode) ' +
        'instead of a real same-origin chunk. The studio CSP blocks data: workers, so the jq Test panel would break for every SPA user.',
    );
  }

  // 3. studio-sdk.js resolves the wasm as a real file and carries NO inlining signature.
  const sdk = await readFile(resolve(vendorDir, 'studio-sdk.js'), 'utf8');
  if (sdk.includes('data:application/wasm') || sdk.includes('data:text/javascript')) {
    throw new Error(
      'dist/vendor/studio-sdk.js contains a data: URL (data:application/wasm or data:text/javascript): studio-sdk slipped ' +
        'back into Vite lib mode and inlined the jq wasm/worker. The studio CSP blocks data:, so the jq Test panel would break for every SPA user.',
    );
  }
  if (!/new URL\(\s*["']jq\.wasm["']/.test(sdk)) {
    throw new Error(
      "dist/vendor/studio-sdk.js has no `new URL('jq.wasm', import.meta.url)` reference: studio-sdk is not resolving jq.wasm " +
        'as a real same-origin file. Without it the worker and main-thread loader cannot find the wasm, and the jq Test panel would break for every SPA user.',
    );
  }
}

/**
 * The studio-sdk vendor entry, built OUT of Vite lib mode.
 *
 * lib mode makes a self-contained library and so INLINES every worker and every
 * `new URL(asset, import.meta.url)` target as a `data:` URL. For jq-studio that is
 * fatal under the studio CSP: the jq Web Worker becomes `new Worker("data:…")`
 * (blocked — `script-src` lists no `data:`, and there is no `worker-src`) and
 * `jq.wasm` becomes a `data:application/wasm` fetch (blocked by `connect-src
 * 'self'`), so the editor falls back and reports "The jq engine could not load."
 *
 * A plain rollup input/output build (no `build.lib`) emits jq-studio's worker as a
 * REAL same-origin chunk and `jq.wasm` as a REAL asset. `base: './'` keeps every
 * `import.meta.url` reference RELATIVE, so from the served `/vendor/studio-sdk.js`
 * (and from the worker chunk beside it) `new URL('jq.wasm', import.meta.url)`
 * resolves to `/vendor/jq.wasm` and `new URL('jq-studio-worker-*.js', …)` to the
 * sibling worker — a same-origin module worker `script-src 'self'` permits, whose
 * wasm `connect-src 'self'` permits. `jq.wasm` is pinned to its bare name (the exact
 * name jq-studio's `import.meta.url` references resolve) so the reference and the
 * emitted file agree; `assetsInlineLimit: 0` forbids any residual inlining.
 * `preserveEntrySignatures` keeps the barrel's named exports the import map serves.
 */
async function buildStudioSdkVendor(external) {
  await build({
    root: appRoot,
    // Relative asset URLs: `new URL(asset, import.meta.url)` resolves beside the
    // served /vendor/studio-sdk.js instead of against the origin root.
    base: './',
    configFile: false,
    logLevel: 'warn',
    plugins: [dropExtractedAssetsExceptWasm],
    publicDir: false,
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    resolve: { dedupe: ['react', 'react-dom'] },
    // Emit jq-studio's worker as a real ES module chunk (not an inlined data: URL).
    worker: { format: 'es' },
    build: {
      outDir: 'dist/vendor',
      emptyOutDir: false,
      cssCodeSplit: false,
      // No data: inlining — jq.wasm and the worker must be real same-origin files.
      assetsInlineLimit: 0,
      modulePreload: { polyfill: false },
      rollupOptions: {
        input: { 'studio-sdk': resolve(appRoot, 'vendor/studio-sdk.ts') },
        external,
        preserveEntrySignatures: 'allow-extension',
        output: {
          format: 'es',
          entryFileNames: '[name].js',
          chunkFileNames: '[name]-[hash].js',
          // Pin jq.wasm to its bare name (the name jq-studio's import.meta.url
          // references resolve); other assets keep a hash but are dropped anyway.
          assetFileNames: (info) => {
            const name = info.names?.[0] ?? info.name ?? '';
            return name.endsWith('.wasm') ? '[name][extname]' : '[name]-[hash][extname]';
          },
        },
      },
    },
  });
}

async function buildVendor() {
  for (const entry of VENDOR_ENTRIES) {
    // studio-sdk carries jq-studio (worker + jq.wasm); it must leave lib mode so
    // those ship as real same-origin files, not CSP-blocked data: URLs.
    if (entry.out === 'studio-sdk') {
      await buildStudioSdkVendor(entry.external);
      // Positive check that the jq runtime shipped as real files, not inlined data:
      // URLs (the regression the stray-file check above cannot see).
      await assertStudioSdkShipsRealJqRuntime();
      continue;
    }
    await build({
      root: appRoot,
      configFile: false,
      logLevel: 'warn',
      plugins: [dropExtractedCss],
      // The SPA stage already copied public/ into dist/; vendor stages must not
      // re-copy it into dist/vendor/.
      publicDir: false,
      // React's CJS entry branches on process.env.NODE_ENV to pick its production
      // build; define it so the dev `require` is eliminated (no ESM require crash).
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      resolve: { dedupe: ['react', 'react-dom'] },
      build: {
        outDir: 'dist/vendor',
        emptyOutDir: false,
        cssCodeSplit: false,
        modulePreload: { polyfill: false },
        lib: {
          entry: resolve(appRoot, `vendor/${entry.out}.ts`),
          formats: ['es'],
          fileName: () => `${entry.out}.js`,
        },
        rollupOptions: { external: entry.external },
      },
    });
  }
  await assertVendorHasOnlyJsAndWasm();
}

async function buildBridge() {
  const bridgeRoot = resolve(appRoot, 'bridge');
  const allowedRoot = process.env.VITE_BRIDGE_ALLOWED_ROOT ?? 'tai42.ai';
  await build({
    root: bridgeRoot,
    base: './',
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    define: {
      'import.meta.env.VITE_BRIDGE_ALLOWED_ROOT': JSON.stringify(allowedRoot),
    },
    build: {
      // A directory-self-contained artifact: absolute outDir outside the bridge
      // root, safe to empty (its own directory), all refs relative via base './'.
      outDir: resolve(appRoot, 'dist/bridge'),
      emptyOutDir: true,
      modulePreload: { polyfill: false },
      rollupOptions: { input: resolve(bridgeRoot, 'oauth-bridge.html') },
    },
  });
}

await buildSpa();
// Stage 1 must ship no jq runtime of its own — the one runtime lives in the
// studio-sdk vendor entry built next. Fail loudly here if the shell re-bundled
// @tai42/jq-studio (orphan worker + wasm in dist/assets).
await assertSpaShipsNoJqRuntime();
await buildVendor();
await buildBridge();
