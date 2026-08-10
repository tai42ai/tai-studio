/**
 * Build the reference Studio plugin's front-end bundle and emit its
 * `studio-manifest.json`. Run as `pnpm --filter @tai42/e2e build:reference-plugin`;
 * CI runs it before the Playwright suites.
 *
 * The bundle is a single content-hashed ESM file with `react`, `react-dom`, their
 * subpath entries (`react/jsx-runtime`, `react-dom/client`), and `@tai42/studio-sdk`
 * marked EXTERNAL — exactly the modules the host serves through the import map, so
 * the bundle binds the host's singletons. The manifest carries the plugin name,
 * version, the targeted `STUDIO_PLUGIN_API_VERSION` (read from the SDK source so it
 * can never drift), the contributions, the entry filename, and a sha384 integrity
 * entry for every emitted file. The skeleton registry re-hashes each served file at
 * startup and rejects loudly on any mismatch, so these hashes must be real.
 */
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const e2eRoot = resolve(scriptDir, '..');
const repoRoot = resolve(e2eRoot, '..');
const pluginRoot = resolve(e2eRoot, 'reference-plugin');
const srcDir = resolve(pluginRoot, 'studio-src');
const entryFile = resolve(srcDir, 'index.tsx');
const outDir = resolve(pluginRoot, 'src', 'reference_plugin', 'studio');
const sdkVersionFile = resolve(repoRoot, 'packages', 'studio-sdk', 'src', 'plugin', 'version.ts');

/** The three shared modules the host provides through the import map. A
 * plugin that bundled its own copy would break the React singleton. */
const EXTERNAL = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react-dom/client',
  '@tai42/studio-sdk',
];

/** Read STUDIO_PLUGIN_API_VERSION from the SDK source — the single source of
 * truth, so a version bump there is reflected here without a manual edit. */
function readApiVersion() {
  const source = readFileSync(sdkVersionFile, 'utf8');
  const match = /export const STUDIO_PLUGIN_API_VERSION\s*=\s*(\d+)\s*;/.exec(source);
  if (match === null) {
    throw new Error(`could not read STUDIO_PLUGIN_API_VERSION from ${sdkVersionFile}`);
  }
  return Number.parseInt(match[1], 10);
}

/** Read the plugin's own version from its pyproject so the two never diverge. */
function readPluginVersion() {
  const source = readFileSync(resolve(pluginRoot, 'pyproject.toml'), 'utf8');
  const match = /^version\s*=\s*"([^"]+)"/m.exec(source);
  if (match === null) {
    throw new Error('could not read version from reference-plugin/pyproject.toml');
  }
  return match[1];
}

function sha384(bytes) {
  return 'sha384-' + createHash('sha384').update(bytes).digest('base64');
}

async function main() {
  await build({
    root: srcDir,
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    // React's JSX runtime is external; the plugin transform emits `react/jsx-runtime`
    // imports that stay external and resolve through the host import map.
    plugins: [react()],
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
      outDir,
      emptyOutDir: true,
      target: 'es2022',
      minify: true,
      cssCodeSplit: false,
      modulePreload: { polyfill: false },
      lib: {
        entry: entryFile,
        formats: ['es'],
      },
      rollupOptions: {
        external: EXTERNAL,
        output: {
          // Content-hashed single-file bundle: one entry chunk, no code-split
          // lazy chunks. Non-JS assets (the scoped stylesheet) are content-hashed
          // too, so every emitted file is immutable-cache-safe and the integrity
          // map covers each by its hashed name.
          entryFileNames: 'reference-plugin-[hash].js',
          assetFileNames: 'reference-plugin-[hash][extname]',
          inlineDynamicImports: true,
        },
      },
    },
  });

  const emitted = readdirSync(outDir).filter((name) => name.endsWith('.js'));
  if (emitted.length !== 1) {
    throw new Error(
      `expected exactly one emitted JS bundle, got ${emitted.length}: ${emitted.join(', ')}`,
    );
  }
  const entry = emitted[0];

  const integrity = {};
  for (const name of readdirSync(outDir)) {
    if (name === 'studio-manifest.json') continue;
    integrity[name] = sha384(readFileSync(resolve(outDir, name)));
  }

  const manifest = {
    name: 'reference_plugin',
    version: readPluginVersion(),
    api_version: readApiVersion(),
    entry,
    integrity,
    contributions: {
      tool_panels: { studio_demo_echo: 'EchoPanel' },
      pages: ['demo'],
      settings_tabs: ['demo'],
      nav_entries: ['demo'],
    },
  };

  const manifestPath = resolve(outDir, 'studio-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  if (!existsSync(manifestPath)) {
    throw new Error('studio-manifest.json was not written');
  }
  console.log(
    `reference plugin built: ${outDir}\n  entry: ${entry}\n  api_version: ${String(manifest.api_version)}\n  files: ${Object.keys(integrity).join(', ')}`,
  );
}

await main();
