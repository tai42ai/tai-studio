/**
 * Version-gate direction. The Studio-plugin API gate accepts ONLY
 * `targeted == current`: additive changes never bump, and after a break every
 * plugin must rebuild. This pins EQUALITY in both directions against the live boot
 * — a `<=` implementation would ship old plugins against a broken SDK (a
 * higher-version fixture would wrongly pass), and a `>=` bug would reject valid
 * plugins.
 */
import { test, expect } from '@playwright/test';
import { seedCredential, expectPluginErrorCard } from './helpers';

const REGISTRY_PATH = '/api/plugins';

/** Rewrite every manifest's api_version in the registry response to `version`. */
async function withRegistryApiVersion(
  page: import('@playwright/test').Page,
  version: number,
): Promise<void> {
  await page.route(
    (url) => url.pathname === REGISTRY_PATH,
    async (route) => {
      const response = await route.fetch();
      const json = (await response.json()) as { data: { api_version: number }[] };
      for (const manifest of json.data) manifest.api_version = version;
      await route.fulfill({ json });
    },
  );
}

test('a LOWER targeted version is rejected (not silently accepted)', async ({ page }) => {
  await seedCredential(page);
  await withRegistryApiVersion(page, 0);
  await page.goto('/plugins/reference_plugin/demo');
  await expectPluginErrorCard(page, /failed to load|version|rebuilt/i);
  await expect(page.getByTestId('reference-demo-page')).toHaveCount(0);
});

test('a HIGHER targeted version is rejected (equality, not `>=`)', async ({ page }) => {
  await seedCredential(page);
  await withRegistryApiVersion(page, 999);
  await page.goto('/plugins/reference_plugin/demo');
  await expectPluginErrorCard(page, /failed to load|version|rebuilt/i);
  await expect(page.getByTestId('reference-demo-page')).toHaveCount(0);
});

test('the EQUAL (real) version loads successfully', async ({ page }) => {
  await seedCredential(page);
  // No interception: the real manifest targets the current host version.
  await page.goto('/plugins/reference_plugin/demo');
  await expect(page.getByTestId('reference-demo-page')).toBeVisible();
});
