/**
 * The Backup tab's export of a document that names a failed section, against the LIVE
 * boot skeleton.
 *
 * The export door answers `200` with the backup document even when a section's
 * exporter failed: that section is absent from `sections` and named, with its message,
 * in the document's `errors` map. The tab still downloads the file, then warns under
 * the export controls, naming each failed section with its message. The section list
 * is the live one; the export answer is a fixed document here, since a live storage
 * backend fails no read on demand.
 */
import { readFile } from 'node:fs/promises';

import { expect } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';

needs();

const STORAGE_FAILURE = 'storage read failed: connection refused';

/** The export answer: one section exported, the `storage` section failed. */
const EXPORT_DOCUMENT = {
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  sections: { env: { TAI_BUS_HEARTBEAT_TTL: '20' } },
  errors: { storage: STORAGE_FAILURE },
};

test('an export with a failed section downloads the file and names the section with its message', async ({
  page,
}) => {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === '/api/backup/export',
    (route) => route.fulfill({ json: EXPORT_DOCUMENT }),
  );
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Backup' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup' }).click();

  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^tai-backup-.+\.json$/);
  const downloaded = JSON.parse(await readFile(await file.path(), 'utf8')) as unknown;
  expect(downloaded).toEqual(EXPORT_DOCUMENT);

  const warning = page.getByTestId('export-section-errors');
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('Backup downloaded, but 1 section failed to export');
  await expect(warning).toContainText('This section is not in the downloaded file.');
  const row = warning.getByTestId('export-error-storage');
  await expect(row).toContainText('storage');
  await expect(row).toContainText(STORAGE_FAILURE);
});
