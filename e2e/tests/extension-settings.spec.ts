/**
 * An extension's declared settings on a tool's extension sets, against the LIVE boot
 * skeleton. The reference plugin registers `studio_demo_label`, a wrapper declaring one
 * required `label` setting; drafting it in the builder shows its settings form, Add
 * stays off until the setting is filled, and the saved set reaches the server as a
 * `{ name, config }` element. The test removes the set again at the end.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { API_KEY, seedCredential } from './helpers';

needs('mutable', 'setting:extension-settings-fixture');

const TOOL = 'studio_demo_echo';
const EXTENSION = 'studio_demo_label';
const LABEL = 'e2e-settings-label';

async function storedCombos(page: Page): Promise<unknown[][]> {
  const response = await page.request.get(`/api/tools/${TOOL}/extensions`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { data: { combos: unknown[][] } };
  return body.data.combos;
}

test('a drafted extension with settings is authored through its form and saved', async ({
  page,
}) => {
  await seedCredential(page);
  await page.goto(`/tools?tool=${TOOL}`, { waitUntil: 'domcontentloaded' });

  const card = page.getByRole('region', { name: 'Extension sets' });
  await card.getByRole('button', { name: 'Edit extension sets' }).click();
  const dialog = page.getByRole('dialog', { name: `Edit extension sets — ${TOOL}` });

  await dialog.getByRole('checkbox', { name: EXTENSION }).check();
  const settings = dialog.getByRole('group', { name: `${EXTENSION} settings` });
  const label = settings.getByRole('textbox', { name: /^Label/ });
  await expect(label).toBeVisible();
  const add = dialog.getByRole('button', { name: 'Add extension set' });
  await expect(add).toBeDisabled();

  await label.fill(LABEL);
  await expect(add).toBeEnabled();
  await add.click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Extensions applied.' })).toBeVisible();

  expect(await storedCombos(page)).toContainEqual([{ name: EXTENSION, config: { label: LABEL } }]);

  await card.getByRole('button', { name: 'Edit extension sets' }).click();
  await dialog.getByRole('button', { name: `Remove extension set ${EXTENSION}` }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(async () => storedCombos(page))
    .not.toContainEqual([{ name: EXTENSION, config: { label: LABEL } }]);
});
