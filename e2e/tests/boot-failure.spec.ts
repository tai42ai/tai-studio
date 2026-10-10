/**
 * A studio page whose app cannot load: one vendor module the app imports through
 * the import map fails to arrive. The page recovers the way the shell recovers
 * from any failed import — ONE automatic reload — and when the module fails again
 * it shows the boot error state ("Something went wrong", what could not load, a
 * focused Reload button) instead of a blank page. Reloading once the module is
 * reachable again boots the studio. When the browser refuses sessionStorage the
 * reload guard cannot remember a reload, so it takes none and the error state shows
 * on the first load.
 *
 * The frames of the error state in both themes land in `BOOT_SHOTS_OUT` (default:
 * the gitignored `test-results/`), so a reviewer can point it at any directory for
 * out-of-tree evidence without the shots ever being committed.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect } from '@playwright/test';

import { needs, test } from '../needs';

needs();

/** The vendor module the failure is put on: the SDK host entry every app load imports. */
const FAILING_MODULE = '**/vendor/studio-sdk-host.js';

/** The login card master viewport, matched to the other login/docs frames. */
const VIEWPORT = { width: 1440, height: 900 } as const;

const OUT_DIR =
  process.env.BOOT_SHOTS_OUT ??
  fileURLToPath(new URL('../test-results/boot-failure-shots', import.meta.url));

const THEMES = ['light', 'dark'] as const;

test.use({ viewport: VIEWPORT });

test('a vendor module that fails to load gives one reload, then the boot error state, then recovery on Reload', async ({
  page,
}) => {
  const recoveryWarnings: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().startsWith('[stale-chunk-reload]')) {
      recoveryWarnings.push(message.text());
    }
  });
  // The route stays in place across the automatic reload, so the module fails on both loads.
  await page.route(FAILING_MODULE, (route) => route.abort('failed'));

  await page.goto('/login');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Something went wrong');
  await expect(alert).toContainText('TAI42 Studio could not load:');
  await expect(alert).toContainText('Reload to try again.');
  const reload = alert.getByRole('button', { name: 'Reload' });
  await expect(reload).toBeFocused();
  // Exactly one automatic reload was taken before the error state was shown.
  expect(recoveryWarnings).toHaveLength(1);

  // Before the app mounts nothing pins a theme: the token sheet follows the OS preference.
  await mkdir(OUT_DIR, { recursive: true });
  const grounds: string[] = [];
  for (const theme of THEMES) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator('html')).not.toHaveAttribute('data-theme');
    grounds.push(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT_DIR}/boot-failure-${theme}.png` });
  }
  expect(grounds[0]).not.toBe(grounds[1]);

  await page.unroute(FAILING_MODULE);
  await reload.click();
  await expect(page.getByLabel('API key')).toBeVisible();
});

test('with sessionStorage refused the failed boot shows the error state at once, never a reload loop', async ({
  page,
}) => {
  let loads = 0;
  page.on('load', () => {
    loads += 1;
  });
  // A browser that refuses storage for the site (cookies blocked): sessionStorage access throws.
  // The reload guard then cannot remember a reload, so it takes none.
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new DOMException('Access is denied for this document.', 'SecurityError');
      },
    });
  });
  await page.route(FAILING_MODULE, (route) => route.abort('failed'));

  await page.goto('/login');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Something went wrong');
  await expect(alert).toContainText('TAI42 Studio could not load:');
  await expect(alert.getByRole('button', { name: 'Reload' })).toBeFocused();
  // The page stays put: a reload would have replaced the alert and fired another load.
  await page.waitForTimeout(2_000);
  await expect(alert).toBeVisible();
  expect(loads).toBe(1);
});
