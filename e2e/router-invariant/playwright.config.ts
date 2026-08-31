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
    command: 'pnpm exec vite --config vite.config.ts',
    cwd: import.meta.dirname,
    url: 'http://127.0.0.1:5233',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
