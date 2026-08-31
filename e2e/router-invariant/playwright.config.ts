import { defineConfig, devices } from '@playwright/test';

/**
 * A SELF-CONTAINED Playwright project, deliberately separate from the live e2e
 * harness (e2e/playwright.config.ts): it serves the tiny router fixture with a bare
 * `vite` dev server — NO skeleton backend, NO Docker, NO import map — because the
 * invariant it pins is a property of `@tanstack/react-router` alone. That keeps it a
 * cheap, fast tripwire that runs on every PR without the platform boot.
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'entry-state-persistence.spec.ts',
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://127.0.0.1:5233', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Invoke the vite bin directly (the e2e package's own dependency) rather than
    // through `pnpm exec`: on CI runners the pnpm-exec indirection from this
    // non-package subfolder died silently before vite ever started. Piping the
    // server's output keeps any future startup failure visible in the CI log
    // instead of surfacing only as an opaque webServer timeout.
    command: 'node ../node_modules/vite/bin/vite.js --config vite.config.ts',
    cwd: import.meta.dirname,
    url: 'http://127.0.0.1:5233',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
