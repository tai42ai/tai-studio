/**
 * The create-key dialog against the live skeleton: a key with no scope and no
 * condition is refused in the dialog before any request leaves the page, and the
 * "Full access (all scopes)" choice mints a key whose stored scopes are exactly
 * `["*"]`, with its warning shown while it is chosen. Any key the page mints is
 * revoked at the end, even when an assertion fails, so the key list is left as it was found.
 */
import { expect } from '@playwright/test';

import { needs, test } from '../needs';
import { API_KEY, seedCredential } from './helpers';

needs('mutable');

test('the create dialog refuses an empty-scope key and mints a Full access key', async ({
  page,
  request,
}) => {
  const userId = `e2e-full-${String(Date.now())}`;
  const auth = { Authorization: `Bearer ${API_KEY}` };
  // Every mint request the page sends; any of them may have created the key.
  const mints: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname === '/api/auth/api-keys') {
      mints.push(req.url());
    }
  });

  try {
    await seedCredential(page);
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'API keys' }).click();
    await page.getByRole('button', { name: 'Create key' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create API key' });

    await dialog.getByRole('textbox', { name: 'Key user ID' }).fill(userId);
    await dialog.getByRole('textbox', { name: 'Description' }).fill('Full access e2e key');

    // No scope and no condition: refused in the dialog, and no mint request is sent.
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      'Choose at least one scope or Full access, or set a condition under Policy.',
    );
    expect(mints).toHaveLength(0);

    // Full access hides the individual scopes and states what the key holds.
    const scopes = dialog.getByRole('group', { name: 'Scopes' });
    await scopes.getByRole('checkbox', { name: 'Full access (all scopes)' }).click();
    await expect(scopes.getByText(/This key has every scope/)).toBeVisible();
    await expect(scopes.getByRole('checkbox', { name: 'studio', exact: true })).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Create claim link (QR)' })).toBeVisible();
    expect(mints).toHaveLength(1);

    const listed = await request.get('/api/auth/tokens-payload', { headers: auth });
    expect(listed.ok()).toBe(true);
    const body = (await listed.json()) as { data: { user_id: string; scopes: string[] }[] };
    expect(body.data.find((k) => k.user_id === userId)?.scopes).toEqual(['*']);
  } finally {
    // Once a mint request left the page the key may exist, whichever assertion above
    // failed: revoke it, where a 404 means the mint never created it.
    if (mints.length > 0) {
      const revoked = await request.delete(`/api/auth/api-keys/${encodeURIComponent(userId)}`, {
        headers: auth,
      });
      expect(revoked.ok() || revoked.status() === 404).toBe(true);
    }
  }
});
