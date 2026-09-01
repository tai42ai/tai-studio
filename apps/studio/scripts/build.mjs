/**
 * The one coherent production pipeline, run as `pnpm build`:
 *
 *   1. SPA         — the shell, with react/react-dom/@tai42/studio-sdk EXTERNAL
 *                    (consumed via the import map). Empties dist/ and emits
 *                    index.html (importmap anchor preserved) + hashed assets.
 *   2. Vendor      — the shared ESM singletons at the exact served-vendor paths
 *                    the skeleton's import map resolves to,
 *                    dist/vendor/{react,react-jsx-runtime,react-dom,
 *                    react-dom-client,studio-sdk,studio-sdk-host,jq-studio}.js.
 *                    `react` is bundled only into react.js; every other vendor entry
 *                    keeps react (and react-dom where relevant) external so all bind
 *                    ONE react instance. studio-sdk is the plugin surface;
 *                    studio-sdk-host carries the registry, and it is the only served
 *                    asset that does, so the registry state is a true singleton.
 *                    jq-studio is the standalone visual jq editor, served under its
 *                    own bare specifier so every consumer — shell, feature, plugin —
 *                    binds one editor, one primitives context, one worker. It is the
 *                    entry that carries the jq runtime, so it leaves lib mode (see
 *                    buildJqStudioVendor) to ship the worker chunk and jq.wasm as
 *                    REAL same-origin files beside jq-studio.js rather than
 *                    CSP-blocked data: URLs.
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
  {
    out: 'jq-studio',
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
 * The one jq runtime the deployment ships is its own vendor entry
 * (dist/vendor/jq-studio.js + its worker chunk + jq.wasm), reached at runtime
 * through the import map. jq-studio builds a module-scoped React context, so the
 * shell and its features MUST consume the editor through the EXTERNAL bare
 * `@tai42/jq-studio` specifier (import-mapped to that one vendor copy) — never a
 * deep subpath, which no external rule and no import-map entry covers. A stray
 * bundled import re-emits jq-studio into dist/assets: Vite splits its Web Worker
 * into a `jq-studio-worker-*.js` chunk and emits a hashed `jq-*.wasm` — a ~2.9MB
 * duplicate that no loaded chunk even references (dead weight), while its own
 * `PrimitivesProvider` context, being a different object than the vendor `JqField`
 * reads, silently breaks the design-system injection.
 *
 * This assertion fails the build LOUDLY on that regression: dist/assets may hold
 * NO `*.wasm` and NO `jq-studio-worker-*.js`. It walks RECURSIVELY (Vite nests
 * emitted assets) — the mirror of `assertVendorHasOnlyExpectedFiles`, which guards
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
        'The one jq runtime ships as dist/vendor/jq-studio.js (reached via the import map); a ' +
        'jq-studio-worker-*.js or a jq-*.wasm here means the shell re-bundled @tai42/jq-studio — a ~2.9MB ' +
        'orphan duplicate. Import the editor (JqField, PrimitivesProvider, …) through the bare ' +
        '@tai42/jq-studio specifier, which SHARED_EXTERNALS keeps external; only its /styles.css subpath, ' +
        'a pure CSS asset, is meant to be bundled.',
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
 * weakening the published `sideEffects` contract. (jq-studio, the one entry built
 * out of lib mode, uses the broader `dropExtractedAssetsExceptWasm` below; this
 * plugin serves the lib-mode entries.) */
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
 * jq-studio's runtime is a Web Worker plus a `jq.wasm` binary the worker (and the
 * main-thread loader) resolve with `new URL('jq.wasm', import.meta.url)`. Its
 * vendor entry is therefore built OUT of Vite lib mode (see buildJqStudioVendor),
 * which inlines both the worker and the wasm as `data:` URLs — blocked by the
 * studio CSP (`script-src 'self' 'wasm-unsafe-eval'`, no `data:`/`worker-src`). Out
 * of lib mode the worker and wasm are emitted as REAL same-origin files, but the
 * same build also extracts any stylesheet and `@font-face` `.woff2` assets reached
 * from the entry into dist/vendor — dead weight, because the shell delivers the
 * design system, its fonts, and the editor's own chrome stylesheet through
 * `src/styles.css` in stage 1. This plugin keeps the jq runtime — the
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

/** The jq runtime's sidecar files: the jq-studio vendor entry is the one entry built
 * out of lib mode, so it emits its Web Worker and its wasm-engine glue as hashed
 * sibling chunks beside jq-studio.js. Their hashes change with every content change,
 * so they are matched by shape rather than by exact name. */
const JQ_RUNTIME_SIDECARS = [/^jq-studio-worker-.*\.js$/, /^jq-studio-jq-.*\.js$/];

/**
 * Pin the properties above: dist/vendor holds exactly the served vendor singletons,
 * the jq runtime's own sidecars, and NOTHING else.
 *
 * The allow-list is by FILENAME, not by extension. Each VENDOR_ENTRIES wrapper emits
 * one `<out>.js` at the served-vendor path the import map resolves to; jq-studio adds
 * its worker chunk, its wasm-engine chunk, and `jq.wasm` — the WebAssembly binary the
 * worker and the main-thread loader resolve by that exact bare name relative to the
 * emitted chunk. Anything else fails the build, named:
 *
 *   - a non-JS stray (an extracted `.css`, a `.woff2`, a source map, a `.json`, or a
 *     hashed `jq-<hash>.wasm` that no `import.meta.url` reference would resolve) is
 *     dead weight; nothing in dist references a vendor stylesheet, because the shell
 *     loads the design system via `src/styles.css`;
 *   - an UNEXPECTED `.js` is a code-splitting regression: a vendor wrapper that grew a
 *     dynamic `import()` turns its entry into a shim and pushes the real payload into
 *     a hashed sibling chunk. An extension allow-list waves that through — a 4.4MB
 *     orphan copy of the editor beside a few-hundred-byte studio-sdk.js — so the
 *     served bytes must be enumerable by name.
 *
 * It walks RECURSIVELY and matches on the path relative to dist/vendor, because Vite
 * emits extracted assets under `assets/` by default and a flat read (or a basename
 * match) would pass over a nested stray.
 */
async function assertVendorHasOnlyExpectedFiles() {
  const vendorDir = resolve(appRoot, 'dist/vendor');
  const expected = new Set([...VENDOR_ENTRIES.map((entry) => `${entry.out}.js`), 'jq.wasm']);
  const entries = await readdir(vendorDir, { recursive: true, withFileTypes: true });
  const stray = entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(vendorDir, join(entry.parentPath, entry.name)))
    .filter(
      (path) => !expected.has(path) && !JQ_RUNTIME_SIDECARS.some((pattern) => pattern.test(path)),
    );
  if (stray.length > 0) {
    throw new Error(
      `dist/vendor must contain the served vendor entries (${[...expected].join(', ')}), jq-studio's ` +
        `worker and engine chunks, and nothing else, but the build also emitted ${stray.join(', ')}. ` +
        'A non-JS stray is dead weight (the shell loads the design system via src/styles.css). An ' +
        'unexpected .js chunk means a vendor entry was code-split — typically a dynamic import() in a ' +
        'vendor/*.ts wrapper, which leaves a shim entry and an orphan chunk carrying the real payload. ' +
        'Keep each vendor wrapper a static re-export so its whole surface stays in the served entry file.',
    );
  }
}

/** Local chunk specifiers reachable from a served vendor entry: the quoted argument of
 * a static `import`/`export … from` or a dynamic `import()`, kept to relative paths
 * ending in `.js` so bare externals (`react`) and incidental string literals in
 * minified code are never mistaken for a chunk. */
const LOCAL_CHUNK_SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*["'](\.{1,2}\/[^"']*\.js)["']/g;

/**
 * Read a served vendor entry together with the transitive closure of the local chunks
 * it imports, statically or dynamically, keyed by path relative to dist/vendor.
 *
 * The closure is what a browser actually gets when it resolves that vendor specifier,
 * and it is the unit the entry's content assertions must inspect: a single dynamic
 * `import()` splits an entry into a shim plus hashed chunks, and any assertion that
 * reads only the entry file would then be inspecting a few hundred bytes of re-export
 * while the payload it exists to forbid sits in the sibling chunk.
 */
async function readVendorImportClosure(entryFileName) {
  const vendorDir = resolve(appRoot, 'dist/vendor');
  const closure = new Map();
  const queue = [entryFileName];
  while (queue.length > 0) {
    const fileName = queue.shift();
    if (closure.has(fileName)) continue;
    let bytes;
    try {
      bytes = await readFile(resolve(vendorDir, fileName));
    } catch {
      throw new Error(
        `dist/vendor/${entryFileName} imports dist/vendor/${fileName}, which the build did not emit: ` +
          'the served vendor entry is broken and would fail to load in the browser.',
      );
    }
    closure.set(fileName, bytes);
    for (const [, specifier] of bytes.toString('utf8').matchAll(LOCAL_CHUNK_SPECIFIER)) {
      const target = relative(vendorDir, resolve(vendorDir, dirname(fileName), specifier));
      // A specifier escaping dist/vendor is not a chunk of this artifact.
      if (!target.startsWith('..')) queue.push(target);
    }
  }
  return closure;
}

/** The studio-sdk vendor entry's size ceiling, measured over its whole import closure.
 * The jq-free SDK surface builds to a few hundred KB; an edge to @tai42/jq-studio
 * inlines the wasm engine and the worker and takes it past 4MB. The ceiling sits far
 * above the honest size and far below the regressed one, so it never flaps on ordinary
 * SDK growth. */
const STUDIO_SDK_MAX_BYTES = 1_000_000;

/**
 * Positive proof that the jq-studio vendor entry shipped the jq runtime as REAL
 * same-origin files — the exact regression this build stage exists to prevent.
 *
 * assertVendorHasOnlyJsAndWasm above only catches STRAY files, and it passes SILENTLY
 * on the regression: if jq-studio ever slips back into Vite lib mode, the worker and
 * jq.wasm get inlined as `data:` URLs INSIDE jq-studio.js, no jq.wasm and no worker
 * chunk are emitted, dist/vendor holds zero strays — the stray check stays green while
 * the jq Test panel breaks for every SPA user (the studio CSP blocks `data:`). These
 * assertions fail LOUDLY on that layout: they check the runtime is present as real
 * files and that jq-studio.js carries no inlining signature.
 */
async function assertJqStudioShipsRealJqRuntime() {
  const vendorDir = resolve(appRoot, 'dist/vendor');

  // 1. jq.wasm is a REAL WebAssembly binary beside jq-studio.js (not an inlined data: URL).
  let wasmHead;
  try {
    wasmHead = await readFile(resolve(vendorDir, 'jq.wasm'));
  } catch {
    throw new Error(
      'dist/vendor/jq.wasm is missing: jq-studio inlined jq.wasm as a data: URL (Vite lib mode) instead of ' +
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
      'dist/vendor has no jq-studio-worker-*.js chunk: jq-studio inlined the jq Web Worker as a data: URL (Vite lib mode) ' +
        'instead of a real same-origin chunk. The studio CSP blocks data: workers, so the jq Test panel would break for every SPA user.',
    );
  }

  // 3. jq-studio.js resolves the wasm as a real file and carries NO inlining signature.
  const editor = await readFile(resolve(vendorDir, 'jq-studio.js'), 'utf8');
  if (editor.includes('data:application/wasm') || editor.includes('data:text/javascript')) {
    throw new Error(
      'dist/vendor/jq-studio.js contains a data: URL (data:application/wasm or data:text/javascript): jq-studio slipped ' +
        'back into Vite lib mode and inlined the jq wasm/worker. The studio CSP blocks data:, so the jq Test panel would break for every SPA user.',
    );
  }
  if (!/new URL\(\s*["']jq\.wasm["']/.test(editor)) {
    throw new Error(
      "dist/vendor/jq-studio.js has no `new URL('jq.wasm', import.meta.url)` reference: jq-studio is not resolving jq.wasm " +
        'as a real same-origin file. Without it the worker and main-thread loader cannot find the wasm, and the jq Test panel would break for every SPA user.',
    );
  }
}

/**
 * Positive proof that the studio-sdk vendor entry carries NO jq runtime.
 *
 * This is the served half of the standalone-jq architecture: the SDK barrel
 * re-exports nothing of `@tai42/jq-studio`, so the plugin surface every consumer
 * imports for a Button must not drag the editor, its worker, or its ~2.9MB wasm
 * along. A pass-through re-export slipped back into the barrel would be invisible
 * to the checks above — dist/vendor would simply hold a second, orphan copy of the
 * runtime bundled inside studio-sdk.js — so this asserts the absence directly.
 *
 * The regression has two SHAPES, and this check covers both because it reads the
 * entry's whole import closure (see readVendorImportClosure), not just the entry file:
 *
 *   - a STATIC edge keeps studio-sdk in one file: Vite LIB mode INLINES a bundled
 *     worker and every `new URL(asset, import.meta.url)` target as a `data:` URL, so
 *     no sibling `jq.wasm` and no `jq-studio-worker-*.js` are emitted and the whole
 *     runtime is swallowed into `data:` payloads inside studio-sdk.js;
 *   - a DYNAMIC edge (`() => import('@tai42/jq-studio')`) splits it: studio-sdk.js
 *     becomes a shim and the runtime lands in a hashed sibling chunk it imports.
 *
 * The signatures survive both: the `data:` URL prefixes, the editor's own
 * `jq-studio-root` class marker (the mirror of check #3 in
 * assertJqStudioShipsRealJqRuntime), named references to the runtime's real files, and
 * the closure's total size.
 */
async function assertStudioSdkShipsNoJqRuntime() {
  const closure = await readVendorImportClosure('studio-sdk.js');
  const cause =
    'The SDK barrel must re-export no jq — consumers import the editor directly and the import map ' +
    'resolves it to dist/vendor/jq-studio.js, so a barrel edge means a SECOND jq copy, a second ' +
    'primitives context, and a second worker.';

  for (const [fileName, bytes] of closure) {
    const source = bytes.toString('utf8');
    const where =
      fileName === 'studio-sdk.js'
        ? 'dist/vendor/studio-sdk.js'
        : `dist/vendor/${fileName} (a chunk studio-sdk.js imports)`;

    // 1. Lib mode inlines the jq worker and jq.wasm as data: URLs, so those prefixes
    //    are the fingerprint of the jq runtime sitting inside this entry.
    const inlined = ['data:application/wasm', 'data:text/javascript'].filter((signature) =>
      source.includes(signature),
    );
    if (inlined.length > 0) {
      throw new Error(
        `${where} contains ${inlined.join(' and ')}: the entry inlined a wasm binary or a ` +
          `Web Worker, which in this build can only be @tai42/jq-studio's. ${cause}`,
      );
    }

    // 2. The editor's own content marker: jq-studio scopes its styles under a
    //    `jq-studio-root` element and names that class in its components, so the string
    //    is present in any bundle carrying the editor — inlined or not.
    if (source.includes('jq-studio-root')) {
      throw new Error(
        `${where} contains the jq-studio-root marker: the visual jq editor is bundled into ` +
          `the SDK's served asset. ${cause}`,
      );
    }

    // 3. Named references to the runtime's real files — the shape a NON-lib-mode build
    //    of this entry would take.
    if (/jq\.wasm|jq-studio-worker/.test(source)) {
      throw new Error(
        `${where} references the jq runtime (jq.wasm or the jq worker chunk). ${cause}`,
      );
    }
  }

  // 4. Size ceiling over the whole closure — the backstop for a jq edge whose
  //    signatures all change, and immune to a shim entry hiding the bytes in a chunk.
  const totalBytes = [...closure.values()].reduce((total, bytes) => total + bytes.byteLength, 0);
  if (totalBytes > STUDIO_SDK_MAX_BYTES) {
    throw new Error(
      `The dist/vendor/studio-sdk.js import closure (${[...closure.keys()].join(', ')}) is ${totalBytes} bytes, ` +
        `over the ${STUDIO_SDK_MAX_BYTES}-byte ceiling. The likeliest cause by far is a barrel edge to ` +
        `@tai42/jq-studio, which drags in the ~2.9MB wasm engine and the jq worker. ${cause} If the SDK ` +
        'surface itself genuinely grew this much, raise the ceiling deliberately.',
    );
  }
}

/**
 * The jq-studio vendor entry, built OUT of Vite lib mode.
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
 * `import.meta.url` reference RELATIVE, so from the served `/vendor/jq-studio.js`
 * (and from the worker chunk beside it) `new URL('jq.wasm', import.meta.url)`
 * resolves to `/vendor/jq.wasm` and `new URL('jq-studio-worker-*.js', …)` to the
 * sibling worker — a same-origin module worker `script-src 'self'` permits, whose
 * wasm `connect-src 'self'` permits. `jq.wasm` is pinned to its bare name (the exact
 * name jq-studio's `import.meta.url` references resolve) so the reference and the
 * emitted file agree; `assetsInlineLimit: 0` forbids any residual inlining.
 * `preserveEntrySignatures` keeps the entry's named exports the import map serves.
 */
async function buildJqStudioVendor(external) {
  await build({
    root: appRoot,
    // Relative asset URLs: `new URL(asset, import.meta.url)` resolves beside the
    // served /vendor/jq-studio.js instead of against the origin root.
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
        input: { 'jq-studio': resolve(appRoot, 'vendor/jq-studio.ts') },
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
    // jq-studio carries the jq runtime (worker + jq.wasm); it must leave lib mode so
    // those ship as real same-origin files, not CSP-blocked data: URLs.
    if (entry.out === 'jq-studio') {
      await buildJqStudioVendor(entry.external);
      // Positive check that the jq runtime shipped as real files, not inlined data:
      // URLs (the regression the stray-file check above cannot see).
      await assertJqStudioShipsRealJqRuntime();
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
  await assertVendorHasOnlyExpectedFiles();
  // The SDK's served copy must be jq-free — the served half of the barrel's
  // no-jq-re-export contract.
  await assertStudioSdkShipsNoJqRuntime();
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
// jq-studio vendor entry built next. Fail loudly here if the shell re-bundled
// @tai42/jq-studio (orphan worker + wasm in dist/assets).
await assertSpaShipsNoJqRuntime();
await buildVendor();
await buildBridge();
