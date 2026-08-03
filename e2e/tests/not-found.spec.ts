/**
 * The custom in-shell 404 (PLAN_7), against the LIVE boot skeleton. An unknown path
 * is served the SPA (history fallback → 200, never a server 404) and renders the
 * app-styled "page not found" with a link home — never TanStack's bare built-in text
 * with no chrome and no way back.
 */
import { test, expect } from '@playwright/test';
import { seedCredential } from './helpers';

test('an unknown route renders the app 404 with a working way home', async ({ page }) => {
  await seedCredential(page);

  // The SPA history fallback returns index.html (200), not a server 404.
  const response = await page.goto('/no-such-page-xyz');
  expect(response?.status()).toBe(200);

  await expect(page.getByText('Page not found')).toBeVisible();
  const home = page.getByRole('link', { name: 'Go home' });
  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute('href', '/');

  // The link home actually returns to the app (the capability landing → observability).
  await home.click();
  await page.waitForURL('**/observability');
  await expect(page.getByTestId('observability-page')).toBeVisible();
});
