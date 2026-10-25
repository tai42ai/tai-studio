/**
 * The holder lists against the real stack. A preset delete is held by a conversation
 * route bound to the preset: the delete confirm lists the route, Delete stays disabled,
 * and the route's link lands on that route's threads. A template detach is held by a
 * preset version whose state binding names the template: the detach confirm lists the
 * version, Detach stays disabled, and the version's link lands on the preset's version
 * history with that row marked.
 */
import { expect } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import {
  createBoundRoute,
  createPreset,
  deletePreset,
  deleteRoute,
  detachTemplate,
  HOLDERS_STATE,
  HOLDERS_TEMPLATE,
  holdersApi,
  MARK_BINDING,
  seedStateAndTemplate,
} from './holders-fixtures';

needs(
  'kind:states',
  'kind:studio_plugins:reference_plugin',
  'mutable',
  'setting:presets',
  'setting:conversations',
);

const STAMP = String(Date.now());

test.describe('holder lists (real stack)', () => {
  test('a preset delete held by a bound conversation route links to the route', async ({
    page,
  }) => {
    const preset = `held-${STAMP}`;
    const route = `held-route-${STAMP}`;
    const api = await holdersApi();
    try {
      await createPreset(api, preset);
      await createBoundRoute(api, route, preset);

      await seedCredential(page);
      await page.goto(`/presets?preset=${preset}`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: `Delete preset ${preset}` }).click();

      const dialog = page.getByRole('dialog', { name: `Delete preset — ${preset}` });
      await expect(dialog.getByText('Still used by — remove these first:')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Delete' })).toBeDisabled();

      await dialog.getByRole('link', { name: `conversation route '${route}'` }).click();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`/conversations\\?.*route=${route}`));
      await expect(page.getByRole('link', { name: 'Back to all routes' })).toBeVisible();
    } finally {
      await deleteRoute(api, route);
      await deletePreset(api, preset);
      await api.dispose();
    }
  });

  test('a template detach held by a preset version links to the version row', async ({ page }) => {
    const preset = `marks-${STAMP}`;
    const api = await holdersApi();
    try {
      await seedStateAndTemplate(api);
      await createPreset(api, preset, MARK_BINDING);

      await seedCredential(page);
      await page.goto(`/states?state=${HOLDERS_STATE}&tab=templates`, {
        waitUntil: 'domcontentloaded',
      });
      const row = page.getByRole('row').filter({ hasText: HOLDERS_TEMPLATE });
      await row.getByRole('button', { name: 'Detach' }).click();

      const dialog = page.getByRole('dialog', {
        name: `Detach '${HOLDERS_TEMPLATE}' from '${HOLDERS_STATE}'?`,
      });
      await expect(dialog.getByText('Still used by — change these bindings first:')).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Detach' })).toBeDisabled();

      await dialog.getByRole('link', { name: `preset '${preset}' version 1` }).click();
      await expect(dialog).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`/presets\\?.*preset=${preset}`));
      await expect(page).toHaveURL(/version=1/);
      await expect(page.getByTestId('version-row-1')).toHaveAttribute('aria-current', 'true');
    } finally {
      await deletePreset(api, preset);
      await detachTemplate(api);
      await api.dispose();
    }
  });
});
