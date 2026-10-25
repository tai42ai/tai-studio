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
 *
 * The session cases serve `GET /api/auth/me`, the api-key list and the create write
 * through `page.route`, and read which execution key each session can bind and send.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { EXECUTION_KEY_ID, loginViaUi, pickExecutionKey, seedCredential } from './helpers';
import {
  ACCOUNT_EMPTY_NOTE,
  accountSession,
  bodyOf,
  gateOffSession,
  KEY_LIST_FORBIDDEN_NOTE,
  keySession,
  nextRequest,
  serveWrite,
  stubKeyList,
  stubSession,
} from './session-stubs';

needs('kind:identity', 'mutable', 'setting:hooks');

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

/** Open the create dialog and fill its topic, name and expiry, leaving the key to the case. */
async function openLinkFields(page: Page, name: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Create trigger link' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Topic').fill('e2e.trigger.session');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('radio', { name: 'Permanent' }).click();
  return dialog;
}

const isLinks = (pathname: string): boolean => pathname === '/api/hooks/trigger-links';

/** The create door's answer for a link named `name`. */
function minted(name: string): { readonly data: unknown } {
  return {
    data: {
      name,
      topic: 'e2e.trigger.session',
      token: 'e2e-token',
      trigger_path: '/trigger/e2e-token',
      expires_at: null,
    },
  };
}

test.describe('the execution key a session can bind', () => {
  test('a key session over an empty key list binds its own identity', async ({ page }) => {
    await seedCredential(page);
    await stubSession(page, keySession);
    await stubKeyList(page, { keys: [] });
    const name = `e2e-own-${Date.now().toString(36)}`;
    await serveWrite(page, 'POST', isLinks, minted(name));
    await page.goto('/hooks');

    const dialog = await openLinkFields(page, name);
    await pickExecutionKey(page, dialog);
    const write = nextRequest(page, 'POST', isLinks);
    await dialog.getByRole('button', { name: 'Create link' }).click();

    expect(bodyOf(await write).execution_key).toBe(EXECUTION_KEY_ID);
  });

  test('an account session over an empty key list reads the note and cannot create', async ({
    page,
  }) => {
    await seedCredential(page);
    await stubSession(page, accountSession);
    await stubKeyList(page, { keys: [] });
    await page.goto('/hooks');

    const dialog = await openLinkFields(page, `e2e-account-${Date.now().toString(36)}`);
    await expect(dialog.getByText(ACCOUNT_EMPTY_NOTE, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Execution key' })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Create link' })).toBeDisabled();
  });

  test('with access control off the dialog shows no key field and sends the fill identity', async ({
    page,
  }) => {
    await seedCredential(page);
    await stubSession(page, gateOffSession);
    const name = `e2e-gate-off-${Date.now().toString(36)}`;
    await serveWrite(page, 'POST', isLinks, minted(name));
    await page.goto('/hooks');

    const dialog = await openLinkFields(page, name);
    await expect(dialog.getByText('Execution key', { exact: true })).toHaveCount(0);
    const create = dialog.getByRole('button', { name: 'Create link' });
    await expect(create).toBeEnabled();
    const write = nextRequest(page, 'POST', isLinks);
    await create.click();

    expect(bodyOf(await write).execution_key).toBe('__no_auth__');
  });

  test("a refused key list reads the note, offers no retry, and binds the session's identity", async ({
    page,
  }) => {
    await seedCredential(page);
    await stubSession(page, keySession);
    await stubKeyList(page, { status: 403, error: 'Forbidden' });
    const name = `e2e-no-grant-${Date.now().toString(36)}`;
    await serveWrite(page, 'POST', isLinks, minted(name));
    await page.goto('/hooks');

    const dialog = await openLinkFields(page, name);
    await expect(dialog.getByText(KEY_LIST_FORBIDDEN_NOTE, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await pickExecutionKey(page, dialog);
    const write = nextRequest(page, 'POST', isLinks);
    await dialog.getByRole('button', { name: 'Create link' }).click();

    expect(bodyOf(await write).execution_key).toBe(EXECUTION_KEY_ID);
  });
});
