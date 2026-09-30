import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { TARGET, undeclaredSpecs } from '../target';

/**
 * A SELF-CONTAINED Playwright project, deliberately separate from the live e2e
 * harness (e2e/playwright.config.ts): it serves the tiny router fixture with a bare
 * `vite` dev server — NO skeleton backend, NO Docker, NO import map — because the
 * invariant it pins is a property of `@tanstack/react-router` alone. That keeps it a
 * cheap, fast tripwire that runs on every PR without the platform boot.
 *
 * `TAI_E2E_TARGET`, when set, points `baseURL` at that stack and no vite server is
 * booted; unset, the bare `vite` server below runs. Every run writes a `junit.xml`
 * report next to this file. The one spec here drives the suite's own vite fixture page,
 * a need only a stack this run builds can meet — so on any target it is skipped, with
 * the fixture-page reason in the report, and nothing is started.
 */
const baseURL = TARGET?.url ?? 'http://127.0.0.1:5233';

// The spec declares `needs('fixture-page')`, so it is not among the undeclared; this
// wiring mirrors the main config, and drops any spec that forgot to declare on a target.
const undeclared = TARGET ? undeclaredSpecs(fileURLToPath(new URL('./', import.meta.url))) : [];

export default defineConfig({
  testDir: '.',
  testMatch: 'entry-state-persistence.spec.ts',
  testIgnore: undeclared,
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [['github'], ['list'], ['junit', { outputFile: 'junit.xml' }]]
    : [['list'], ['junit', { outputFile: 'junit.xml' }]],
  use: { baseURL, trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: TARGET
    ? undefined
    : {
        // Invoke the vite bin directly (the e2e package's own dependency) rather than
        // through `pnpm exec`: on CI runners the pnpm-exec indirection from this
        // non-package subfolder died silently before vite ever started. Piping the
        // server's output keeps any future startup failure visible in the CI log
        // instead of surfacing only as an opaque webServer timeout.
        command: 'node ../node_modules/vite/bin/vite.js --config vite.config.ts',
        cwd: import.meta.dirname,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
