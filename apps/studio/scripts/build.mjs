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
 *   3. Bridge      — the standalone, directory-self-contained OAuth bridge artifact
 *                    (dist/bridge/), whose allow-list is an anchored-root constant.
 *
 * Stage 1 runs first (it empties dist/); stages 2 and 3 append with
 * emptyOutDir:false so they never clobber the SPA or each other.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { readdir } from 'node:fs/promises';
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

/** The vendor stage emits ESM JS singletons and nothing else.
 *
 * `vendor/studio-sdk.ts` re-exports the SDK barrel, and that barrel is declared
 * side-effectful (`sideEffects` in @tai42/studio-sdk) precisely so bundling
 * consumers keep its three bare CSS imports. Rollup therefore keeps them here
 * too, and Vite's lib mode would extract them into a `<pkg>.css` beside the
 * vendor JS — an asset no served document references, because the shell delivers
 * the design system itself through `src/styles.css` in stage 1. Dropping the
 * extracted stylesheets keeps the served vendor directory free of dead weight
 * without weakening the published `sideEffects` contract. */
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
 * Pin the property above: dist/vendor holds JS singletons and NOTHING else.
 *
 * The assertion is what the sentence says — every file must be a `.js` — rather
 * than "no `.css`": a stylesheet is only the emission this plugin was written to
 * stop, and an extracted `.woff2`, a source map or a `.json` in the served vendor
 * directory is the same class of dead weight. It walks RECURSIVELY, because Vite
 * emits extracted assets under `assets/` by default and a flat read would pass
 * over `dist/vendor/assets/studio-app.css` without seeing it.
 */
async function assertVendorHasOnlyJs() {
  const vendorDir = resolve(appRoot, 'dist/vendor');
  const entries = await readdir(vendorDir, { recursive: true, withFileTypes: true });
  const stray = entries
    .filter((entry) => entry.isFile() && !entry.name.endsWith('.js'))
    .map((entry) => relative(vendorDir, join(entry.parentPath, entry.name)));
  if (stray.length > 0) {
    throw new Error(
      `dist/vendor must contain JS singletons only, but the build emitted ${stray.join(', ')}. ` +
        'Nothing in dist references a vendor stylesheet; the shell loads the design system via src/styles.css.',
    );
  }
}

async function buildVendor() {
  for (const entry of VENDOR_ENTRIES) {
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
  await assertVendorHasOnlyJs();
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
await buildVendor();
await buildBridge();
