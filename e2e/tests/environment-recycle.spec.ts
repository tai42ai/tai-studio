/**
 * The Environment tab's save, and the Backup tab's env-section restore, of a
 * recycle-class setting, against the LIVE boot skeleton.
 *
 * The boot skeleton runs bare (no supervisor), so a change to a recycle-class key is
 * refused upfront: each tab shows the server's refusal naming the key, and nothing is
 * stored. On a supervised deployment the same change rolls a worker recycle; the rows
 * that roll returns, and the workers the server names as still awaiting a restart, are
 * rendered from a fixed response here, the one state a bare skeleton cannot produce.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { API_KEY, seedCredential } from './helpers';

needs('mutable');

/** A recycle-class key every skeleton registers (the worker bus's presence TTL). */
const RECYCLE_KEY = 'TAI_BUS_HEARTBEAT_TTL';

test('a recycle-class save on a bare deployment shows the refusal and stores nothing', async ({
  page,
  request,
}) => {
  await seedCredential(page);
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Environment' }).click();
  await page.getByRole('button', { name: 'Add variable' }).click();
  await page
    .getByRole('textbox', { name: /^Name of new variable/ })
    .last()
    .fill(RECYCLE_KEY);
  await page.getByRole('textbox', { name: `Value of variable ${RECYCLE_KEY}` }).fill('7');
  await page.getByRole('button', { name: 'Save' }).click();

  const refusal = page.getByRole('alert').filter({ hasText: 'bare (unsupervised) deployment' });
  await expect(refusal).toContainText(RECYCLE_KEY);
  await expect(refusal).toContainText(
    "Set them in the deployment's environment (or the stored .env) and restart the server",
  );

  const stored = await request.get('/api/config/env', {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  expect(stored.ok()).toBe(true);
  const body = (await stored.json()) as { data: { env: Record<string, string> } };
  expect(body.data.env[RECYCLE_KEY]).toBeUndefined();
});

test('a save that rolled a worker recycle shows each worker and the writer recycling itself', async ({
  page,
}) => {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === '/api/config/env',
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        json: {
          data: {
            status: 'ok',
            env_keys: 1,
            awaiting_respawn: [],
            fanout: {
              mode: 'local-only',
              note: 'no worker bus configured; only this worker reloaded',
            },
            recycle: {
              recycle: [
                {
                  name: 'backend-1',
                  kind: 'backend',
                  status: 'recycled',
                  generation_before: 3,
                  detail: null,
                },
                {
                  name: 'serve-1',
                  kind: 'serve',
                  status: 'self-deferred',
                  generation_before: 2,
                  detail: null,
                },
              ],
              fresh: [{ name: 'backend-1', kind: 'backend', generation: 4 }],
              recycle_stopped: null,
            },
          },
        },
      });
    },
  );
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Environment' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  const section = page.getByRole('region', { name: 'Worker recycle' });
  await expect(section).toBeVisible();
  const rows = section.getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('backend-1');
  await expect(rows.nth(0)).toContainText('life 3 to 4');
  await expect(rows.nth(1)).toContainText('this worker recycles itself after replying');
});

/** Upload a backup document whose one `env` section sets `env`, then import it. */
async function restoreEnvSection(page: Page, env: Record<string, string>): Promise<void> {
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Backup' }).click();
  await page.getByLabel('Backup file').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ version: 1, created_at: '2026-01-01T00:00:00Z', sections: { env } }),
    ),
  });
  await page.getByRole('button', { name: 'Import selected' }).click();
}

test('a recycle-class env restore on a bare deployment reports the refusal and stores nothing', async ({
  page,
  request,
}) => {
  await seedCredential(page);
  await restoreEnvSection(page, { [RECYCLE_KEY]: '7' });

  await expect(page.getByRole('alert').filter({ hasText: 'Import failed' })).toBeVisible();
  const row = page.getByTestId('report-row-env');
  await expect(row).toContainText('bare (unsupervised) deployment');
  await expect(row).toContainText(RECYCLE_KEY);

  const stored = await request.get('/api/config/env', {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  expect(stored.ok()).toBe(true);
  const body = (await stored.json()) as { data: { env: Record<string, string> } };
  expect(body.data.env[RECYCLE_KEY]).toBeUndefined();
});

test('an env restore whose recycle stopped shows the roll and the workers awaiting a restart', async ({
  page,
}) => {
  await seedCredential(page);
  await page.route(
    (url) => url.pathname === '/api/backup/import',
    (route) =>
      route.fulfill({
        json: {
          data: {
            ok: true,
            sections: {
              env: {
                created: 0,
                updated: 1,
                skipped: 0,
                errors: [],
                fanout: {
                  mode: 'local-only',
                  note: 'no worker bus configured; only this worker reloaded',
                },
                recycle: {
                  recycle: [
                    {
                      name: 'backend-1',
                      kind: 'backend',
                      status: 'timed-out',
                      generation_before: 3,
                      detail: 'its old life was still present after 90s',
                    },
                  ],
                  fresh: [],
                  recycle_stopped: {
                    kind: 'backend',
                    name: 'backend-1',
                    detail: 'its old life was still present after 90s',
                  },
                },
                awaiting_respawn: [
                  { name: 'backend-1', keys: [RECYCLE_KEY] },
                  { name: 'serve-1', keys: [RECYCLE_KEY] },
                ],
              },
            },
          },
        },
      }),
  );
  await restoreEnvSection(page, { [RECYCLE_KEY]: '7' });

  const roll = page.getByTestId('report-recycle-env');
  await expect(roll.getByTestId('recycle-stopped')).toContainText(
    'its old life was still present after 90s',
  );
  const awaiting = page
    .getByRole('status')
    .filter({ hasText: '2 workers need a restart to apply some settings' });
  await expect(awaiting).toContainText('serve-1');
  await expect(awaiting).toContainText('backend-1');
  await expect(awaiting).toContainText(RECYCLE_KEY);
});
