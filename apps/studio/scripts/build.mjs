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
import { dirname, resolve } from 'node:path';
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

async function buildVendor() {
  for (const entry of VENDOR_ENTRIES) {
    await build({
      root: appRoot,
      configFile: false,
      logLevel: 'warn',
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
