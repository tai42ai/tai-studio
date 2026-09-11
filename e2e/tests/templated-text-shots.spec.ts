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
 * The control gates its STORED source on the storage-presence signal (`GET /api/storage`):
 * a stored template can be neither browsed nor resolved without a storage provider. The
 * lean e2e boot does not mount the storage router at all, so every frame STUBS this signal
 * (a real deployment serves it, reporting `present: false` when no provider is registered).
 * Frames default to `present` — the normal case, where the full inline/stored toggle renders
 * — and capture, on that path: inline mode, stored mode with the template picker open, the
 * render-parameters editor expanded, and the catalog-load error (storage present but the
 * `/api/templates` door still 500s on this boot). Frames needing a POPULATED picker fulfil
 * `/api/templates` through `page.route`.
 *
 * The storage-ABSENT states stub `present: false`: the field offers the inline editor alone
 * (`condition-absent-inline`), or — when the saved value already names a stored template —
 * shows that id and its parameters READ-ONLY with a plain note (`condition-absent-stored`).
 * `condition-loading` holds the presence response open so the placeholder that stands in for
 * the toggle (never shown then removed) is captured.
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

/**
 * Fulfil `GET /api/storage` — the storage-presence signal the control gates its stored
 * source on. The lean e2e boot does not mount the storage router at all, so the live door
 * is unreachable and every frame stubs this to present the intended signal deterministically
 * (matching a real deployment, where the door returns `present: false` when no provider is
 * registered). `present` → a registered provider, so the full inline/stored toggle renders;
 * `absent` → `present: false`, so the control offers the inline source alone / shows a saved
 * stored id read-only; `loading` holds the response open through the capture window so the
 * presence-unknown placeholder is the frame's subject, then resolves present.
 *
 * The skeleton wraps every response in a `{ data }` envelope, which the client unwraps
 * before validating — so the stub must too, like `stubCatalog` above.
 */
async function stubStorage(page: Page, mode: 'present' | 'absent' | 'loading'): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/storage',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      if (mode === 'loading') {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
      const data =
        mode === 'absent'
          ? { present: false, provider: null, module: null }
          : { present: true, provider: 'demo', module: 'demo' };
      await route.fulfill({ json: { data } });
    },
  );
}

/** Fulfil `GET /api/hooks` with one existing hook, so its per-row Edit door opens the
 * register form PREFILLED from that hook (the same idiom the hooks-edit suite uses). */
async function stubHooksList(page: Page, items: readonly unknown[]): Promise<void> {
  await page.route(
    (url) => url.pathname === '/api/hooks',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        json: { data: { items, total: items.length, topic_verifiers: {}, trigger_auth: {} } },
      });
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
  /**
   * The storage-presence signal to serve. Default `present` (a registered provider, so
   * the full inline/stored control renders — the normal case). `absent` stubs
   * `present: false` (the inline-only / read-only-stored states). `loading` holds the
   * presence response open so the placeholder is captured.
   */
  readonly storage?: 'present' | 'absent' | 'loading';
  /** One existing hook to serve on `GET /api/hooks`, so its Edit door opens prefilled. */
  readonly hooksList?: readonly unknown[];
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
    // Storage present but the catalog door fails: the lean boot serves no
    // `/api/templates`, so switching to stored mode meets the load error (with a Retry)
    // — the control's real catalog-failure state.
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
    // Storage present, catalog door fails — the picker-load error, mirroring the
    // binding one on this screen.
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

  // --- Storage absent (stubbed present: false) ------------------------------
  {
    // No storage backend: the condition field offers the inline editor alone — no source
    // toggle, no catalog fetch, no error. That the shared error card is absent proves the
    // field makes no catalog request when storage is absent.
    name: 'condition-absent-inline',
    path: '/hooks',
    storage: 'absent',
    action: async (page) => {
      await page.getByRole('form', { name: 'Register hook' }).waitFor({ state: 'visible' });
      // The stored source is not offered where it cannot work.
      await expect(page.getByRole('radiogroup', { name: 'Condition source' })).toHaveCount(0);
    },
    ready: (page) =>
      page.getByRole('form', { name: 'Register hook' }).getByRole('textbox', { name: 'Condition' }),
    target: (page) => page.getByRole('form', { name: 'Register hook' }),
    clean: (page) => page.getByRole('form', { name: 'Register hook' }),
  },
  {
    // No storage backend, but the saved value already names a stored template: the id and
    // its render parameters are shown READ-ONLY with a plain note, the value neither
    // converted to inline nor dropped.
    name: 'condition-absent-stored',
    path: '/hooks',
    storage: 'absent',
    hooksList: [
      {
        name: 'notify-events',
        topic: 'events',
        tool: 'echo',
        execution_key: 'studio-e2e',
        tool_kwargs: {},
        condition: { id: 'welcome', kwargs: { locale: 'en' } },
        expr: null,
      },
    ],
    action: async (page) => {
      await page.getByRole('button', { name: 'Edit hook notify-events' }).click();
      await page.getByRole('dialog', { name: 'Edit hook' }).waitFor({ state: 'visible' });
      // Bring the whole Condition field (id + note + render parameters) into view so the
      // shot frames it completely rather than clipping its lower rows at the dialog edge.
      await page.getByRole('group', { name: 'Condition', exact: true }).scrollIntoViewIfNeeded();
    },
    ready: (page) => page.getByText(/no storage backend/i),
    // The control itself, so the id, its note and its parameters all sit inside the shot.
    target: (page) => page.getByRole('group', { name: 'Condition', exact: true }),
    clean: (page) => page.getByRole('dialog', { name: 'Edit hook' }),
  },
  {
    // Presence unknown: a placeholder stands in, so the toggle is never shown and then
    // removed. The presence response is held open through the capture window.
    name: 'condition-loading',
    path: '/hooks',
    storage: 'loading',
    action: async (page) => {
      const form = page.getByRole('form', { name: 'Register hook' });
      await form.waitFor({ state: 'visible' });
      // While presence is unknown neither the toggle nor the inline editor is shown.
      await expect(form.getByRole('radiogroup', { name: 'Condition source' })).toHaveCount(0);
    },
    ready: (page) =>
      page.getByRole('form', { name: 'Register hook' }).locator('.tai-skeleton').first(),
    target: (page) => page.getByRole('form', { name: 'Register hook' }),
    clean: (page) => page.getByRole('form', { name: 'Register hook' }),
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
        // Routes must be in place before the navigation whose mount fires the queries.
        // The lean boot does not serve `/api/storage`, so every frame stubs the presence
        // signal (present / absent / loading) rather than relying on a live default.
        await stubStorage(page, frame.storage ?? 'present');
        if (frame.hooksList !== undefined) await stubHooksList(page, frame.hooksList);
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
