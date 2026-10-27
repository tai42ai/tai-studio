/**
 * The Manifest screen's Extensions section against the LIVE boot skeleton. The boot
 * manifest loads `ask_external` and the reference plugin's `studio_demo_label` wrapper
 * through `extensions_modules`, names the RQ backend in
 * `backend_module`, and maps `schedule_task` onto `studio_demo_echo` and `studio_demo_form`
 * in the `reference-plugin-tools` entry; the section lists the loaded extension under its
 * kind and shows those settings in its "In the manifest" part, one map row per tool.
 */
import { expect } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';

needs(
  'kind:backend:rq',
  'kind:studio_plugins:reference_plugin',
  'setting:extensions-modules',
  'setting:extension-settings-fixture',
  'setting:schedule-task-extension',
);

test('the Extensions section lists the loaded extensions and the manifest settings', async ({
  page,
}) => {
  await seedCredential(page);
  await page.goto('/manifest', { waitUntil: 'domcontentloaded' });

  const section = page.getByRole('region', { name: 'Extensions' });
  await expect(section.getByRole('heading', { level: 3, name: 'Loaded extensions' })).toBeVisible();
  const transformer = section.getByRole('region', { name: 'Kind: transformer' });
  await expect(
    transformer.getByRole('listitem').filter({ hasText: /^ask_external$/ }),
  ).toBeVisible();
  const wrapper = section.getByRole('region', { name: 'Kind: wrapper' });
  await expect(
    wrapper.getByRole('listitem').filter({ hasText: /^studio_demo_label$/ }),
  ).toBeVisible();

  await expect(section.getByRole('heading', { level: 3, name: 'In the manifest' })).toBeVisible();
  await expect(
    section.getByText('tai42_skeleton.extensions.builtin.ask_external', { exact: true }),
  ).toBeVisible();
  await expect(section.getByText('tai42_backend_rq', { exact: true })).toBeVisible();

  const maps = section.getByRole('table', { name: 'Extension maps declared in the manifest' });
  const entryRows = maps.getByRole('row').filter({ hasText: 'tools › reference-plugin-tools' });
  await expect(entryRows).toHaveCount(2);
  for (const tool of ['studio_demo_echo', 'studio_demo_form']) {
    const row = entryRows.filter({ has: page.getByRole('cell', { name: tool, exact: true }) });
    await expect(row.getByRole('cell').nth(1)).toHaveText(tool);
    await expect(row.getByRole('cell').nth(2)).toContainText('schedule_task');
  }
});
