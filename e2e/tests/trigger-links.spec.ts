/**
 * Trigger links on the hooks page, against the LIVE boot skeleton (redis hooks
 * backend, set by boot.sh's HOOKS_REDIS_URL — without it the CRUD 501s).
 *
 * Leg 1 mints a PERMANENT link WITH per-link params (the tool-params JSON editor driven
 * through the real form), asserts the QR renders and the copy field carries a
 * `/trigger/` URL, then revokes it and asserts the row is gone. Leg 2 mints a TIMED
 * link (a preset duration) and asserts its expiry renders in the row (the picker's
 * real-UI path, not a unit mock). Leg 3 mints a link on the token + api-key door and
 * asserts the row states both the bound execution key and that combined door.
 */
import { test, expect, type Page } from '@playwright/test';
import { EXECUTION_KEY_ID, loginViaUi, pickExecutionKey } from './helpers';

/** Open the create dialog, fill the form, submit, and stop on the QR step. */
async function createLink(
  page: Page,
  {
    topic,
    name,
    expiry,
    params,
    requireApiKey = false,
  }: {
    topic: string;
    name: string;
    expiry: string;
    params?: string;
    requireApiKey?: boolean;
  },
): Promise<void> {
  await page.getByRole('button', { name: 'Create trigger link' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Topic').fill(topic);
  await dialog.getByLabel('Name').fill(name);
  await pickExecutionKey(page, dialog);
  if (requireApiKey) {
    await dialog.getByRole('checkbox', { name: 'Also require an api key' }).click();
  }
  await dialog.getByRole('radio', { name: expiry }).click();
  if (params !== undefined) await dialog.getByLabel('Tool params (JSON)').fill(params);
  await dialog.getByRole('button', { name: 'Create link' }).click();
  // The QR step confirms the mint succeeded before we close it.
  await expect(dialog.getByTestId('trigger-link-qr')).toBeVisible();
}

test('mint a permanent trigger link with params, see the QR, then revoke it', async ({ page }) => {
  await loginViaUi(page); // persists the credential to sessionStorage
  await page.goto('/hooks');

  await expect(page.getByRole('heading', { name: 'Trigger links' })).toBeVisible();

  const name = `e2e-perma-${Date.now().toString(36)}`;
  await createLink(page, {
    topic: 'e2e.trigger.permanent',
    name,
    expiry: 'Permanent',
    params: '{"priority":"high"}',
  });

  // The QR renders and the copy field carries the composed `/trigger/` URL.
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByTestId('copy-field')).toContainText('/trigger/');
  await dialog.getByRole('button', { name: 'Done' }).click();

  // The new row appears (with its params badge, bound key and door), then revokes away.
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Permanent');
  await expect(row).toContainText('params');
  await expect(row).toContainText(EXECUTION_KEY_ID);
  // 'QR token' is a substring of the combo badge — the negative pin is the real assertion.
  await expect(row).toContainText('QR token');
  await expect(row).not.toContainText('QR token + api key');

  await page.getByRole('button', { name: `Revoke trigger link ${name}` }).click();
  const revokeDialog = page.getByRole('dialog');
  await revokeDialog.getByRole('button', { name: 'Revoke link' }).click();

  await expect(page.getByRole('row', { name: new RegExp(name) })).toHaveCount(0);
});

test('mint a timed trigger link and see its expiry render in the row', async ({ page }) => {
  await loginViaUi(page);
  await page.goto('/hooks');
  await expect(page.getByRole('heading', { name: 'Trigger links' })).toBeVisible();

  const name = `e2e-timed-${Date.now().toString(36)}`;
  await createLink(page, { topic: 'e2e.trigger.timed', name, expiry: '7 days' });

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Done' }).click();

  // The row renders a real (non-"Permanent") expiry from the picker's timed choice.
  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText('Permanent');
});

test('mint a link on the token + api-key door and see the combined door in the row', async ({
  page,
}) => {
  await loginViaUi(page);
  await page.goto('/hooks');
  await expect(page.getByRole('heading', { name: 'Trigger links' })).toBeVisible();

  const name = `e2e-keyed-${Date.now().toString(36)}`;
  await createLink(page, {
    topic: 'e2e.trigger.keyed',
    name,
    expiry: 'Permanent',
    requireApiKey: true,
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Done' }).click();

  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('QR token + api key');
  await expect(row).toContainText(EXECUTION_KEY_ID);
});
