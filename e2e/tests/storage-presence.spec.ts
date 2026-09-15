/**
 * Storage presence against the LIVE lean boot.
 *
 * The boot manifest sets `default_routers: none` and does NOT list the storage
 * management router, yet the presence read `GET /api/storage` is force-mounted as a
 * core router on every boot. So this deployment — with no storage management surface —
 * still answers "is a provider installed?" with `present: false` (a 200), and a
 * templated-text field routes into its clean inline-only ABSENT state rather than the
 * presence-read error a 404 would have produced.
 *
 * No `/api/storage` stub here: these cases prove the LIVE boot behaviour, unlike the
 * design-frame specs that stub the signal to drive each state deterministically.
 */
import { expect, request as apiRequest, test } from '@playwright/test';

import { API_KEY, seedCredential } from './helpers';

const STUDIO_PORT = process.env.STUDIO_PORT ?? '8765';
const BASE_URL = `http://127.0.0.1:${STUDIO_PORT}`;

const ERROR_CARD = '[role="alert"]:has-text("Something went wrong")';

test('the lean boot answers storage presence present:false with no management surface', async () => {
  const api = await apiRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-api-key': API_KEY },
  });
  try {
    // Presence is a core, always-mounted read — answerable even though no storage
    // management router is listed in this manifest.
    const presence = await api.get('/api/storage');
    expect(presence.status()).toBe(200);
    expect(((await presence.json()) as { data: unknown }).data).toEqual({
      present: false,
      provider: null,
      module: null,
    });

    // The management surface stays optional — it is NOT mounted in the lean boot.
    const resources = await api.get('/api/storage/resources');
    expect(resources.status()).toBe(404);
  } finally {
    await api.dispose();
  }
});

test('a templated-text field renders its clean absent state on the live boot', async ({ page }) => {
  await seedCredential(page);
  await page.goto('/hooks', { waitUntil: 'domcontentloaded' });

  const form = page.getByRole('form', { name: 'Register hook' });
  await form.waitFor({ state: 'visible' });

  // Storage absent (present: false): the stored source is not offered, so the field
  // is inline-only — no source toggle, no catalog fetch, no presence-read error.
  await expect(form.getByRole('radiogroup', { name: 'Condition source' })).toHaveCount(0);
  await expect(form.getByRole('textbox', { name: 'Condition' })).toBeVisible();
  await expect(form.locator(ERROR_CARD)).toHaveCount(0);
});
