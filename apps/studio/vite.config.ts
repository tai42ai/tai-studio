import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const DEFAULT_API_PROXY_TARGET = 'http://localhost:8765';

/**
 * The SHELL SPA build + dev server.
 *
 * Module sharing: `react`, `react-dom` (+ the `react/jsx-runtime` and
 * `react-dom/client` subpaths), `@tai42/studio-sdk`, and its `@tai42/studio-sdk/host`
 * subpath are marked EXTERNAL — the shell consumes them through the server-injected
 * import map, exactly as every Studio-plugin bundle does, so there is ONE React/SDK
 * instance for the whole page (a shell that bundled its own React would break hooks
 * across the plugin boundary). Externalizing `@tai42/studio-sdk/host` in particular is
 * what makes the shell and the feature bundles resolve to the one served
 * `studio-sdk-host.js`, keeping the contribution registry a single instance. The
 * matching standalone vendor assets are emitted by
 * `scripts/build.mjs`; this config never bundles them. `resolve.dedupe` guards
 * against a second copy sneaking in through a transitive dependency.
 *
 * The full production pipeline (SPA → vendor assets → standalone bridge) runs via
 * `scripts/build.mjs`; this config is the SPA stage and the `vite dev` server.
 */
export const SHARED_EXTERNALS: readonly string[] = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react-dom/client',
  '@tai42/studio-sdk',
  '@tai42/studio-sdk/host',
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiProxyTarget = env.VITE_API_PROXY_TARGET ?? DEFAULT_API_PROXY_TARGET;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      // One React/ReactDOM instance — the singleton the import map serves.
      dedupe: ['react', 'react-dom'],
    },
    server: {
      proxy: {
        // The Studio has no server of its own; it drives a running
        // skeleton. Same-origin `/api` requests proxy to that skeleton so
        // the browser never needs a cross-origin credential.
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    build: {
      // No inline module-preload polyfill script (CSP): the import map is the
      // ONLY first-party inline script the page carries.
      modulePreload: { polyfill: false },
      rollupOptions: {
        external: (id: string): boolean => SHARED_EXTERNALS.includes(id),
      },
    },
  };
});
