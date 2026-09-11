/**
 * Design-review frames for the shared `TemplatedTextField` control (the ONE editor
 * that authors an authored-text value: inline `content` XOR a stored template `id`,
 * with render `kwargs`), captured against the LIVE boot skeleton in BOTH themes at
 * 1440×900. The control is wired into every field that authors such a body; this
 * spec drives the three screens that host it and captures each in its meaningful
 * states so the design can be judged, not just its happy path:
 *
 *   - the state-binding editor (subject + scope, an input injection, an update's jq /
 *     adapter / op id) on the preset create dialog,
 *   - the hooks register form's Condition + Expr fields,
 *   - the API-keys policy section's Condition field on the create-key dialog.
 *
 * States per control: inline mode, stored mode with the template picker open, the
 * render-parameters editor expanded with a parameter, and the error state. The
 * template catalog is served by `/api/templates`; in the lean e2e boot storage is not
 * mounted, so that door genuinely 500s and the control's real stored-mode state IS the
 * load error (captured live on the binding + policy screens). Frames that need a
 * POPULATED catalog fulfil `/api/templates` through `page.route` with a real-shaped
 * list — the same idiom the templates + hooks-edit suites already use.
 *
 * The PNGs land in `TEMPLATED_TEXT_SHOTS_DIR` (default: the gitignored
 * `test-results/`), so a reviewer can point it at any directory for out-of-tree
 * evidence without the shots ever being committed. Fixtures use a domain-agnostic
 * accumulator vocabulary (counters/tally/bump), never a business scenario.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  test,
  expect,
  request as apiRequest,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';

import { API_KEY, seedCredential } from './helpers';

const VIEWPORT = { width: 1440, height: 900 } as const;
const STUDIO_PORT = process.env.STUDIO_PORT ?? '8765';
const BASE_URL = `http://127.0.0.1:${STUDIO_PORT}`;

const OUT_DIR =
  process.env.TEMPLATED_TEXT_SHOTS_DIR ??
  fileURLToPath(new URL('../test-results/templated-text-shots', import.meta.url));

const STATE = 'counters';
const TEMPLATE = 'tally';
/** The real-shaped catalog the picker-populated frames serve through `page.route`. */
const CATALOG = ['welcome', 'greeting'] as const;

const ERROR_CARD = '[role="alert"]:has-text("Something went wrong")';

/** Seed a state + a state-template carrying an `input` and an `update` template-jq,
 * and attach it — so the binding editor can attach, inject an input, and add an
 * update. Idempotent. */
async function seedBindingFixture(api: APIRequestContext): Promise<void> {
  const ok = async (
    res: Awaited<ReturnType<APIRequestContext['put']>>,
    what: string,
  ): Promise<void> => {
    if (!res.ok()) throw new Error(`${what} failed (${String(res.status())}): ${await res.text()}`);
  };

  await ok(
    await api.put(`/api/states/${STATE}`, {
      data: {
        name: STATE,
        description: 'One document per subject — a running tally.',
        schema: {
          type: 'object',
          properties: { label: { type: 'string', title: 'Label' } },
        },
        subject_kinds: ['item'],
        default_subject_kind: 'item',
      },
    }),
    'declare state',
  );

  await ok(
    await api.put(`/api/state-templates/${TEMPLATE}?replace=true`, {
      data: {
        kind: 'state-template',
        name: TEMPLATE,
        description: 'A running tally.',
        schema: { type: 'object', properties: { total: { type: 'number', title: 'Total' } } },
        parameters: {},
        regimes: [{ path: ['total'], regime: 'single' }],
      },
    }),
    'upload template document',
  );

  await api.delete(`/api/states/${STATE}/attachments/${TEMPLATE}`).catch(() => undefined);
  await ok(
    await api.put(`/api/states/${STATE}/attachments/${TEMPLATE}`, {
      data: { path: [], parameters: {}, declarations: {} },
    }),
    'attach template',
  );
}

test.beforeAll(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const api = await apiRequest.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-api-key': API_KEY, 'content-type': 'application/json' },
  });
  try {
    await seedBindingFixture(api);
  } finally {
    await api.dispose();
  }
});

/** Fulfil `GET /api/templates` with a real-shaped name list, so the stored-mode picker
 * is POPULATED. Non-GET and every other route fall through to the live skeleton. */
async function stubCatalog(page: Page, names: readonly string[]): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/templates',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({ json: { data: names } });
    },
  );
}

/** The root <div> of a TemplatedTextField: the parent of its mode radiogroup. */
function control(page: Page, label: string): Locator {
  return page.getByRole('radiogroup', { name: `${label} source` }).locator('xpath=..');
}

/** Flip a control into stored mode and open its (populated) template picker. The
 * stored-mode Select takes its accessible name from the field label it sits under. */
async function openStoredPicker(page: Page, label: string): Promise<void> {
  await page
    .getByRole('radiogroup', { name: `${label} source` })
    .getByRole('radio', {
      name: 'Stored template',
    })
    .click();
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: CATALOG[0], exact: true }).first().waitFor({
    state: 'visible',
  });
}

/** Expand a control's render-parameters editor and author one parameter. */
async function addRenderParam(
  page: Page,
  label: string,
  key: string,
  value: string,
): Promise<void> {
  const root = control(page, label);
  await root.getByRole('button', { name: 'Add render parameters' }).click();
  const group = page.getByRole('group', { name: `${label} render parameters` });
  await group.getByRole('textbox', { name: `${label} render parameters key 1` }).fill(key);
  await group.getByRole('textbox', { name: `${label} render parameters value 1` }).fill(value);
  await group.waitFor({ state: 'visible' });
}

/** Open the preset create dialog, expand the binding section, attach the fixture state. */
async function attachStateBinding(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Create preset' }).click();
  await page.getByRole('button', { name: 'Bind state (optional)' }).click();
  await page.getByRole('button', { name: 'Attach a state' }).click();
  await page.getByRole('combobox', { name: 'State' }).click();
  await page.getByRole('option', { name: STATE }).click();
  await page.getByRole('checkbox', { name: TEMPLATE }).click();
}

interface Frame {
  readonly name: string;
  readonly path: string;
  /** A real-shaped catalog to serve; omit to let the live (500-ing) door answer. */
  readonly catalog?: readonly string[];
  /** Drive the page into the state to capture. */
  readonly action: (page: Page) => Promise<void>;
  /** The POPULATED signal proving the intended state rendered. */
  readonly ready: (page: Page) => Locator;
  /** What to screenshot (default: the whole page — needed when a picker portal is open). */
  readonly target?: (page: Page) => Locator;
  /**
   * A region asserted free of the loud shared error card, proving the captured control
   * rendered clean. Scoped to the control/dialog, not the whole page: the lean e2e boot
   * mounts no storage, so `/api/templates` 500s and every hosting PAGE carries a
   * page-level error card that is not about this control. Omit for the picker-error
   * frames, whose subject IS that card.
   */
  readonly clean?: (page: Page) => Locator;
}

const FRAMES: readonly Frame[] = [
  // --- State-binding editor (preset create dialog) --------------------------
  {
    // Subject + scope + a custom input injection + an update (jq/adapter/op id), all
    // inline: the shared control in every binding slot at once.
    name: 'binding-fields-inline',
    path: '/presets',
    action: async (page) => {
      await attachStateBinding(page);
      await page.getByTestId('binding-jq-subject').getByRole('textbox').first().fill('.subject_id');
      // With no template-jq declared the added injection/update are CUSTOM jq, so each
      // surfaces its own TemplatedTextField editor (the shared control in the list slots).
      await page.getByRole('button', { name: 'Add input' }).click();
      await page.getByRole('button', { name: 'Add update' }).click();
    },
    ready: (page) => page.getByRole('radiogroup', { name: 'Op id source' }),
    target: (page) => page.getByRole('dialog'),
    clean: (page) => page.getByRole('dialog'),
  },
  {
    name: 'binding-subject-stored',
    path: '/presets',
    catalog: CATALOG,
    action: async (page) => {
      await attachStateBinding(page);
      await openStoredPicker(page, 'Subject');
    },
    ready: (page) => page.getByRole('option', { name: CATALOG[0], exact: true }).first(),
    clean: (page) => control(page, 'Subject'),
  },
  {
    name: 'binding-subject-renderparams',
    path: '/presets',
    catalog: CATALOG,
    action: async (page) => {
      await attachStateBinding(page);
      await addRenderParam(page, 'Subject', 'locale', 'en');
    },
    ready: (page) => page.getByRole('group', { name: 'Subject render parameters' }),
    target: (page) => page.getByRole('dialog'),
    clean: (page) => page.getByRole('dialog'),
  },
  {
    // The genuine live state: storage is unmounted in this boot, so `/api/templates`
    // 500s and the stored-mode picker IS the load error (with a Retry).
    name: 'binding-subject-picker-error',
    path: '/presets',
    action: async (page) => {
      await attachStateBinding(page);
      await page
        .getByRole('radiogroup', { name: 'Subject source' })
        .getByRole('radio', {
          name: 'Stored template',
        })
        .click();
      await control(page, 'Subject').getByRole('button', { name: 'Retry' }).waitFor({
        state: 'visible',
      });
    },
    ready: (page) => control(page, 'Subject').getByRole('button', { name: 'Retry' }),
    target: (page) => control(page, 'Subject'),
  },

  // --- Hooks register form --------------------------------------------------
  {
    name: 'hooks-condition-expr-inline',
    path: '/hooks',
    action: async (page) => {
      await page.getByRole('form', { name: 'Register hook' }).waitFor({ state: 'visible' });
    },
    ready: (page) => page.getByRole('radiogroup', { name: 'Expr source' }),
    target: (page) => page.getByRole('form', { name: 'Register hook' }),
    clean: (page) => page.getByRole('form', { name: 'Register hook' }),
  },
  {
    name: 'hooks-condition-stored',
    path: '/hooks',
    catalog: CATALOG,
    action: async (page) => {
      await page.getByRole('form', { name: 'Register hook' }).waitFor({ state: 'visible' });
      await openStoredPicker(page, 'Condition');
    },
    ready: (page) => page.getByRole('option', { name: CATALOG[0], exact: true }).first(),
    clean: (page) => control(page, 'Condition'),
  },
  {
    name: 'hooks-condition-renderparams',
    path: '/hooks',
    catalog: CATALOG,
    action: async (page) => {
      await page.getByRole('form', { name: 'Register hook' }).waitFor({ state: 'visible' });
      await addRenderParam(page, 'Condition', 'locale', 'en');
    },
    ready: (page) => page.getByRole('group', { name: 'Condition render parameters' }),
    target: (page) => page.getByRole('form', { name: 'Register hook' }),
    clean: (page) => page.getByRole('form', { name: 'Register hook' }),
  },
  // --- API-keys policy section (create-key dialog) --------------------------
  {
    name: 'policy-condition-inline',
    path: '/settings?tab=api-keys',
    action: async (page) => {
      await openCreateKeyDialog(page);
    },
    ready: (page) => page.getByRole('radiogroup', { name: 'Condition source' }),
    target: (page) => page.getByRole('dialog', { name: 'Create API key' }),
    clean: (page) => page.getByRole('dialog', { name: 'Create API key' }),
  },
  {
    name: 'policy-condition-stored',
    path: '/settings?tab=api-keys',
    catalog: CATALOG,
    action: async (page) => {
      await openCreateKeyDialog(page);
      await openStoredPicker(page, 'Condition');
    },
    ready: (page) => page.getByRole('option', { name: CATALOG[0], exact: true }).first(),
    clean: (page) => control(page, 'Condition'),
  },
  {
    name: 'policy-condition-renderparams',
    path: '/settings?tab=api-keys',
    catalog: CATALOG,
    action: async (page) => {
      await openCreateKeyDialog(page);
      await addRenderParam(page, 'Condition', 'locale', 'en');
    },
    ready: (page) => page.getByRole('group', { name: 'Condition render parameters' }),
    target: (page) => page.getByRole('dialog', { name: 'Create API key' }),
    clean: (page) => page.getByRole('dialog', { name: 'Create API key' }),
  },
  {
    // The genuine live picker-load error, mirroring the binding one on this screen.
    name: 'policy-condition-picker-error',
    path: '/settings?tab=api-keys',
    action: async (page) => {
      await openCreateKeyDialog(page);
      await page
        .getByRole('radiogroup', { name: 'Condition source' })
        .getByRole('radio', {
          name: 'Stored template',
        })
        .click();
      await control(page, 'Condition').getByRole('button', { name: 'Retry' }).waitFor({
        state: 'visible',
      });
    },
    ready: (page) => control(page, 'Condition').getByRole('button', { name: 'Retry' }),
    target: (page) => control(page, 'Condition'),
  },
];

/** Open the create-key dialog on the API-keys tab (the wildcard key is full-mint). */
async function openCreateKeyDialog(page: Page): Promise<void> {
  await page.getByRole('tab', { name: 'API keys' }).click();
  await page.getByRole('button', { name: 'Create key' }).click();
  await page.getByRole('dialog', { name: 'Create API key' }).waitFor({ state: 'visible' });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`TemplatedTextField frames (${theme})`, () => {
    test.use({ colorScheme: theme, viewport: VIEWPORT });

    for (const frame of FRAMES) {
      test(frame.name, async ({ page }) => {
        await seedCredential(page);
        if (frame.catalog !== undefined) await stubCatalog(page, frame.catalog);
        await page.goto(frame.path, { waitUntil: 'domcontentloaded' });
        await frame.action(page);
        await frame.ready(page).waitFor({ state: 'visible' });

        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const clean = frame.clean?.(page);
        if (clean !== undefined) {
          await expect(clean.locator(ERROR_CARD)).toHaveCount(0);
        }

        await page.waitForTimeout(500);
        const target = frame.target?.(page);
        if (target !== undefined) {
          await target.screenshot({ path: `${OUT_DIR}/${frame.name}-${theme}.png` });
        } else {
          // A VIEWPORT shot (not full-page): the open template picker is a portalled
          // popover, and a full-page capture resizes the viewport, which dismisses it.
          await page.screenshot({ path: `${OUT_DIR}/${frame.name}-${theme}.png` });
        }
      });
    }
  });
}
