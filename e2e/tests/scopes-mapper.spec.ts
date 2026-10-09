/**
 * The access-control mapper against the LIVE boot skeleton: a route its registration
 * declares public (the trigger-link door `/trigger/{token}`) is served to everyone whatever
 * scope it is given, so the mapper never offers it as an Unassigned chip to drag onto a
 * scope. It is listed under "Public by declaration" as static text, and the server refuses a
 * scope mapping for it.
 */
import { expect } from '@playwright/test';

import { needs, test } from '../needs';
import { API_KEY, seedCredential } from './helpers';

needs();

test('a declared-public route is listed as public, never offered for a scope', async ({
  page,
  request,
}) => {
  await seedCredential(page);
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'API keys' }).click();

  const declared = page.getByRole('group', { name: /^Routes public by declaration, \d+ items?$/ });
  await expect(declared.getByText('/trigger/{token}', { exact: true })).toBeVisible();
  // Static text: no drag handle, no remove control.
  await expect(declared.getByRole('button')).toHaveCount(0);
  await expect(
    page.locator('[data-zone="zone-unassigned"]').getByText('/trigger/{token}', { exact: true }),
  ).toHaveCount(0);

  const refused = await request.post('/api/auth/scopes', {
    headers: { Authorization: `Bearer ${API_KEY}` },
    data: { scope_id: 'studio', url: '/trigger/{token}' },
  });
  expect(refused.status()).toBe(400);
});
