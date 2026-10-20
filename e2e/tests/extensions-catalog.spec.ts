/**
 * The extension catalog against the LIVE boot skeleton. The boot manifest's
 * `extensions_modules` registers `ask_external`, a transformer, so the Extensions
 * screen lists it by its whole registered name inside the card headed by its kind.
 */
import { expect } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';

needs('setting:extensions-modules');

test('the catalog lists a registered extension under its kind heading', async ({ page }) => {
  await seedCredential(page);
  await page.goto('/extensions', { waitUntil: 'domcontentloaded' });

  const transformerHeading = page.getByRole('heading', { level: 3, name: /^transformer/ });
  await expect(transformerHeading).toBeVisible();

  const transformerCard = page.locator('.tai-card', { has: transformerHeading });
  await expect(transformerCard.getByRole('listitem')).toContainText(['ask_external']);
});
