/**
 * A tool parameter whose type is a union of untitled members, on the tool run panel
 * against the LIVE boot skeleton: the reference plugin's `studio_demo_union` takes a value
 * that is text, a whole number or a list of text. The auto-form offers the union's
 * variants by their shapes, and the variant chosen is the shape the run sends.
 */
import { expect } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';

needs('kind:studio_plugins:reference_plugin');

test('an untitled union offers its variants by their shapes, and runs the shape chosen', async ({
  page,
}) => {
  await seedCredential(page);
  await page.goto('/tools?tool=studio_demo_union');

  const field = page.getByRole('group', { name: 'value' });
  await field.getByRole('combobox', { name: 'Variant' }).click();
  await expect(page.getByRole('option')).toHaveText(['Text', 'Whole number', 'List of text']);
  await page.getByRole('option', { name: 'Whole number', exact: true }).click();
  await field.getByRole('spinbutton', { name: 'Whole number' }).fill('42');

  const run = page.waitForRequest(
    (request) => request.url().includes('/api/run-tool') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  expect((await run).postDataJSON()).toMatchObject({
    tool_name: 'studio_demo_union',
    arguments: { value: 42 },
  });
  await expect(page.getByRole('heading', { name: 'Result' })).toBeVisible({ timeout: 15_000 });
});
