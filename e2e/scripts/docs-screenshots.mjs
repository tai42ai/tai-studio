/**
 * docs-screenshots.mjs — capture Studio screenshots for the docs + README.
 *
 * ISOLATED CAPTURE TOOLING (not part of the Playwright test suite). It drives a
 * SKELETON THAT IS ALREADY RUNNING and serving the built Studio SPA, so it does
 * NOT use playwright.config.ts's `webServer`. The one-command runner
 * (`e2e/scripts/docs-screenshots.sh`) builds the SPA, boots the DOCS-DEMO backend
 * (`e2e/docs-demo/manifest.yml`) and then runs this script; do
 * NOT invoke it by hand — see that runner's header for the full recipe and the
 * rerun command.
 *
 * Every image is a REAL capture of the REAL running Studio. Viewport is pinned at
 * 1440x900 and each page is captured in BOTH light and dark themes. The Studio's
 * `useTheme` seeds its initial theme from `prefers-color-scheme`, so the browser
 * context's `colorScheme` selects the theme with no UI clicks.
 *
 * PAGE SET — the core Studio screens, each populated by the docs-demo backend. Each
 * `wait` selector asserts POPULATED content (a real row, card, chart, or result),
 * and every capture is guarded against the shared loud `ErrorState`
 * ("Something went wrong"): a page that renders one FAILS the run rather than
 * shipping a broken shot. Where a screen has a secondary populated signal (a
 * chart AND a breakdown, a health badge AND the kinds table), `action` waits for it too.
 *   - tools      — the tool list from `GET /api/tools` (demo/builtin tools).
 *   - tool-run   — `studio_demo_form`'s schema-driven auto-form, filled + run, so
 *                  the shot shows a populated result card (never a required-field
 *                  validation error). The auto-form is used rather than
 *                  `studio_demo_echo`'s plugin panel because core routes do not
 *                  wait on plugin load — the custom panel races the route mount —
 *                  whereas the auto-form always renders, keeping this reproducible.
 *   - extensions — the extension catalog (`ask_external`).
 *   - settings   — the config workbench from `GET /api/config/*` (settings schema).
 *   - profiles   — the Settings page's Profiles tab: the seeded `production` profile
 *                  row (name + description) from `GET /api/config/profiles`. The action
 *                  switches to the tab and waits on that row.
 *   - agents     — the registered `tools_agent` from `GET /api/agents`.
 *   - presets    — the Presets list (`GET /api/presets`): the two seeded
 *                  `studio_demo_echo` presets, the master pane rendered full-width (no
 *                  selection). The version detail is NOT shot — its version panel stamps
 *                  a server `created_at` that would churn every run.
 *   - dashboard  — the observability Dashboard (`GET /api/observability/metrics`):
 *                  the seeded docs-demo monitoring backend gives it a real trend
 *                  chart AND a by-model breakdown.
 *   - manifest   — the manifest JSON tree (non-empty `user_tools`).
 *   - templates  — the seeded templates list + the rendered detail (deep-linked).
 *   - system     — the health badge (the health router is loaded before the SPA
 *                  catch-all, so it renders ops text, not index.html) plus the
 *                  populated Plugin kinds table.
 *   - system-kinds — the same /system route scrolled to the "Plugin kinds" table,
 *                  populated from `GET /api/system/kinds`.
 *   - users-admin — the accounts plugin's users-admin page (usr-* human accounts),
 *                  mounted via `studio_plugins`, populated by the runner's seed.
 *   - conversations — the conversation monitor at its deepest level: a seeded route's
 *                  thread list beside one thread's transcript, both populated by the
 *                  real turns the runner drives through the authed api door.
 *   - hooks-trigger-link / -execution-key — the mint→QR dialog, and the register
 *                  form's execution-key picker.
 *   - login      — the credential screen, captured signed out.
 *
 * SCOPED SET — authenticated as the seeded OWNED key (a capability-scoped session),
 * so the shell renders the projection-filtered view: a trimmed nav, list slices
 * limited to the projection, and inboxes limited to the identity's audience.
 *   - scoped-tools         — `/tools` under the owned key: the trimmed nav plus the
 *                  catalog filtered to the projection's tools (one shot for both).
 *   - scoped-interactions  — `/interactions` under the owned key: only the seeded
 *                  audience-addressed question (the stream is audience-filtered).
 *   - scoped-notifications — `/notifications` under the owned key: only the seeded
 *                  audience-addressed notification (the read door is audience-filtered).
 *   - mint-claim-link      — the minted-key dialog's claim-link QR step (full key),
 *                  driven from the API-keys tab through the mint flow.
 *
 * There is deliberately NO `/login#claim=<token>` shot: the claim token is
 * single-use and burns on first load, so a mid-flight claim login is not
 * deterministically shootable — that leg is exercised by the Playwright e2e suite,
 * not here.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const STUDIO_URL = process.env.STUDIO_URL ?? 'http://127.0.0.1:8765';
const OUT_DIR = process.env.OUT_DIR;
if (!OUT_DIR) {
  console.error('OUT_DIR is required: set it to the absolute directory the screenshots write to.');
  process.exit(1);
}
const VIEWPORT = { width: 1440, height: 900 };
const WAIT_TIMEOUT = 15000;

/** sessionStorage key the SDK `useAuth` reads (mirrors e2e/tests/helpers.ts). */
const SESSION_KEY = 'tai-studio.apiKey';
/** The seeded, VALID skeleton key. Access control is ON in the boot, so the shell
 * must present a real key: the api-client sends this on every request and boot.sh
 * seeds it as a full-privilege key, so the authed feature routes both render and
 * fetch real data. It MUST equal the `STUDIO_API_KEY` boot.sh seeds — so the runner
 * (docs-screenshots.sh), which exports `STUDIO_API_KEY`, is the single source of
 * truth. The literal fallback is for running this script standalone against a
 * skeleton booted with this same key (i.e. `STUDIO_API_KEY=<this literal>`); it is
 * NOT boot.sh's own default key. */
const DEMO_KEY = process.env.STUDIO_API_KEY ?? 'sk-docs-demo-full-privilege-key';

/** The seeded SCOPED credential: an OWNED key (its `owner_user_id` is set), the
 * identity the capability-scoped shots authenticate as. Unlike `DEMO_KEY` it is a
 * raw key minted at runtime, so the runner (docs-screenshots.sh) mints it after
 * boot and exports it here — there is no static fallback. A scoped AUTHED_PAGES
 * entry carries it as `apiKey`; when any such entry is present this MUST be set,
 * else the entry would silently fall back to the full DEMO_KEY and mis-capture the
 * scoped view. The guard below turns that into a loud failure. */
const OWNED_KEY = process.env.STUDIO_OWNED_KEY;

/** The seeded conversation route and the thread inside it the Conversations shot
 * deep-links to. Both exist only at runtime — the route is created and its threads are
 * opened by real turns after boot — so the runner (docs-screenshots.sh) seeds them and
 * exports them here; there is no static fallback. Unset, the shot would deep-link a
 * route/thread that names nothing and capture an empty monitor, so it fails loudly. */
const CONVERSATION_ROUTE = process.env.STUDIO_CONVERSATION_ROUTE;
const CONVERSATION_THREAD = process.env.STUDIO_CONVERSATION_THREAD;
if (!CONVERSATION_ROUTE || !CONVERSATION_THREAD) {
  console.error(
    'STUDIO_CONVERSATION_ROUTE and STUDIO_CONVERSATION_THREAD are required: the runner ' +
      '(docs-screenshots.sh) seeds the conversation route and its threads, then exports both.',
  );
  process.exit(1);
}

/** When set (the automated CI pipeline sets it), skip the shots tagged
 * `nondeterministic` — the QR screens, whose QR encodes a freshly-minted random token
 * each run and would otherwise churn every automated regeneration. Unset for a manual
 * full run, which captures them too (for a QR-dialog UI change). */
const SKIP_NONDETERMINISTIC = process.env.SKIP_NONDETERMINISTIC_SHOTS === '1';

/** The loud, shared error card. Its presence on any page means the capture is
 * broken; the script throws rather than shooting it. */
const ERROR_SELECTOR = '[role="alert"]:has-text("Something went wrong")';

/** Take the FIRST listed execution key inside `scope`. */
async function pickFirstExecutionKey(page, scope) {
  await scope.getByRole('combobox', { name: 'Execution key' }).click();
  await page.getByRole('option').first().click();
}

/**
 * Pages captured while SIGNED IN. `wait` is a selector proving the screen rendered
 * its POPULATED content (a real row/card, not a spinner or empty state) before the
 * shot. `action`, when present, drives the page into its captured state.
 */
const AUTHED_PAGES = [
  { name: 'tools', path: '/tools', wait: 'text=studio_demo_echo' },
  {
    name: 'tool-run',
    path: '/tools?tool=studio_demo_form',
    // The schema-driven auto-form (its "Run in background" button is unique to it).
    wait: 'button:has-text("Run in background")',
    // Fill the required `name` field with a real value, then run the tool, and
    // wait for the result card — a real, populated result, never an empty form
    // with a "required" validation error.
    action: async (page) => {
      await page.getByLabel('name', { exact: true }).fill('Ada');
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await page.locator('text=Result').first().waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  { name: 'extensions', path: '/extensions', wait: 'text=ask_external' },
  { name: 'settings', path: '/settings', wait: 'text=LoggingSettings' },
  {
    // The Settings page's Profiles tab. The Settings tab renders first (its
    // `LoggingSettings` schema is the page's populated signal); the action then clicks
    // the Profiles tab (role=tab, same pattern as mint-claim-link's "API keys" click)
    // and waits on the seeded `production` profile's row so the shot frames the
    // populated profiles table, never an empty tab. Deterministic — the row (name +
    // description, one secret-marked env key) comes entirely from the pinned seed, so
    // NO `nondeterministic` flag.
    name: 'profiles',
    path: '/settings',
    wait: 'text=LoggingSettings',
    action: async (page) => {
      await page.getByRole('tab', { name: 'Profiles' }).click();
      await page
        .locator('[data-testid="profile-row-production"]')
        .waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  // The registered demo agent renders one row per agent (`data-testid`).
  { name: 'agents', path: '/agents', wait: '[data-testid="agent-row"]' },
  {
    // The Presets screen's list — the two seeded `studio_demo_echo` presets (name +
    // fixed `message`), rendered by the presets router the docs-demo manifest mounts.
    // With NO `?preset=` selection the list is the FULL-WIDTH master pane; the detail
    // is deliberately not shot because its version-history panel renders each version's
    // server-stamped `created_at` (a per-run churn). The list columns (Name, Base tool,
    // Description, Active version, Tags, Combos) carry no timestamps, so this shot is
    // deterministic — NO `nondeterministic` flag. Waits on the first seeded row, and
    // the action requires the second so the frame is always the full seeded table.
    name: 'presets',
    path: '/presets',
    wait: '[data-testid="preset-row-morning_greeting"]',
    action: async (page) => {
      await page
        .locator('[data-testid="preset-row-shift_handover"]')
        .waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    name: 'dashboard',
    path: '/observability',
    // The trend AreaChart renders only with a non-empty time series (real seeded
    // data), so its aria-label is proof the Dashboard is populated, not zeroed.
    wait: '[aria-label^="Runs over time"]',
    // Also require the by-model breakdown (a non-empty `byModel` result) so the
    // shot always carries both the trend and the "Cost by model" bars.
    action: async (page) => {
      await page
        .locator('[aria-label="Cost by model"]')
        .waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  // A non-empty `user_tools` renders the manifest JSON tree with that key.
  { name: 'manifest', path: '/manifest', wait: 'text=user_tools' },
  {
    name: 'templates',
    path: '/templates?template=welcome-email.md',
    // The seeded template's list link (list pane is populated).
    wait: '[aria-label="Open template welcome-email.md"]',
    // The deep link opens the detail pane; wait for the rendered template body so
    // NEITHER pane is an empty state ("No template selected").
    action: async (page) => {
      await page.locator('text=Subject:').first().waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    name: 'system',
    // The Health badge (liveness probe) is the primary populated signal.
    path: '/system',
    wait: 'text=Healthy',
    // Also require a populated Plugin kinds row (the accounts provider string, which
    // only the kinds table carries) so the shot shows the ops page rendered with real
    // data, not the SPA index.html document.
    action: async (page) => {
      await page
        .locator('text=accounts-postgres')
        .first()
        .waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    // The System page's "Plugin kinds" table — the same /system route as
    // above, but scrolled to and focused on the kinds card. The card queries
    // `GET /api/system/kinds` (the docs-demo mounts `system_kinds`), which always
    // returns nine rows; a failed query renders the card's own inline ErrorState
    // (NOT the global "Something went wrong" guard), so the wait selector below is
    // what proves the table is POPULATED — the accounts row's serving provider
    // `accounts-postgres`, a string only the kinds table carries.
    name: 'system-kinds',
    path: '/system',
    wait: 'text=accounts-postgres',
    // Scroll the "Plugin kinds" card to the top of the viewport so the shot frames
    // the full kinds table rather than the health card at the top of the page. A
    // forced `scrollIntoView({ block: 'start' })` is used over `scrollIntoViewIfNeeded`
    // because the card heading already sits within the 900px viewport, so the
    // conditional scroll would no-op and leave most of the table below the fold.
    action: async (page) => {
      await page.locator('h2:has-text("Plugin kinds")').evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      });
    },
  },
  {
    // The accounts plugin's users-admin page mounted in the Studio shell (route
    // `/plugins/tai42_accounts_postgres/users`). The runner seeds a realistic set of
    // human accounts (an admin owner + editor/viewer + a pending invite) before
    // capture, so the users table is non-empty. The wait selector is the seeded
    // owner's email cell — proof of a real populated row, never the "No users yet"
    // empty state.
    name: 'users-admin',
    path: '/plugins/tai42_accounts_postgres/users',
    wait: 'text=ada.lovelace@demo.tai',
  },
  {
    // The conversation monitor at its deepest level — the master/detail split the docs
    // describe — reached by the deep link the page's own thread rows write: the seeded
    // route's thread list on the leading edge, the seeded thread's transcript beside it.
    // The wait is the threads TABLE, which renders only for a non-empty listing (an empty
    // route renders "No threads yet" instead), and the action requires a rendered exchange
    // so the detail pane is a real transcript rather than a skeleton or an empty state.
    //
    // Nondeterministic: both panes label their instants RELATIVELY ("now", "2 minutes
    // ago") against the moment of capture, and the records are stamped server-side when
    // the runner drives their turns — so the labels differ every run. Gated out of the
    // automated pipeline (SKIP_NONDETERMINISTIC_SHOTS); recaptured on a manual full run
    // when the monitor's UI changes.
    name: 'conversations',
    nondeterministic: true,
    path: `/conversations?route=${encodeURIComponent(CONVERSATION_ROUTE)}&thread=${encodeURIComponent(CONVERSATION_THREAD)}`,
    wait: '[data-testid="conversation-threads-table"]',
    action: async (page) => {
      await page
        .locator('[data-testid="conversation-exchange"]')
        .first()
        .waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  // --- Capability-scoped screens (authenticated as the seeded OWNED key) -------
  // These four carry `apiKey: OWNED_KEY`, so they render the scoped projection's
  // filtered view rather than the full-admin one. The owned key is NOT a full
  // projection, so its shell loads no plugins (the plugin registry is unprojected)
  // — the runner therefore skips the plugin-nav wait for them.
  {
    // The scoped tools page: the catalog is filtered to the projection's tools, and
    // the nav itself is trimmed to the covered tokens — this one shot demonstrates
    // both, so no separate scoped-nav shot is taken. Waits on a tool the owned key's
    // projection covers (present in both the full and the scoped catalog).
    name: 'scoped-tools',
    path: '/tools',
    apiKey: OWNED_KEY,
    wait: 'text=studio_demo_echo',
  },
  {
    // The scoped interactions inbox: the server stream is audience-filtered to the
    // owned identity, so only the seeded audience-addressed question renders. Waits
    // on that question's text (seeded by docs-screenshots.sh).
    name: 'scoped-interactions',
    path: '/interactions',
    apiKey: OWNED_KEY,
    wait: 'text=Approve the staging deploy',
  },
  {
    // The scoped notifications inbox: the read door is audience-filtered to the owned
    // identity, so only the seeded audience-addressed notification renders. Waits on
    // that notification's message (seeded by docs-screenshots.sh).
    //
    // Nondeterministic: the row renders its `created_at`, which the sink stamps
    // server-side (`datetime.now()`) at seed time — so the shown timestamp differs every
    // run. Gated out of the automated pipeline (SKIP_NONDETERMINISTIC_SHOTS); recaptured
    // on a manual full run when the inbox UI changes.
    name: 'scoped-notifications',
    nondeterministic: true,
    path: '/notifications',
    apiKey: OWNED_KEY,
    wait: 'text=Your nightly export finished',
  },
  {
    // The mint → claim-link flow: driven with the FULL key (only a full/mintable
    // projection shows the create control), the shot frames the minted-key dialog's
    // QR step. The action opens the API-keys tab, mints a key, then turns it into a
    // one-time claim link; it waits on the rendered QR svg.
    //
    // Nondeterministic: the QR encodes a freshly-minted random token every run, so the
    // automated pipeline skips it (SKIP_NONDETERMINISTIC_SHOTS) to avoid churny diffs on
    // every run; it is recaptured only on a manual full run when the dialog UI changes.
    name: 'mint-claim-link',
    nondeterministic: true,
    path: '/settings',
    wait: 'text=LoggingSettings',
    // The action opens a modal dialog, which makes the background nav inert
    // (aria-hidden) — so the plugin-sidebar wait would time out and is meaningless
    // for a modal-framed shot. Skip it; the action's QR wait is the stable signal.
    awaitPluginNav: false,
    action: async (page) => {
      await page.getByRole('tab', { name: 'API keys' }).click();
      await page.getByRole('button', { name: 'Create key' }).click();
      // A UNIQUE user_id per invocation: the mint door rejects a duplicate, and this
      // action runs once per theme against the SAME live backend, so a fixed id would
      // 400 on the second pass. The id is cosmetic here — the shot frames the minted-
      // key dialog's QR, not the create form.
      await page.getByLabel('User ID').fill(`svc-demo-${Date.now()}`);
      await page.getByLabel('Description').fill('Demo service key');
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.getByRole('button', { name: 'Create claim link (QR)' }).click();
      await page
        .locator('[data-testid="claim-link-qr"]')
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    },
  },
  {
    // The trigger-link create flow: driven with the FULL key (the section + create
    // control show for a full/admin projection), the shot frames the create dialog's
    // QR step. Like the claim-link shot, the modal makes the background nav inert,
    // so the plugin-nav wait is skipped and the QR wait is the stable signal.
    //
    // The Name is left blank on purpose: the light and dark passes run against the
    // same booted server, so a fixed name would be taken on the second pass and the
    // create would fail. Blank lets the server mint a unique name each pass (the QR
    // step frames only the URL + QR, so the name never shows in the shot).
    //
    // Nondeterministic (like mint-claim-link): the QR encodes a freshly-minted random
    // token every run, so the automated pipeline skips it (SKIP_NONDETERMINISTIC_SHOTS).
    name: 'hooks-trigger-link',
    nondeterministic: true,
    path: '/hooks',
    wait: 'text=Trigger links',
    awaitPluginNav: false,
    action: async (page) => {
      await page.getByRole('button', { name: 'Create trigger link' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Topic').fill('events.created');
      await pickFirstExecutionKey(page, dialog);
      await dialog.getByRole('radio', { name: 'Permanent' }).click();
      await dialog.getByLabel('Tool params (JSON)').fill('{ "priority": "high" }');
      await dialog.getByRole('button', { name: 'Create link' }).click();
      await page
        .locator('[data-testid="trigger-link-qr"]')
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    },
  },
  {
    // The register form's execution-key picker with a key chosen. Nothing is
    // submitted: a hook would survive into the second pass.
    //
    // Nondeterministic: the shot frames the FIRST execution key the picker lists, and
    // the key list is ordered by the keys' server-stamped creation time, so which key is
    // first varies run to run. Gated out of the automated pipeline
    // (SKIP_NONDETERMINISTIC_SHOTS); recaptured on a manual full run when the form UI
    // changes.
    name: 'hooks-execution-key',
    nondeterministic: true,
    path: '/hooks',
    wait: 'text=Register hook',
    action: async (page) => {
      const form = page.getByRole('form', { name: 'Register hook' });
      await form.getByLabel('Name').fill('notify-on-event');
      await form.getByLabel('Topic').fill('events.created');
      await form.getByLabel('Tool', { exact: true }).fill('slack.post_message');
      await pickFirstExecutionKey(page, form);
      // Wait on the picked value so the shot shows a bound key, not the placeholder.
      await form
        .getByRole('combobox', { name: 'Execution key' })
        .filter({ hasNotText: 'Select an execution key' })
        .waitFor({ state: 'visible', timeout: 8000 });
    },
  },
];

/** The credential screen — captured SIGNED OUT (no seeded key). */
const PUBLIC_PAGES = [{ name: 'login', path: '/login', wait: 'text=Sign in to the Studio' }];

// An entry that declares `apiKey` MUST resolve to a real key: a present-but-empty
// override (the runner did not export STUDIO_OWNED_KEY) would otherwise fall back
// to the full DEMO_KEY and silently mis-capture the scoped view. Fail loudly here.
const missingKey = AUTHED_PAGES.find((entry) => 'apiKey' in entry && !entry.apiKey);
if (missingKey) {
  console.error(
    `${missingKey.name} declares a scoped apiKey but STUDIO_OWNED_KEY is unset — ` +
      'the runner (docs-screenshots.sh) mints and exports it before capture.',
  );
  process.exit(1);
}

const THEMES = /** @type {const} */ (['light', 'dark']);

/**
 * Wait until the page settles into EITHER its populated content or the loud error
 * card, then assert it is the populated one. A page that only errors, or never
 * renders its content, throws — no broken shot is ever captured.
 */
async function waitForPopulated(page, entry, theme) {
  const populated = page.locator(entry.wait).first();
  const errored = page.locator(ERROR_SELECTOR).first();
  // The race only needs the FIRST of the two to appear. Each waiter RESOLVES a
  // tag on either outcome (visible → its name, timeout → 'timeout') instead of
  // throwing, so the losing waiter's later timeout is a resolved value that is
  // simply discarded — no exception is ever swallowed, and no empty catch is
  // needed. The real outcome is re-asserted explicitly below.
  const settle = (locator, tag) =>
    locator.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT }).then(
      () => tag,
      () => 'timeout',
    );
  await Promise.race([settle(populated, 'populated'), settle(errored, 'errored')]);

  if (await errored.isVisible()) {
    throw new Error(
      `${entry.name} (${theme}) rendered an error card ("Something went wrong") — refusing to ship a broken screenshot`,
    );
  }
  if (!(await populated.isVisible())) {
    throw new Error(
      `${entry.name} (${theme}) never rendered its populated content ("${entry.wait}") — refusing to ship a broken screenshot`,
    );
  }
}

async function shoot(page, entry, theme, { awaitPluginNav }) {
  const url = `${STUDIO_URL}${entry.path}`;
  // `domcontentloaded`, not `networkidle`: the shell's InteractionsBadge holds a
  // persistent SSE stream open, so the network never goes idle.
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForPopulated(page, entry, theme);
  if (entry.action) await entry.action(page);
  // Deterministic sidebar: the reference plugin's "Reference" nav entry appears
  // only once the shell's plugin loader has committed the plugin's contributions,
  // which races the async bundle load. Every signed-in shot renders that sidebar,
  // so wait for the entry before shooting — otherwise the sidebar is present in
  // some shots and missing in others. The demo boot always loads the reference
  // plugin, so this entry always resolves.
  if (awaitPluginNav) {
    await page
      .getByRole('navigation', { name: 'Plugins' })
      .getByRole('link', { name: 'Reference' })
      .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  }
  // Let fonts/layout settle.
  await page.waitForTimeout(600);
  const file = `${OUT_DIR}/${entry.name}-${theme}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  ✓ ${file}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  // `--font-render-hinting=none` pins glyph rasterization to unhinted sub-pixel
  // geometry, so text renders identically regardless of the host's font-hinting
  // config and a regenerated shot diffs only where the UI actually changed.
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });

  for (const theme of THEMES) {
    console.log(`theme: ${theme}`);

    // Signed-in contexts, one per distinct credential (created lazily, reused). A
    // page's optional `apiKey` overrides the default full-privilege DEMO_KEY, so a
    // scoped/owned-key shot authenticates as that identity and renders its
    // capability-filtered view. The credential is seeded into sessionStorage BEFORE
    // any page script runs, so the shell reads it on first paint.
    const authedContexts = new Map();
    const contextForKey = async (key) => {
      const existing = authedContexts.get(key);
      if (existing) return existing;
      const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: theme });
      await context.addInitScript(
        ([k, v]) => globalThis.sessionStorage.setItem(k, v),
        [SESSION_KEY, key],
      );
      authedContexts.set(key, context);
      return context;
    };

    for (const entry of AUTHED_PAGES) {
      // The automated pipeline skips the inherently-nondeterministic shots (a QR of a
      // freshly-minted random token) so re-runs don't churn; a manual full run
      // (SKIP_NONDETERMINISTIC_SHOTS unset) captures them when their dialog UI changes.
      if (SKIP_NONDETERMINISTIC && entry.nondeterministic) continue;
      const key = entry.apiKey ?? DEMO_KEY;
      const page = await (await contextForKey(key)).newPage();
      // Only the FULL-privilege session loads plugins (a scoped projection leaves the
      // plugin registry unprojected, so the shell skips it), so the plugin sidebar's
      // "Reference" nav entry is awaited only for the default key — a scoped shot
      // never renders it and must not wait on it. An entry may opt out explicitly
      // (`awaitPluginNav: false`) when its action opens a modal that hides the nav.
      const awaitPluginNav = entry.awaitPluginNav ?? key === DEMO_KEY;
      await shoot(page, entry, theme, { awaitPluginNav });
      await page.close();
    }
    for (const context of authedContexts.values()) await context.close();

    // Signed-out context for the login screen — no shell, so no plugin sidebar.
    const guest = await browser.newContext({ viewport: VIEWPORT, colorScheme: theme });
    const guestPage = await guest.newPage();
    for (const entry of PUBLIC_PAGES)
      await shoot(guestPage, entry, theme, { awaitPluginNav: false });
    await guest.close();
  }

  await browser.close();
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
