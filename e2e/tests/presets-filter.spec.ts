/**
 * The Presets screen's filter, against the LIVE boot skeleton. Two presets over a
 * reference-plugin tool are stored through the API, and the second carries an overlay
 * tag; both, and the overlay row, are removed in a `finally` block through the API.
 *
 * Legs: the search box narrows the presets by description and commits `?q=` on Enter; a
 * tag chip narrows them to the tagged preset and writes `?tags=`; opening a preset and
 * going Back keeps the filter; and the card view shows each preset's active version and
 * extension count.
 */
import { expect, type Page } from '@playwright/test';

import { needs, test } from '../needs';
import { seedCredential } from './helpers';
import {
  awaitPreset,
  bootApi,
  createPreset,
  deletePreset,
  dropOverlayRow,
  writeOverlayRow,
} from './tool-meta-api';

needs('kind:studio_plugins:reference_plugin', 'mutable', 'setting:presets');

/** The reference-plugin tool both presets wrap. */
const BASE_TOOL = 'studio_demo_echo';

/** The URL's search parameter `key`, as the address bar holds it. */
function searchParam(page: Page, key: string): () => string | null {
  return () => new URL(page.url()).searchParams.get(key);
}

function openLink(page: Page, preset: string) {
  return page.getByRole('link', { name: `Open preset ${preset}`, exact: true });
}

test('the search box and a tag chip narrow the presets, and Back from a preset keeps the filter', async ({
  page,
}) => {
  const suffix = Date.now().toString(36);
  const status = `e2e-status-${suffix}`;
  const relay = `e2e-relay-${suffix}`;
  const tag = `relay-${suffix}`;
  const api = await bootApi();
  const created: string[] = [];
  let tagged = false;
  try {
    await createPreset(api, status, BASE_TOOL, `Answers status questions ${suffix}.`);
    created.push(status);
    await createPreset(api, relay, BASE_TOOL, `Relays alerts onward ${suffix}.`);
    created.push(relay);
    for (const name of created) await awaitPreset(api, name);
    tagged = true;
    await writeOverlayRow(api, relay, { tags: [tag] });

    await seedCredential(page);
    await page.goto('/presets');
    await expect(openLink(page, status)).toBeVisible();
    await expect(openLink(page, relay)).toBeVisible();

    const search = page.getByRole('textbox', { name: 'Filter presets' });
    await search.fill(`status questions ${suffix}`);
    await search.press('Enter');
    await expect.poll(searchParam(page, 'q')).toBe(`status questions ${suffix}`);
    await expect(openLink(page, status)).toBeVisible();
    await expect(openLink(page, relay)).toHaveCount(0);

    await search.fill('');
    await search.press('Enter');
    const chip = page
      .getByRole('group', { name: 'Filter presets by tag' })
      .getByRole('button', { name: `${tag} (1)`, exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(searchParam(page, 'tags')).toBe(JSON.stringify([tag]));
    await expect(openLink(page, relay)).toBeVisible();
    await expect(openLink(page, status)).toHaveCount(0);

    await openLink(page, relay).click();
    await expect(page.getByRole('button', { name: `Edit details for ${relay}` })).toBeVisible();
    await page.goBack();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(searchParam(page, 'tags')).toBe(JSON.stringify([tag]));
    await expect(openLink(page, relay)).toBeVisible();
    await expect(openLink(page, status)).toHaveCount(0);
  } finally {
    if (tagged) await dropOverlayRow(api, relay);
    for (const name of created) await deletePreset(api, name);
    await api.dispose();
  }
});

test('the card view shows a preset with its active version and extension count', async ({
  page,
}) => {
  const preset = `e2e-card-${Date.now().toString(36)}`;
  const api = await bootApi();
  let presetCreated = false;
  try {
    await createPreset(api, preset, BASE_TOOL, 'Echoes a fixed text.');
    presetCreated = true;
    await awaitPreset(api, preset);

    await seedCredential(page);
    await page.goto('/presets');
    await page.getByRole('radio', { name: 'Card view' }).click();
    const search = page.getByRole('textbox', { name: 'Filter presets' });
    await search.fill(preset);
    await search.press('Enter');

    const card = page.getByRole('listitem').filter({ has: openLink(page, preset) });
    await expect(card).toHaveCount(1);
    await expect(card.getByText('Active version 1', { exact: true })).toBeVisible();
    await expect(card.getByText('Extensions 0', { exact: true })).toBeVisible();
  } finally {
    if (presetCreated) await deletePreset(api, preset);
    await api.dispose();
  }
});
