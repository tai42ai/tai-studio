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
 * The boot gives `studio_demo_echo` the backend `schedule_task` extension, so its
 * `studio_demo_echo_schedule_task` vehicle is registered and the create door has a real
 * schedulable target. The create leg asserts the request the dialog sends to the LIVE door
 * (never a stubbed response) — the vehicle tool name and the cadence — then proves the
 * schedule PERSISTED by reading it back from the listing. `GET /api/schedules` projects the
 * backend's listing (name, enabled, next run, and the cadence `meta`), which is where the
 * persistence shows.
 *
 * The dialog's execution-key picker and its wiring onto the create body are proven by the
 * first leg here (the picker renders) and by the scheduling feature's unit tests; the live
 * create leg does NOT bind one, because the skeleton's create door stamps a bound key as the
 * reserved `backend_schedule_execution_key` arguments and dispatches the schedule vehicle
 * with them, which a vehicle whose base tool declares no `**kwargs` rejects — so a
 * key-bound create cannot persist for such a tool on the installed backend.
 */
import { expect, test } from '@playwright/test';

import { API_KEY, seedCredential } from './helpers';

const SCHEDULE_TOOL = 'studio_demo_echo';
/** The vehicle the create door dispatches: the tool's backend `schedule_task` branch. */
const SCHEDULE_VEHICLE = `${SCHEDULE_TOOL}_schedule_task`;

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
  // The picker offers only schedulable BASE tools — the `…_schedule_task` vehicle is not a
  // picker row — so the base tool names exactly one option.
  await page.getByRole('option', { name: SCHEDULE_TOOL }).click();
  await dialog.getByLabel('Cron expression').fill(cron);
  // studio_demo_echo requires `message`; a schedule fires the tool with these stored kwargs.
  await dialog.getByLabel('Tool kwargs (JSON)').fill('{"message":"tick"}');

  // Observe the REAL create request (never a stubbed response): it reaches the live
  // `POST /api/schedules` naming the tool's schedule vehicle and the cadence in
  // `schedule_kwargs`.
  const createRequest = page.waitForRequest(
    (req) => req.url().includes('/api/schedules') && req.method() === 'POST',
  );
  const createResponse = page.waitForResponse(
    (res) => res.url().includes('/api/schedules') && res.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Create schedule' }).click();

  const body = (await createRequest).postDataJSON() as Record<string, unknown>;
  expect(body.tool_name).toBe(SCHEDULE_VEHICLE);
  const scheduleKwargs = body.schedule_kwargs as Record<string, unknown>;
  expect(scheduleKwargs.backend_schedule).toBe(cron);
  expect(scheduleKwargs.backend_schedule_name).toBe(name);
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
  expect(created?.enabled).toBe(true);
  expect((created?.meta as Record<string, unknown>).cron_string).toBe(cron);
});
