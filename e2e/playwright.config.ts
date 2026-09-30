import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { TARGET, undeclaredSpecs } from './target';

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
 *
 * `TAI_E2E_TARGET` overrides that: set it to a running stack (a bare origin, or the
 * name of a file in `e2e/targets/`) and the suites boot nothing, drive that stack, and
 * skip `webServer` entirely; a `globalSetup` reads which kinds it has on so each spec's
 * declared needs are matched against it. Unset, the boot recipe above runs. Every run
 * writes a `junit.xml` report next to this file.
 */
/**
 * The values a bare `pnpm e2e` runs on. Each one is a SECOND copy of a default
 * boot.sh already carries: the webServer hands the recipe an env block, so the
 * two sides of that process boundary each spell the same port, key and user out.
 * A copy that drifts points the suites at a port nothing serves, or pastes a key
 * the skeleton never seeded. `spa-build-flag.spec.ts` reads boot.sh and holds
 * these equal to its `${VAR:-default}` expansions.
 */
export const BOOT_DEFAULTS = {
  STUDIO_PORT: '8765',
  /** The seeded, obviously test-only API key the suites paste at /login. */
  STUDIO_API_KEY: 'sk-e2e-DO-NOT-USE-IN-PRODUCTION-000',
  /** The `user_id` that key resolves to. */
  STUDIO_USER_ID: 'studio-e2e',
} as const;

const STUDIO_PORT = Number(process.env.STUDIO_PORT ?? BOOT_DEFAULTS.STUDIO_PORT);

/**
 * The origin the suites drive: the running stack named by `TAI_E2E_TARGET`, else the
 * loopback skeleton this run boots on {@link STUDIO_PORT}. The suites that build a
 * request context of their own import this so every path resolves the same target.
 */
export const BASE_URL = TARGET?.url ?? `http://127.0.0.1:${String(STUDIO_PORT)}`;

/**
 * The login key the suites paste at `/login`: on a target it is the target's own key,
 * else the seeded test-only key (env-overridable, defaulting to boot.sh's). Resolved in
 * this ONE place so `tests/helpers.ts` and every spec read the same value.
 */
export const STUDIO_API_KEY =
  TARGET?.key ?? process.env.STUDIO_API_KEY ?? BOOT_DEFAULTS.STUDIO_API_KEY;

export const STUDIO_USER_ID = process.env.STUDIO_USER_ID ?? BOOT_DEFAULTS.STUDIO_USER_ID;

/**
 * The `SKIP_SPA_BUILD` value boot.sh receives. A bare `pnpm e2e` builds the SPA
 * from the working tree, so the suites always test the code they are run against
 * — a stale `apps/studio/dist` cannot be served under a green exit code. Reusing
 * a prebuilt dist for a fast inner loop is an explicit `SKIP_SPA_BUILD=1`
 * opt-in, and CI ignores that opt-in outright.
 */
export function spaBuildFlag(env: NodeJS.ProcessEnv): string {
  if (env.CI) return '0';
  return env.SKIP_SPA_BUILD === '1' ? '1' : '0';
}

/**
 * Whether Playwright adopts a skeleton already listening on {@link STUDIO_PORT}
 * instead of running boot.sh. Adopting one skips the boot recipe entirely — no
 * SPA build, no reseeded key, no route mappings — so the suites would judge
 * whatever process happens to hold the port, which the exit code cannot tell
 * from a run of the working tree. It is therefore OFF unless the caller asks for
 * it by name, and CI ignores the ask; a port already in use then fails loudly
 * rather than quietly deciding what was tested.
 */
export function reuseServer(env: NodeJS.ProcessEnv): boolean {
  if (env.CI) return false;
  return env.E2E_REUSE_SERVER === '1';
}

// A spec that declares no needs is built-stack only: a run against a target leaves it out.
const undeclared = TARGET
  ? undeclaredSpecs(fileURLToPath(new URL('./tests/', import.meta.url)))
  : [];

export default defineConfig({
  testDir: './tests',
  testIgnore: undeclared,
  // Serial: the suites share one live skeleton + one Redis; the key-expiry and
  // integrity cases mutate shared server state, so parallel workers would race.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }], ['junit', { outputFile: 'junit.xml' }]]
    : [['list'], ['junit', { outputFile: 'junit.xml' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // On a target the global setup reads which kinds it has on, so each spec's declared
  // needs are matched against it; a self-booted run needs no such probe.
  globalSetup: TARGET ? './global-setup.ts' : undefined,
  // A `TAI_E2E_TARGET` run drives an already-running stack, so no server is booted.
  webServer: TARGET
    ? undefined
    : {
        command: 'bash boot/boot.sh',
        url: BASE_URL,
        reuseExistingServer: reuseServer(process.env),
        // The recipe pulls docker images, installs the plugin, and builds the SPA on
        // a cold run, so give it room.
        timeout: 300_000,
        stdout: 'pipe',
        stderr: 'pipe',
        env: {
          STUDIO_API_KEY,
          STUDIO_USER_ID,
          STUDIO_PORT: String(STUDIO_PORT),
          SKIP_SPA_BUILD: spaBuildFlag(process.env),
        },
      },
});
