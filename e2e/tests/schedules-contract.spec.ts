/**
 * The add-schedule dialog's door-contract wiring, against the LIVE boot skeleton. The lean
 * boot mounts the schedules router and installs the RQ backend, so `GET /api/schedules`
 * answers 200 (empty) and the page offers the create dialog rather than the "needs a
 * backend plugin" 501 empty state; the tool list, execution keys and the create door are
 * the real ones.
 *
 * Legs: the dialog carries the execution-key picker and the four door-contract jq fields
 * (Start / Cancel / Resume / Extras); a schedule created from the dialog drives the REAL
 * `POST /api/schedules` to a persisted schedule and reads it back from `GET /api/schedules`
 * with its cron cadence intact.
 *
 * The boot gives `studio_demo_echo` the backend `schedule_task` extension, so the server
 * serves it as schedulable and the create door has a real target. The dialog sends the BASE
 * tool and a typed cadence (the five crontab fields split from the typed expression); the
 * door resolves the backend's schedule vehicle itself. The create leg asserts that request
 * against the LIVE door (never a stubbed response), then proves the schedule PERSISTED by
 * reading it back from the listing as a typed `ScheduleListRow` (name, tool, cadence,
 * enabled, next run — never the stored tool arguments).
 *
 * The dialog's execution-key picker and its wiring onto the create body are proven by the
 * first leg here (the picker renders) and by the scheduling feature's unit tests; the live
 * create leg does NOT bind one, because the skeleton's create door stamps a bound key as the
 * reserved `backend_schedule_execution_key` arguments and dispatches the schedule vehicle
 * with them, which a vehicle whose base tool declares no `**kwargs` rejects — so a
 * key-bound create cannot persist for such a tool on the installed backend. The session
 * cases therefore serve the create write through `page.route` (with `GET /api/auth/me` and
 * the api-key list) and read the execution key each session sends.
 */
import { expect, type Locator, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { API_KEY, EXECUTION_KEY_ID, pickExecutionKey, seedCredential } from './helpers';
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

needs(
  'kind:backend:rq',
  'kind:studio_plugins:reference_plugin',
  'mutable',
  'setting:schedule-task-extension',
);

const SCHEDULE_TOOL = 'studio_demo_echo';

test('the add-schedule dialog carries the execution key + the four door-contract jq fields', async ({
  page,
}) => {
  await seedCredential(page);
  await page.goto('/scheduling');

  await page.getByRole('button', { name: 'Add schedule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add schedule' });
  await expect(dialog).toBeVisible();

  // The door-contract section: the execution-key picker plus the four jq fields. Each
  // field is a labelled Field wrapping its jq editor (whose own label repeats the name),
  // so the assertion targets the Field label to name exactly one element per field.
  await expect(dialog.getByRole('combobox', { name: 'Execution key' })).toBeVisible();
  for (const field of ['Start', 'Cancel', 'Resume', 'Extras']) {
    await expect(
      dialog.locator('.tai-field-label').filter({ hasText: new RegExp(`^${field}$`) }),
    ).toBeVisible();
  }
});

test('a schedule created from the dialog persists and reads back with its cadence', async ({
  page,
}) => {
  await seedCredential(page);
  await page.goto('/scheduling');

  const cron = '0 2 * * *';
  const name = `nightly-report-${String(Date.now())}`;
  await page.getByRole('button', { name: 'Add schedule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add schedule' });

  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('combobox', { name: 'Tool' }).click();
  // The picker offers only the tools the server serves as schedulable, so the base tool names
  // exactly one option.
  await page.getByRole('option', { name: SCHEDULE_TOOL }).click();
  await dialog.getByLabel('Cron expression').fill(cron);
  // studio_demo_echo requires `message`; a schedule fires the tool with these stored kwargs.
  await dialog.getByLabel('Tool kwargs (JSON)').fill('{"message":"tick"}');

  // Observe the REAL create request (never a stubbed response): it reaches the live
  // `POST /api/schedules` naming the base tool, the typed cadence and the schedule name.
  const createRequest = page.waitForRequest(
    (req) => req.url().includes('/api/schedules') && req.method() === 'POST',
  );
  const createResponse = page.waitForResponse(
    (res) => res.url().includes('/api/schedules') && res.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Create schedule' }).click();

  const cadence = {
    kind: 'crontab',
    minute: '0',
    hour: '2',
    day_of_month: '*',
    month_of_year: '*',
    day_of_week: '*',
  };
  const body = (await createRequest).postDataJSON() as Record<string, unknown>;
  expect(body.tool_name).toBe(SCHEDULE_TOOL);
  expect(body.cadence).toEqual(cadence);
  expect(body.schedule_name).toBe(name);
  expect('schedule_kwargs' in body).toBe(false);
  // The live door registered the schedule — a 2xx, never a 501/500 stub.
  expect((await createResponse).status()).toBe(200);

  // Read the schedule back from the LIVE listing: it persisted under its name with the cron
  // cadence intact (the door-contract proof — a real recurring vehicle was registered).
  const listing = await page.request.get('/api/schedules', {
    headers: { 'x-api-key': API_KEY },
  });
  expect(listing.ok()).toBe(true);
  const rows = ((await listing.json()) as { data: Record<string, unknown>[] }).data;
  const created = rows.find((row) => row.name === name);
  expect(created, `schedule ${name} not found in the listing`).toBeDefined();
  expect(created?.tool).toBe(SCHEDULE_TOOL);
  expect(created?.cadence).toEqual(cadence);
  expect(created?.enabled).toBe(true);
});

/** Open the add-schedule dialog and fill a valid schedule, leaving the key to the case. */
async function openScheduleFields(page: Page, name: string): Promise<Locator> {
  await page.getByRole('button', { name: 'Add schedule' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add schedule' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('combobox', { name: 'Tool' }).click();
  await page.getByRole('option', { name: SCHEDULE_TOOL }).click();
  await dialog.getByLabel('Cron expression').fill('0 2 * * *');
  await dialog.getByLabel('Tool kwargs (JSON)').fill('{"message":"tick"}');
  return dialog;
}

const isSchedules = (pathname: string): boolean => pathname === '/api/schedules';

test.describe('the execution key a session can bind', () => {
  test('a key session over an empty key list binds its own identity', async ({ page }) => {
    await seedCredential(page);
    await stubSession(page, keySession);
    await stubKeyList(page, { keys: [] });
    const name = `e2e-own-${String(Date.now())}`;
    await serveWrite(page, 'POST', isSchedules, { data: { schedule_name: name } });
    await page.goto('/scheduling');

    const dialog = await openScheduleFields(page, name);
    await pickExecutionKey(page, dialog);
    const write = nextRequest(page, 'POST', isSchedules);
    await dialog.getByRole('button', { name: 'Create schedule' }).click();

    expect(bodyOf(await write).execution_key).toBe(EXECUTION_KEY_ID);
  });

  test('an account session over an empty key list reads the note', async ({ page }) => {
    await seedCredential(page);
    await stubSession(page, accountSession);
    await stubKeyList(page, { keys: [] });
    await page.goto('/scheduling');

    await page.getByRole('button', { name: 'Add schedule' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add schedule' });
    await expect(dialog.getByText(ACCOUNT_EMPTY_NOTE, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Execution key' })).toHaveCount(0);
  });

  test('with access control off a door-contract jq is sent with the fill identity', async ({
    page,
  }) => {
    await seedCredential(page);
    await stubSession(page, gateOffSession);
    const name = `e2e-gate-off-${String(Date.now())}`;
    await serveWrite(page, 'POST', isSchedules, { data: { schedule_name: name } });
    await page.goto('/scheduling');

    const dialog = await openScheduleFields(page, name);
    await expect(dialog.getByText('Execution key', { exact: true })).toHaveCount(0);
    await dialog.getByRole('textbox', { name: 'Start', exact: true }).fill('.id');
    const create = dialog.getByRole('button', { name: 'Create schedule' });
    await expect(create).toBeEnabled();
    const write = nextRequest(page, 'POST', isSchedules);
    await create.click();

    const body = bodyOf(await write);
    expect(body.execution_key).toBe('__no_auth__');
    expect(body.start_expr).toBeDefined();
  });

  test("a refused key list reads the note, offers no retry, and binds the session's identity", async ({
    page,
  }) => {
    await seedCredential(page);
    await stubSession(page, keySession);
    await stubKeyList(page, { status: 403, error: 'Forbidden' });
    const name = `e2e-no-grant-${String(Date.now())}`;
    await serveWrite(page, 'POST', isSchedules, { data: { schedule_name: name } });
    await page.goto('/scheduling');

    const dialog = await openScheduleFields(page, name);
    await expect(dialog.getByText(KEY_LIST_FORBIDDEN_NOTE, { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Retry' })).toHaveCount(0);
    await pickExecutionKey(page, dialog);
    const write = nextRequest(page, 'POST', isSchedules);
    await dialog.getByRole('button', { name: 'Create schedule' }).click();

    expect(bodyOf(await write).execution_key).toBe(EXECUTION_KEY_ID);
  });
});
