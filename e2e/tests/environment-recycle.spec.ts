/**
 * The Settings and Environment tabs, and the Backup tab's env-section restore, against
 * the LIVE boot skeleton, for a setting the deployment's own environment sets, and
 * for a recycle-class setting.
 *
 * A settings field the deployment's environment sets is locked in the Settings tab,
 * and a save or an env restore that sets its key is refused by the server, naming the
 * key; nothing is stored. The key is read from the live settings schema, so the suite
 * holds on any stack.
 *
 * A change to a recycle-class key rolls a worker recycle, whose exited workers only a
 * supervisor brings back; the boot skeleton runs under none, so the rows that roll
 * returns, and the workers the server names as still awaiting a restart, are rendered
 * from a fixed response here.
 */
import { type APIRequestContext, expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { API_KEY, seedCredential } from './helpers';

needs('mutable');

/** A recycle-class key every skeleton registers (the worker bus's presence TTL). */
const RECYCLE_KEY = 'TAI_BUS_HEARTBEAT_TTL';

/** A settings field as the live settings schema reports it. */
interface SchemaField {
  readonly name: string;
  readonly env_var: string;
  readonly type: string;
  readonly required: boolean;
  readonly secret: boolean;
  readonly reload_class: 'hot' | 'recycle' | 'excluded';
  readonly key_material: boolean;
  readonly value: unknown;
  readonly value_source: string | null;
}

/** The bus keys every deployment refuses, under their own message. */
const BUS_KEYS = new Set(['TAI_BUS_REDIS_URL', 'TAI_DEFAULT_REDIS_URL']);

/**
 * The server's refusal of a write that sets a key the deployment sets. Matched on the
 * server's own wording, so the lock badge's "Set by the deployment" never satisfies it.
 */
const DEPLOYMENT_REFUSAL = 'Refusing an env write setting keys set by the deployment:';

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${API_KEY}` };
}

async function storedEnv(request: APIRequestContext): Promise<Record<string, string>> {
  const stored = await request.get('/api/config/env', { headers: authHeaders() });
  expect(stored.ok()).toBe(true);
  const body = (await stored.json()) as { data: { env: Record<string, string> } };
  return body.data.env;
}

function labelOf(field: SchemaField): string {
  return field.required ? `${field.name} *` : field.name;
}

/**
 * A plain-text settings field the deployment's environment sets, whose Settings-tab
 * label is unique, so the tab shows it under one addressable name.
 *
 * The server refuses an env write that carries an `excluded` (boot-identity) key, and one
 * that changes a key-material key, under their own messages before it checks the keys the
 * deployment sets, so such a field is never picked: its refusal would not be the
 * deployment one.
 */
type TextField = SchemaField & { readonly value: string };

function isTextField(field: SchemaField): field is TextField {
  return field.type === 'string' && typeof field.value === 'string';
}

async function deploymentSetField(request: APIRequestContext): Promise<TextField> {
  const response = await request.get('/api/config/settings-schema', { headers: authHeaders() });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    data: { groups: { fields: SchemaField[] }[] };
  };
  const fields = body.data.groups.flatMap((group) => group.fields);
  const labelCount = new Map<string, number>();
  for (const field of fields) {
    labelCount.set(labelOf(field), (labelCount.get(labelOf(field)) ?? 0) + 1);
  }
  const field = fields
    .filter(isTextField)
    .find(
      (candidate) =>
        candidate.value_source === 'deployment' &&
        candidate.env_var !== '' &&
        !candidate.secret &&
        candidate.reload_class !== 'excluded' &&
        !candidate.key_material &&
        !BUS_KEYS.has(candidate.env_var) &&
        labelCount.get(labelOf(candidate)) === 1,
    );
  if (field === undefined) {
    throw new Error('the live settings schema reports no plain-text field set by the deployment');
  }
  return field;
}

test('a field the deployment sets is locked, and a save that sets its key is refused', async ({
  page,
  request,
}) => {
  const field = await deploymentSetField(request);
  expect(await storedEnv(request)).not.toHaveProperty(field.env_var);

  await seedCredential(page);
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Settings' }).click();
  const input = page.getByLabel(labelOf(field), { exact: true });
  await expect(input).toBeDisabled();
  await expect(input).toHaveValue(field.value);
  await expect(input).toHaveAccessibleDescription(/Set by the deployment/);

  await page.getByRole('tab', { name: 'Environment' }).click();
  await page.getByRole('button', { name: 'Add variable' }).click();
  await page
    .getByRole('textbox', { name: /^Name of new variable/ })
    .last()
    .fill(field.env_var);
  await page
    .getByRole('textbox', { name: `Value of variable ${field.env_var}` })
    .fill('changed-here');
  await page.getByRole('button', { name: 'Save' }).click();

  const refusal = page.getByRole('alert').filter({ hasText: DEPLOYMENT_REFUSAL });
  await expect(refusal).toContainText(field.env_var);
  expect(await storedEnv(request)).not.toHaveProperty(field.env_var);
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

test('an env restore that sets a key the deployment sets reports the refusal and stores nothing', async ({
  page,
  request,
}) => {
  const field = await deploymentSetField(request);
  await seedCredential(page);
  await restoreEnvSection(page, { [field.env_var]: 'changed-here' });

  await expect(page.getByRole('alert').filter({ hasText: 'Import failed' })).toBeVisible();
  const row = page.getByTestId('report-row-env');
  await expect(row).toContainText(DEPLOYMENT_REFUSAL);
  await expect(row).toContainText(field.env_var);
  expect(await storedEnv(request)).not.toHaveProperty(field.env_var);
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
                details: {},
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
