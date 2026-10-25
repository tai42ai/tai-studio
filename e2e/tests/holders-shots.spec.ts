/**
 * The holder-list frames, captured against the LIVE boot skeleton in BOTH themes at
 * 1440×900: the preset delete confirm held by a bound conversation route, and the
 * template detach confirm held by a preset version. The holders are seeded through the
 * real HTTP API; each frame waits on its holder link and refuses to ship an error card.
 *
 * The PNGs land in `HOLDERS_SHOTS_DIR` (default: the gitignored `test-results/`).
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, type Locator, type Page } from '@playwright/test';

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

const VIEWPORT = { width: 1440, height: 900 } as const;

const OUT_DIR =
  process.env.HOLDERS_SHOTS_DIR ??
  fileURLToPath(new URL('../test-results/holders-shots', import.meta.url));

const ERROR_CARD = '[role="alert"]:has-text("Something went wrong")';

const HELD_PRESET = 'relay-echo';
const HELD_ROUTE = 'chat-line';
const BOUND_PRESET = 'mark-relay';

interface Frame {
  readonly name: string;
  readonly path: string;
  readonly open: (page: Page) => Promise<void>;
  readonly ready: (page: Page) => Locator;
}

const FRAMES: readonly Frame[] = [
  {
    name: 'preset-delete-held',
    path: `/presets?preset=${HELD_PRESET}`,
    open: async (page) => {
      await page.getByRole('button', { name: `Delete preset ${HELD_PRESET}` }).click();
    },
    ready: (page) =>
      page
        .getByRole('dialog', { name: `Delete preset — ${HELD_PRESET}` })
        .getByRole('link', { name: `conversation route '${HELD_ROUTE}'` }),
  },
  {
    name: 'states-detach-held',
    path: `/states?state=${HOLDERS_STATE}&tab=templates`,
    open: async (page) => {
      await page
        .getByRole('row')
        .filter({ hasText: HOLDERS_TEMPLATE })
        .getByRole('button', { name: 'Detach' })
        .click();
    },
    ready: (page) =>
      page
        .getByRole('dialog', { name: `Detach '${HOLDERS_TEMPLATE}' from '${HOLDERS_STATE}'?` })
        .getByRole('link', { name: `preset '${BOUND_PRESET}' version 1` }),
  },
];

test.beforeAll(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const api = await holdersApi();
  try {
    await deleteRoute(api, HELD_ROUTE);
    await deletePreset(api, HELD_PRESET);
    await deletePreset(api, BOUND_PRESET);
    await createPreset(api, HELD_PRESET);
    await createBoundRoute(api, HELD_ROUTE, HELD_PRESET);
    await seedStateAndTemplate(api);
    await createPreset(api, BOUND_PRESET, MARK_BINDING);
  } finally {
    await api.dispose();
  }
});

test.afterAll(async () => {
  const api = await holdersApi();
  try {
    await deleteRoute(api, HELD_ROUTE);
    await deletePreset(api, HELD_PRESET);
    await deletePreset(api, BOUND_PRESET);
    await detachTemplate(api);
  } finally {
    await api.dispose();
  }
});

for (const theme of ['light', 'dark'] as const) {
  test.describe(`holder-list frames (${theme})`, () => {
    test.use({ colorScheme: theme, viewport: VIEWPORT });

    for (const frame of FRAMES) {
      test(frame.name, async ({ page }) => {
        await seedCredential(page);
        await page.goto(frame.path, { waitUntil: 'domcontentloaded' });
        await frame.open(page);
        await frame.ready(page).waitFor({ state: 'visible' });

        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator(ERROR_CARD)).toHaveCount(0);

        // Let fonts + layout settle, then capture the fixed-viewport frame.
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${OUT_DIR}/${frame.name}-${theme}.png` });
      });
    }
  });
}
