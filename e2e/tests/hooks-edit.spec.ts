/**
 * Hooks edit/overwrite (PLAN_6), against the LIVE boot skeleton with the hooks list
 * stubbed via `page.route` so the row + register form see a known existing hook.
 *
 * Legs: the per-row Edit door opens the register form PREFILLED from that hook;
 * typing an already-registered name into the create form warns BEFORE the overwrite
 * (a register POST is a silent upsert, so the replace must be announced first).
 */
import { test, expect, type Page } from '@playwright/test';
import { seedCredential } from './helpers';

const HOOK = {
  name: 'notify-orders',
  topic: 'orders.created',
  tool: 'slack.post',
  execution_key: 'studio-e2e',
  tool_kwargs: {},
  condition: null,
  condition_id: null,
  condition_kwargs: {},
  expr: null,
  expr_id: null,
  expr_kwargs: {},
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
  await expect(dialog.getByLabel('Tool', { exact: true })).toHaveValue(HOOK.tool);
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
