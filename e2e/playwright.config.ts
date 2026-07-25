import { defineConfig, devices } from '@playwright/test';

/**
 * The live harness. The suites drive the Studio SERVED BY THE SKELETON — not
 * `vite preview` — because the Studio-plugin system depends on the server-injected
 * import map: the skeleton stamps the import map + CSP nonce into index.html
 * at serve time, resolves react/@tai42/studio-sdk through it, and serves the plugin
 * bundles under `/api/plugins/{name}/studio/`. A statically-previewed index.html
 * would carry the un-replaced `<!--tai-importmap-->` anchor and die on the first
 * bare specifier.
 *
 * `webServer` runs the boot recipe (boot/boot.sh): loopback Redis + Postgres, the
 * reference plugin installed into the skeleton env, the built SPA, and a skeleton
 * with access control ON, the seeded test-only key, and the two-tier route
 * mappings. Playwright polls the skeleton URL, then owns its lifecycle.
 */
const STUDIO_PORT = Number(process.env.STUDIO_PORT ?? 8765);
const baseURL = `http://127.0.0.1:${String(STUDIO_PORT)}`;

/** The seeded, obviously test-only API key the suites paste at /login. Must match
 * boot.sh's default so a bare `pnpm e2e` works with no extra env. */
export const STUDIO_API_KEY = process.env.STUDIO_API_KEY ?? 'sk-e2e-DO-NOT-USE-IN-PRODUCTION-000';

/** The `user_id` that key resolves to. Must match boot.sh's default. */
export const STUDIO_USER_ID = process.env.STUDIO_USER_ID ?? 'studio-e2e';

export default defineConfig({
  testDir: './tests',
  // Serial: the suites share one live skeleton + one Redis; the key-expiry and
  // integrity cases mutate shared server state, so parallel workers would race.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'bash boot/boot.sh',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // The recipe pulls docker images, installs the plugin, and builds the SPA on
    // a cold run, so give it room.
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      STUDIO_API_KEY,
      STUDIO_USER_ID,
      STUDIO_PORT: String(STUDIO_PORT),
      // Locally, reuse a prebuilt dist for a fast loop; CI builds fresh.
      SKIP_SPA_BUILD: process.env.CI ? '0' : (process.env.SKIP_SPA_BUILD ?? '1'),
    },
  },
});
