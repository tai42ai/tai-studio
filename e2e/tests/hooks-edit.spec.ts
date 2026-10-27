/**
 * Hooks edit/overwrite, against the LIVE boot skeleton with the hooks list
 * stubbed via `page.route` so the row + register form see a known existing hook.
 *
 * Legs: the per-row Edit door opens the register form PREFILLED from that hook;
 * typing an already-registered name into the create form warns BEFORE the overwrite
 * (a register POST is a silent upsert, so the replace must be announced first). With
 * access control off the Edit door sends the stored key unchanged; a key session reads a
 * stored key that is neither listed nor its own identity flagged, and its refusal shown.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import {
  bodyOf,
  gateOffSession,
  nextRequest,
  scopedKeySession,
  serveWrite,
  stubKeyList,
  stubSession,
} from './session-stubs';

needs();

const HOOK = {
  name: 'notify-events',
  topic: 'events.created',
  tool: 'slack.post',
  execution_key: 'studio-e2e',
  execution_key_fingerprint: 'e2e00000000000000000000000000000',
  tool_kwargs: {},
  condition: null,
  start_expr: null,
  cancel_expr: null,
  resume_expr: null,
  extras_expr: null,
};

async function stubHooks(page: Page): Promise<void> {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === '/api/hooks',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        json: { data: { items: [HOOK], total: 1, topic_verifiers: {}, trigger_auth: {} } },
      });
    },
  );
}

test('the Edit door opens the register form prefilled from the hook', async ({ page }) => {
  await stubHooks(page);
  await page.goto('/hooks');

  await page.getByRole('button', { name: `Edit hook ${HOOK.name}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit hook' });
  await expect(dialog).toBeVisible();
  // The form starts from the hook's own values, not blank.
  await expect(dialog.getByLabel('Name')).toHaveValue(HOOK.name);
  await expect(dialog.getByLabel('Topic')).toHaveValue(HOOK.topic);
  await expect(dialog.getByRole('combobox', { name: 'Tool' })).toContainText(HOOK.tool);
});

test('typing an existing name into the create form warns before the overwrite', async ({
  page,
}) => {
  await stubHooks(page);
  await page.goto('/hooks');

  const form = page.getByRole('form', { name: 'Register hook' });
  const name = form.getByLabel('Name');

  // A fresh, non-colliding name draws no warning.
  await name.fill('brand-new-hook');
  await expect(form.getByText(/Replaces the existing hook/i)).toHaveCount(0);

  // The existing name is a silent upsert on register, so the replace is announced.
  await name.fill(HOOK.name);
  const warning = form.getByText(/Replaces the existing hook/i);
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(HOOK.name);
});

const isHooks = (pathname: string): boolean => pathname === '/api/hooks';

test('with access control off the Edit door shows no key field and sends the stored key', async ({
  page,
}) => {
  await stubHooks(page);
  await stubSession(page, gateOffSession);
  await serveWrite(page, 'POST', isHooks, { data: { name: HOOK.name, registered: true } });
  await page.goto('/hooks');

  await page.getByRole('button', { name: `Edit hook ${HOOK.name}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit hook' });
  await expect(dialog.getByLabel('Name')).toHaveValue(HOOK.name);
  await expect(dialog.getByText('Execution key', { exact: true })).toHaveCount(0);
  const write = nextRequest(page, 'POST', isHooks);
  await dialog.getByRole('button', { name: 'Save changes' }).click();

  expect(bodyOf(await write).execution_key).toBe(HOOK.execution_key);
});

test("a stored key that is neither listed nor the session's identity is flagged, and its refusal shown", async ({
  page,
}) => {
  const refusal = 'you may only bind your own identity or an execution key you own';
  await stubHooks(page);
  await stubSession(
    page,
    scopedKeySession('alice', [
      { path: '/api/hooks', methods: ['GET', 'POST'] },
      { path: '/api/auth/tokens-payload', methods: ['GET'] },
    ]),
  );
  await stubKeyList(page, { keys: [] });
  await serveWrite(page, 'POST', isHooks, { status: 403, error: refusal });
  await page.goto('/hooks');

  await page.getByRole('button', { name: `Edit hook ${HOOK.name}` }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit hook' });
  const key = HOOK.execution_key;
  await expect(dialog.getByRole('combobox', { name: 'Execution key' })).toHaveText(
    `${key} (not a listed key)`,
  );
  await expect(
    dialog.getByText(
      `${key} is not a listed key. The server accepts an unlisted key only when it is your own identity; any other value is refused on save.`,
    ),
  ).toBeVisible();
  await expect(
    dialog.getByText(
      `${key} is not this session's identity (alice), so the server will refuse it on save.`,
    ),
  ).toBeVisible();
  const save = dialog.getByRole('button', { name: 'Save changes' });
  await expect(save).toBeEnabled();
  await save.click();

  await expect(dialog.getByText(refusal)).toBeVisible();
});
