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
 *   - settings-access — the API keys tab's "Access control" card (the scopes mapper):
 *                  the scope zones, the Unassigned bucket of unmapped routes, and the Public
 *                  zone with its note, captured as the whole card.
 *   - agents     — the registered `tools_agent` from `GET /api/agents`.
 *   - presets    — the Presets list (`GET /api/presets`): the two seeded
 *                  `studio_demo_echo` presets, the master pane rendered full-width (no
 *                  selection). The version detail is NOT shot — its version panel stamps
 *                  a server `created_at` that would churn every run.
 *   - states-{list,declaration,templates,records,consumers,record} — the platform state
 *                  store (`GET /api/states*`, `/api/state-templates`): the seeded `notes`
 *                  state's list row, its Declaration / Templates / Records / Consumers
 *                  tabs, and one subject's record page (document + `api` Writes audit).
 *   - dashboard  — the observability Dashboard (`GET /api/observability/metrics`):
 *                  the seeded docs-demo monitoring backend gives it a real trend
 *                  chart AND a by-model breakdown.
 *   - dashboard-by-model-unavailable — the same Dashboard with the by-model card in
 *                  its degraded state, via a forced `byModelAvailable:false` payload
 *                  the live backend never returns.
 *   - tracing-sort-guard — the Tracing tab under a cost sort with the filters that sort
 *                  cannot carry disabled, via a forced `GET /api/observability/capabilities`
 *                  payload: the Langfuse reader's real served declaration (the api-client
 *                  fixture). The live demo backend declares no sort × filter exclusion, so it
 *                  never disables a filter; the runs list, the sort and the rows stay live.
 *   - trace-llm-parts — the newest seeded trace's model-call span: its input and output
 *                  messages in the parts view (the user prompt, the assistant text and the
 *                  "finish: stop" footer).
 *   - trace-references-recorded / -resolved — the newest seeded trace's `summarise` step,
 *                  whose input holds one reference to the model call's answer: the value
 *                  as recorded (the reference with its span id and pointer in the tree),
 *                  then resolved through the real resolved route.
 *   - trace-reference-missing — the same trace's `follow_up` step, whose reference names
 *                  a record the backend does not hold: the resolved route answers 502 and
 *                  the missing-value panel renders.
 *   - manifest   — the manifest JSON tree (non-empty `user_tools`).
 *   - templates  — the seeded templates list + the rendered detail (deep-linked).
 *   - system     — the health badge (the health router is loaded before the SPA
 *                  catch-all, so it renders ops text, not index.html) plus the
 *                  populated Plugin kinds table.
 *   - system-kinds — the same /system route scrolled to the "Plugin kinds" table,
 *                  populated from `GET /api/system/kinds`.
 *   - members    — the generic Members directory (`GET /api/auth/members` +
 *                  `GET /api/auth/member-actions`): the People table beside the Pending
 *                  invitations table, each row's actions joined from the declared
 *                  catalog, populated by the runner's member-action seed.
 *   - member-action-input — the page-scoped "Invite a user" action's SchemaForm over its
 *                  declared input schema (filled, not submitted — no account is created).
 *   - member-action-confirm — a destructive row action ("Remove user") stopped at its
 *                  confirm step (never confirmed, so no account is removed).
 *   - member-action-result — a row action ("Send a new login link") run live against the
 *                  seeded pending invite, framing the one-time-secret result (the minted
 *                  invite link through CopyField).
 *   - marketplace-install — the Marketplace detail page's route-mounting install
 *                  dialog for the seeded generic plugin (acme/alerts-relay): the
 *                  resolved routes, the per-item base-prefix remap input, and the
 *                  public-route acceptance checkbox, all from the minimal seeded
 *                  registry the runner boots (MARKETPLACE_URL).
 *   - conversations — the conversation monitor at its deepest level: a seeded route's
 *                  thread list beside one thread's transcript, both populated by the
 *                  real turns the runner drives through the authed api door.
 *   - conversation-inbound-attachments — a transcript whose visitor turn carries typed
 *                  inbound attachments (a served image inline, a document download chip),
 *                  via a forced transcript + served-media override the live backend never
 *                  produces.
 *   - conversation-route-agent-contract — the route CREATE dialog for an agent target,
 *                  framing the five door-contract jq fields and the execution key.
 *   - schedule-contract — the add-schedule dialog framing its door-contract section (the
 *                  execution-key picker + the four jq fields), backed by the RQ scheduling
 *                  backend the docs-demo boot installs.
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
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync } from 'node:zlib';

const STUDIO_URL = process.env.STUDIO_URL ?? 'http://127.0.0.1:8765';
const OUT_DIR = process.env.OUT_DIR;
if (!OUT_DIR) {
  console.error('OUT_DIR is required: set it to the absolute directory the screenshots write to.');
  process.exit(1);
}
const VIEWPORT = { width: 1440, height: 900 };
const WAIT_TIMEOUT = 15000;

/** Framing for a `canvas` route (see `frameCanvasContent`): the margin left around
 * the graph, and the ceiling on a capture's dimensions — a graph larger than this is
 * shrunk to fit rather than producing an unbounded shot. */
const CANVAS_PADDING = 48;
const CANVAS_MAX_DIMENSION = 4096;

/** sessionStorage key the SDK `useAuth` reads (mirrors e2e/tests/helpers.ts). */
const SESSION_KEY = 'tai-studio.apiKey';
/** The full-admin skeleton key. Access control is ON in the boot, so the shell must
 * present a real key: the api-client sends this on every request, and the authed
 * feature routes both render and fetch real data with it. The runner
 * (docs-screenshots.sh) initializes the deployment through `POST /api/setup` and
 * exports the minted owner key as `STUDIO_API_KEY` — the single source of truth. The
 * literal fallback is for running this script standalone against a skeleton whose owner
 * key is that literal (i.e. `STUDIO_API_KEY=<this literal>`). */
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

/** When set (the automated CI pipeline sets it), skip the shots tagged
 * `nondeterministic` — the QR screens, whose QR encodes a freshly-minted random token
 * each run and would otherwise churn every automated regeneration. Unset for a manual
 * full run, which captures them too (for a QR-dialog UI change). */
const SKIP_NONDETERMINISTIC = process.env.SKIP_NONDETERMINISTIC_SHOTS === '1';

/** `ONLY=name1,name2` restricts the run to those frames (signed-in and public alike),
 * so a targeted change regenerates a handful of screens without capturing the whole set.
 * Unset captures every screen. An unknown name is a loud failure, never a silent no-op.
 * Documented in docs-screenshots.sh's header. */
const ONLY = process.env.ONLY
  ? new Set(
      process.env.ONLY.split(',')
        .map((name) => name.trim())
        .filter((name) => name !== ''),
    )
  : null;

/** The loud, shared error card. Its presence on any page means the capture is
 * broken; the script throws rather than shooting it. */
const ERROR_SELECTOR = '[role="alert"]:has-text("Something went wrong")';

/** Take the FIRST listed execution key inside `scope`. */
async function pickFirstExecutionKey(page, scope) {
  await scope.getByRole('combobox', { name: 'Execution key' }).click();
  await page.getByRole('option').first().click();
}

/**
 * Open the create-preset dialog and author three fixed kwargs on the fields editor: a
 * text row, a number row, and a secret-reference row picking a seeded env key. Returns
 * the dialog locator. Shared by both preset-kwargs frames (fields + JSON view).
 *
 * The base tool is `studio_demo_form`, whose params (name/count/mood) are the row keys —
 * a preset's kwargs must name real base-tool params. The demo backend seeds no env key,
 * so an existing one is written through the real config door first; the create form's env
 * read then lists it in the picker.
 */
async function authorPresetKwargs(page) {
  await page.request.post(`${STUDIO_URL}/api/config/env`, {
    headers: { 'x-api-key': DEMO_KEY, 'content-type': 'application/json' },
    data: { env: { SERVICE_API_TOKEN: 's3cr3t' } },
  });
  await page.getByRole('button', { name: 'Create preset' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Name' }).fill('daily_digest');
  await dialog.getByRole('textbox', { name: /Description/ }).fill('Posts the daily digest.');
  await dialog.getByRole('combobox', { name: /Base tool/ }).click();
  await page.getByRole('option', { name: 'studio_demo_form' }).first().click();

  // A text row.
  await dialog.getByRole('button', { name: 'Add kwarg' }).click();
  await dialog.getByLabel('Key', { exact: true }).last().fill('name');
  await dialog.getByLabel('Value', { exact: true }).last().fill('Ada');

  // A number row.
  await dialog.getByRole('button', { name: 'Add kwarg' }).click();
  await dialog.getByLabel('Key', { exact: true }).last().fill('count');
  await dialog.getByRole('combobox', { name: 'Type' }).last().click();
  await page.getByRole('option', { name: 'Number' }).click();
  await dialog.getByLabel('Value', { exact: true }).last().fill('3');

  // A secret-reference row picking the seeded env key.
  await dialog.getByRole('button', { name: 'Add kwarg' }).click();
  await dialog.getByLabel('Key', { exact: true }).last().fill('mood');
  await dialog.getByRole('combobox', { name: 'Type' }).last().click();
  await page.getByRole('option', { name: 'Secret reference' }).click();
  await dialog.getByRole('combobox', { name: 'Secret reference' }).click();
  await page.getByRole('option', { name: 'SERVICE_API_TOKEN' }).click();
  // The committed key renders as a chip ("Change reference" replaces the picker).
  await dialog.getByRole('button', { name: 'Change reference' }).waitFor({ state: 'visible' });
  return dialog;
}

/**
 * Scroll the fixed-kwargs field to the top of the dialog so the shot frames the whole
 * editor — the "Fixed kwargs" label first, then the description, the Fields/JSON switch
 * and the rows — rather than the base-picker above it, regardless of the boot.
 */
async function frameKwargsEditor(page) {
  await page
    .getByRole('dialog')
    .getByText('Fixed kwargs', { exact: true })
    .first()
    .evaluate((el) => {
      el.scrollIntoView({ block: 'start' });
    });
}

/**
 * Pages captured while SIGNED IN. `wait` is a selector proving the screen rendered
 * its POPULATED content (a real row/card, not a spinner or empty state) before the
 * shot. `action`, when present, drives the page into its captured state. `setup`,
 * when present, runs before navigation (e.g. to register a route override that
 * forces a payload the live backend does not produce). `canvas`,
 * when true, marks a route whose main surface is a React Flow pane: the shot frames
 * the whole graph first (see `frameCanvasContent`) so a tall canvas is captured
 * complete rather than clipped at the pane's fitView min-zoom.
 */
// A forced dashboard-metrics payload for the by-model UNAVAILABLE state: the live
// demo backend returns real model activity, so `byModelAvailable` is never `false`
// there. Full shape (decoded by the hand-written `dashboardMetrics` schema) with an
// empty breakdown flagged unavailable; the summary and trend series stay truthful.
const BY_MODEL_UNAVAILABLE_METRICS = {
  summary: {
    totalRuns: 2,
    totalCost: 0.0123,
    totalTokens: 512,
    averageLatencyMs: 240,
    avgCostPerRun: 0.006,
    avgTokensPerRun: 256,
    timeToFirstTokenMs: null,
  },
  timeSeries: [
    {
      bucket: '2026-08-01T00:00:00.000Z',
      runs: 2,
      cost: 0.0123,
      avgLatencyMs: 240,
      totalTokens: 512,
    },
  ],
  byModel: [],
  byModelAvailable: false,
  granularity: 'day',
};

// A forced served-capabilities payload for the sort-guard state: the Langfuse reader's
// real served declaration (its metric sorts cannot carry the status / cost / token /
// latency / version filters), read from the api-client fixture that holds that reader's
// `capabilities_view` output. The live demo backend combines every sort with every
// filter, so it never declares an exclusion.
const LANGFUSE_CAPABILITIES = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL(
        '../../packages/api-client/fixtures/redacted/observability-capabilities.json',
        import.meta.url,
      ),
    ),
    'utf8',
  ),
);

// The newest seeded docs-demo trace: its model call records its prompt and answer in the
// GenAI parts shape, its `summarise` step references that answer, and its `follow_up` step
// references a record no trace holds.
const SEEDED_TRACE_ID = 'docs-demo-024';
const SEEDED_TRACE_PATH = `/observability?tab=tracing&trace=${SEEDED_TRACE_ID}`;
const seededSpanRow = (suffix) =>
  `[data-testid="waterfall-row"][data-span-id="${SEEDED_TRACE_ID}-${suffix}"]`;
// The newest seeded trace's prompt, the model call's input message.
const SEEDED_PROMPT = 'Summarise the incident timeline for the service outage.';
// The pointer of the `summarise` step's reference into the model call's answer.
const SEEDED_REFERENCE_POINTER = '/0/parts/0/content';

/** Select the seeded trace's span `suffix` and wait until its detail pane shows every one of `texts`. */
async function openSeededSpan(page, suffix, ...texts) {
  await page.locator(seededSpanRow(suffix)).click();
  for (const text of texts) {
    await page
      .getByTestId('span-detail')
      .getByText(text)
      .first()
      .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  }
}

/** Choose the span detail's "Resolved" view and wait until it shows `text`. */
async function showResolved(page, text) {
  const detail = page.getByTestId('span-detail');
  await detail.getByRole('radio', { name: 'Resolved' }).click();
  await detail.getByText(text).first().waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
}

// The inbound-attachments transcript is FORCED through a route override: the live demo
// backend mints no byte-backed inbound attachments, so the transcript record, its thread
// and its served-media bitmap are all stubbed to render the attachment states
// deterministically (the relative timestamps still drift, so the frame is nondeterministic).
const ATTACHMENT_TRANSCRIPT_ROUTE = 'assistant-line';
const ATTACHMENT_TRANSCRIPT_THREAD = 'assistant-line-demo';
const ATTACHMENT_TRANSCRIPT_ADDRESS = '+10000000000';
const ATTACHMENT_IMAGE_URL = `/api/interactions/media/${'b'.repeat(43)}`;
const ATTACHMENT_DOCUMENT_URL = `/api/interactions/media/${'c'.repeat(43)}`;
// The stubbed served image: a small two-tone PNG encoded here (RGB, no filter) so the
// thumbnail shows a visible picture rather than a black block or a broken-load notice.
// Built from arithmetic only, so the bytes are identical on every run.
function placeholderPng(width, height) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const band = Math.floor(((x + y) / (width + height)) * 4) % 2 === 0;
      const [r, g, b] = band ? [203, 213, 225] : [148, 163, 184];
      const px = row + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const ATTACHMENT_PNG = placeholderPng(240, 150);
const ATTACHMENT_TRANSCRIPT_RECORD = {
  message_id: 'm-201',
  route_name: ATTACHMENT_TRANSCRIPT_ROUTE,
  door: 'channel',
  thread_id: ATTACHMENT_TRANSCRIPT_THREAD,
  client_address: ATTACHMENT_TRANSCRIPT_ADDRESS,
  caller_principal: null,
  origin: 'client',
  inbound_text: 'here are the files you asked for',
  inbound_attachments: [
    { kind: 'image', url: ATTACHMENT_IMAGE_URL, caption: 'the layout' },
    { kind: 'document', url: ATTACHMENT_DOCUMENT_URL, filename: 'report.pdf' },
  ],
  answer_status: 'answered',
  answer: 'Thanks — received.',
  successor_id: null,
  delivery_status: 'delivered',
  created_at: 1_800_000_010,
  updated_at: 1_800_000_011,
};

/** One paged read-door envelope shaped as the doors return it. */
function attachmentPageOf(items, extra = {}) {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 100,
    next_page: null,
    truncated: false,
    ...extra,
  };
}

const AUTHED_PAGES = [
  // The ExplorerView count summary ("N tools") proves the catalog rendered populated.
  // A specific tool NAME is not used as the marker: the explorer paginates at 24/page
  // (the default) and the demo registers more than a page of tools, so any one tool can
  // sit past page 1 and time out. The count summary lives in the controls header,
  // outside the paged body, and the [1-9] floor keeps the check strict (an empty catalog
  // renders no count at all, so a broken/empty screen still fails loudly).
  { name: 'tools', path: '/tools', wait: 'text=/[1-9]\\d* tools\\b/' },
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
  {
    // The run panel's optional Subject section, expanded: the target select, the kind
    // and key fields, and the caption. Collapsed by default, so the action opens it and
    // waits on the Subject kind field as the populated signal. Nothing is run, so no
    // backend state is touched and the frame is deterministic.
    name: 'run-subject',
    path: '/tools?tool=studio_demo_form',
    wait: 'button:has-text("Run in background")',
    action: async (page) => {
      await page.getByRole('button', { name: 'Subject (optional)' }).click();
      await page.getByLabel('Subject kind').waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    // The run panel's caller-asks result: `parking_ask` asks the caller and parks, so the
    // synchronous run returns the caller-asks envelope the panel lists (one read-only row
    // per ask — its prompt and copyable id). A caller ask is subject-indexed, so the
    // Subject section is filled against the seeded `tool · studio_demo_echo` route first.
    name: 'run-caller-asks',
    path: '/tools?tool=parking_ask',
    wait: 'button:has-text("Run in background")',
    action: async (page) => {
      await page.getByLabel(/^prompt$/i).fill('Approve this step before it continues?');
      await page.getByRole('button', { name: 'Subject (optional)' }).click();
      await page.getByRole('combobox', { name: 'Target' }).click();
      await page.getByRole('option', { name: 'tool · studio_demo_echo' }).first().click();
      await page.getByLabel('Subject kind').fill('thread');
      await page.getByLabel('Subject key').fill('a-42');
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      const list = page.getByTestId('asks-list');
      await list.waitFor({ state: 'visible', timeout: 8000 });
      await list.scrollIntoViewIfNeeded();
    },
  },
  {
    // Many long caller asks in one run: `parking_ask` parks `count` asks, so the panel's
    // asks list truncates each prompt to one line and scrolls within its bounded height
    // rather than growing the panel unbounded.
    name: 'run-caller-asks-many',
    path: '/tools?tool=parking_ask',
    wait: 'button:has-text("Run in background")',
    action: async (page) => {
      await page
        .getByLabel(/^prompt$/i)
        .fill(
          'Please review and confirm this step of the long-running multi-stage run before it proceeds onward to the next stage and continues',
        );
      await page.getByLabel(/^count$/i).fill('10');
      await page.getByRole('button', { name: 'Subject (optional)' }).click();
      await page.getByRole('combobox', { name: 'Target' }).click();
      await page.getByRole('option', { name: 'tool · studio_demo_echo' }).first().click();
      await page.getByLabel('Subject kind').fill('thread');
      await page.getByLabel('Subject key').fill('a-43');
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      const list = page.getByTestId('asks-list');
      await list.waitFor({ state: 'visible', timeout: 8000 });
      await list.scrollIntoViewIfNeeded();
    },
  },
  {
    // The conversation-route CREATE dialog for an AGENT target, framing the door-contract
    // section: the five inline jq fields (Start / Reply / Cancel / Resume / Extras) an
    // asking route carries, plus the execution key. The action opens the dialog, picks an
    // agent target and a channel door, fills the required delivery fields, then scrolls the
    // door-contract section into view. Nothing is submitted, so no backend state is touched
    // and the frame is deterministic (the seeded route makes the page's Create button show,
    // but the dialog's own fields are all blank/typed here).
    name: 'conversation-route-agent-contract',
    path: '/conversations',
    wait: 'button:has-text("Create route")',
    // The dialog is modal (the background nav goes inert), so the plugin-nav wait is
    // meaningless — the dialog's own waits are the stable signal.
    awaitPluginNav: false,
    action: async (page) => {
      await page.getByRole('button', { name: 'Create route' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox', { name: 'Route name' }).fill('events');
      const pickVariant = async (groupName, optionName) => {
        await dialog.getByRole('group', { name: groupName }).getByRole('combobox').click();
        await page.getByRole('option', { name: optionName }).click();
      };
      await pickVariant('Target', 'agent');
      await dialog.getByRole('textbox', { name: /^Agent name\b/ }).fill('assistant');
      await pickVariant('Door', 'channel');
      await dialog.getByRole('textbox', { name: /^Channel\b/ }).fill('whatsapp');
      await dialog.getByRole('textbox', { name: /^Our identity\b/ }).fill('+15550000000');
      await dialog.getByRole('textbox', { name: 'Execution key' }).fill('svc-events');
      // The door-contract jq fields are the shot's subject: wait on the Reply-expression
      // field and scroll it into view so the section is framed.
      const contractField = dialog.getByText('Reply expression', { exact: true });
      await contractField.waitFor({ state: 'visible', timeout: 8000 });
      await contractField.scrollIntoViewIfNeeded();
    },
  },
  {
    // The add-schedule dialog framing its door-contract section: the execution-key picker
    // (the identity a recurring fire runs as) and the four door-contract jq fields (Start /
    // Cancel / Resume / Extras) a parkable-driving schedule carries. Needs the scheduling
    // backend the docs-demo boot installs so `GET /api/schedules` answers 200 and the page
    // offers the create dialog. The action opens the dialog, fills a name / tool / cron,
    // picks the first execution key, then waits on the contract section. Nothing is
    // submitted, so no schedule is created and the frame is deterministic.
    name: 'schedule-contract',
    path: '/scheduling',
    wait: 'button:has-text("Add schedule")',
    // The dialog is modal (background nav inert), so the plugin-nav wait is meaningless.
    awaitPluginNav: false,
    action: async (page) => {
      await page.getByRole('button', { name: 'Add schedule' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add schedule' });
      await dialog.getByLabel('Name').fill('nightly-refresh');
      await dialog.getByRole('combobox', { name: 'Tool' }).click();
      await page.getByRole('option', { name: 'studio_demo_echo' }).click();
      await dialog.getByLabel('Cron expression').fill('0 2 * * *');
      // The door-contract section is the shot's subject: its execution-key picker is the
      // section's stable, unique signal (the jq field labels appear twice — a Field label
      // and the visual jq editor's own label). Pick the first key so the shot shows a bound
      // execution identity beside the four jq fields.
      const executionKey = dialog.getByRole('combobox', { name: 'Execution key' });
      await executionKey.waitFor({ state: 'visible', timeout: 8000 });
      await executionKey.click();
      await page.getByRole('option').first().click();
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
  {
    // The API keys tab's "Access control" card: the scopes mapper with its scope zones,
    // the Unassigned bucket (every unmapped route the server lists) and the Public zone
    // with its note. The card is far taller than the viewport, so `frame` captures the
    // whole card rather than a viewport slice. The action waits on the Public zone's
    // note, the last thing the card renders once its three reads have settled.
    // Deterministic: every zone comes from the boot's route table and seeded mappings,
    // so NO `nondeterministic` flag.
    name: 'settings-access',
    path: '/settings',
    wait: 'text=LoggingSettings',
    action: async (page) => {
      await page.getByRole('tab', { name: 'API keys' }).click();
      await page
        .getByText('Public routes are served without API-key authentication')
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    },
    frame: (page) =>
      page
        .locator('.tai-card')
        .filter({ has: page.getByRole('heading', { name: 'Access control', level: 3 }) }),
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
    // The create-preset dialog's fixed-kwargs editor in its FIELDS view: a text row, a
    // number row, and a secret-reference row showing the committed env-key chip. The
    // dialog is modal (background nav inert), so the plugin-nav wait is skipped.
    name: 'preset-kwargs-fields',
    path: '/presets',
    wait: 'button:has-text("Create preset")',
    awaitPluginNav: false,
    action: async (page) => {
      await authorPresetKwargs(page);
      await frameKwargsEditor(page);
    },
  },
  {
    // The same authored kwargs, shown in the raw JSON view — the escape hatch for the
    // non-scalar values the rows do not edit inline.
    name: 'preset-kwargs-json',
    path: '/presets',
    wait: 'button:has-text("Create preset")',
    awaitPluginNav: false,
    action: async (page) => {
      const dialog = await authorPresetKwargs(page);
      await dialog.getByRole('button', { name: 'JSON' }).click();
      await dialog.getByLabel('Fixed kwargs JSON').waitFor({ state: 'visible', timeout: 8000 });
      await frameKwargsEditor(page);
    },
  },
  // --- States screens (the platform state store) -------------------------------
  // The six frames the docs "## States" section shows, all under the seeded `notes`
  // state (the `docs-screenshots.sh` state-store seeding declares it, attaches a template, writes two subject
  // records and registers a consumer hook). Each waits on a stable, populated element —
  // a table row, a tab's populated control, or the record page's own document/audit —
  // never a bare timeout. The content is deterministic (no server timestamp is in
  // frame), so NONE carry the `nondeterministic` flag.
  {
    // The states master list: the declared `notes` row with its subject-kind badges and
    // record/consumer counts.
    name: 'states-list',
    path: '/states',
    wait: '[data-testid="state-row-notes"]',
  },
  {
    // The Declaration tab: the base schema field tree beside the subject section (the
    // attached `preferences` subtree shows read-only). Waits on the subject-kinds control,
    // which only the loaded declaration renders.
    name: 'states-declaration',
    path: '/states?state=notes',
    wait: '[aria-label="Subject kinds"]',
  },
  {
    // The Templates tab: the state's attachments above the platform state templates. Waits on
    // the attached template name, rendered only for a non-empty attachments table.
    name: 'states-templates',
    path: '/states?state=notes&tab=templates',
    wait: 'text=preferences',
  },
  {
    // The Records tab: the subject lookup form above the state's subjects. The subjects
    // browser loads the default kind (`thread`) on mount, so the seeded subject key
    // proves the list rendered populated.
    name: 'states-records',
    path: '/states?state=notes&tab=records',
    wait: 'text=t-001',
  },
  {
    // The Consumers tab: everything that binds the state. Waits on the seeded hook's name
    // (the schedule family renders a muted unavailable row beside it — no backend here).
    name: 'states-consumers',
    path: '/states?state=notes&tab=consumers',
    wait: 'text=notes-updater',
  },
  {
    // The record page for one subject: its document, the fold-into card, and the Writes
    // audit. `t-002` was grown by a `set_by_key` delta, so the audit carries an `api`
    // row. Waits on the loaded document (the Erase action shows only for a real record),
    // then requires the `api` write badge so the audit table is framed populated.
    name: 'states-record',
    path: '/states?state=notes&subject=thread:t-002&target=tool:studio_demo_echo',
    wait: 'button:has-text("Erase")',
    action: async (page) => {
      await page
        .getByText('api', { exact: true })
        .first()
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
  {
    name: 'dashboard-by-model-unavailable',
    path: '/observability',
    // The by-model card's degraded state: the notice text is the populated signal,
    // proving the card resolved to the unavailable branch rather than empty bars.
    wait: 'text=Per-model breakdown is unavailable for this range.',
    // Force the metrics fetch to a payload the live backend never returns, so the
    // unavailable branch renders deterministically (same override the e2e spec uses).
    // Matched on the pathname: the request carries a range query string.
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/observability/metrics',
        (route) => route.fulfill({ json: { data: BY_MODEL_UNAVAILABLE_METRICS } }),
      );
    },
    // The card sits below the fold; centre the notice so the shot shows it.
    action: async (page) => {
      await page
        .getByText('Per-model breakdown is unavailable for this range.')
        .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    },
  },
  {
    name: 'tracing-sort-guard',
    path: '/observability?tab=tracing&sort=cost&dir=desc',
    // A seeded run row: the runs list is the live demo backend's, under the live cost sort.
    wait: '[data-testid^="run-row-docs-demo-"]',
    // Force the served capabilities to a declaration the live demo backend never makes
    // (the Langfuse reader's real one), so the filters a cost sort cannot carry render
    // disabled. Matched on the pathname, registered before navigation.
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/observability/capabilities',
        (route) => route.fulfill({ json: { data: LANGFUSE_CAPABILITIES } }),
      );
    },
    // The guard is the shot: refuse to capture unless the excluded filters are disabled.
    action: async (page) => {
      for (const label of ['Min cost', 'Max latency (ms)']) {
        await page
          .getByLabel(label)
          .and(page.locator(':disabled'))
          .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT })
          .catch((error) => {
            throw new Error(
              `tracing-sort-guard: the "${label}" filter is not disabled under the cost sort — refusing to ship a wrong screenshot`,
              { cause: error },
            );
          });
      }
    },
  },
  {
    name: 'trace-llm-parts',
    path: SEEDED_TRACE_PATH,
    wait: seededSpanRow('gen'),
    action: async (page) => {
      await openSeededSpan(page, 'gen', SEEDED_PROMPT, 'finish: stop');
    },
  },
  {
    name: 'trace-references-recorded',
    path: SEEDED_TRACE_PATH,
    wait: seededSpanRow('summarise'),
    action: async (page) => {
      await openSeededSpan(
        page,
        'summarise',
        'Recorded with 1 reference to other steps.',
        SEEDED_REFERENCE_POINTER,
      );
    },
  },
  {
    name: 'trace-references-resolved',
    path: SEEDED_TRACE_PATH,
    wait: seededSpanRow('summarise'),
    action: async (page) => {
      await openSeededSpan(page, 'summarise', 'Recorded with 1 reference to other steps.');
      await showResolved(page, 'Full value assembled from 1 reference.');
    },
  },
  {
    name: 'trace-reference-missing',
    path: SEEDED_TRACE_PATH,
    wait: seededSpanRow('follow-up'),
    action: async (page) => {
      await openSeededSpan(page, 'follow-up', 'Recorded with 1 reference to other steps.');
      await showResolved(page, 'A referenced value is missing from the monitoring backend');
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
    // The generic Members directory (`/members`): the People table — the deployment's
    // people aggregated across every accounts provider by `GET /api/auth/members` — beside
    // the Pending invitations table, each row's actions joined from the declared
    // `GET /api/auth/member-actions` catalog. The runner seeds a realistic membership (an
    // admin owner + an active editor and viewer + a pending invite) before capture, so both
    // tables are populated. Waits on the seeded owner's People row, and the action requires
    // the seeded pending invite row so both sections are framed populated.
    name: 'members',
    path: '/members',
    wait: 'text=ada.lovelace@demo.tai',
    action: async (page) => {
      await page
        .locator('[data-testid="invite-row"]')
        .first()
        .waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    // A member action's INPUT dialog: the page-scoped "Invite a user" action opens the
    // platform `SchemaForm` over the action's declared input schema (Email + Role). Filled,
    // never submitted, so no account is created and the frame is deterministic. The dialog is
    // modal (background nav inert), so the plugin-nav wait is skipped.
    name: 'member-action-input',
    path: '/members',
    wait: 'text=ada.lovelace@demo.tai',
    awaitPluginNav: false,
    action: async (page) => {
      await page
        .getByRole('group', { name: 'Member actions' })
        .getByRole('button', { name: 'Invite a user' })
        .click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Email', { exact: true }).fill('newcomer@demo.tai');
      await dialog.getByLabel('Role', { exact: true }).fill('editor');
      await dialog.getByLabel('Role', { exact: true }).waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    // A destructive member action's CONFIRM step: "Remove user" on a member row asks the
    // operator to confirm before it runs (the loud destructive guard). Opened to the confirm
    // step, never confirmed, so no account is removed and the frame is deterministic. Modal —
    // background nav inert.
    name: 'member-action-confirm',
    path: '/members',
    wait: 'text=alan.turing@demo.tai',
    awaitPluginNav: false,
    action: async (page) => {
      await page
        .getByRole('group', { name: 'Actions for alan.turing@demo.tai' })
        .getByRole('button', { name: 'Remove user' })
        .click();
      await page.getByRole('dialog').getByRole('button', { name: 'Remove user' }).click();
      await page
        .locator('[data-testid="member-action-confirm"]')
        .waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    // A member action's RESULT view carrying a one-time secret: "Send a new login link" on a
    // pending invite row mints a fresh invite and shows the raw token + login path through
    // `CopyField` (undismissable, shown-once). Driven live against the seeded pending invite;
    // the mint replaces that invite's token, so it is re-runnable across the two theme passes.
    //
    // Nondeterministic: the minted invite token differs every run, so the automated pipeline
    // skips it (SKIP_NONDETERMINISTIC_SHOTS); recaptured on a manual full run when the result
    // view changes. Modal — background nav inert.
    name: 'member-action-result',
    nondeterministic: true,
    path: '/members',
    wait: 'text=katherine.johnson@demo.tai',
    awaitPluginNav: false,
    action: async (page) => {
      await page
        .getByRole('group', { name: 'Actions for katherine.johnson@demo.tai' })
        .getByRole('button', { name: 'Send a new login link' })
        .click();
      await page.getByRole('dialog').getByRole('button', { name: 'Send a new login link' }).click();
      await page
        .locator('[data-testid="member-action-result"]')
        .waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    // The Marketplace detail page's route-mounting install dialog for the seeded
    // generic route-carrying plugin (acme/alerts-relay), reached by deep-linking the
    // detail route then clicking Install. The dialog frames the whole flow the docs
    // describe: the resolved routes list, the per-item base-prefix input (remap), and
    // the public-route acceptance checkbox. The minimal seeded registry the runner
    // boots (MARKETPLACE_URL) answers the detail + preview deterministically — one
    // published version, fixed routes, no advisories — so the routes and the
    // public-acceptance gate render on every run (NO `nondeterministic` flag).
    //
    // The Install action opens a modal dialog, which makes the background nav inert
    // (aria-hidden), so the plugin-sidebar wait is meaningless here — skip it; the
    // dialog's own waits are the stable signal.
    name: 'marketplace-install',
    path: '/marketplace?plugin=acme/alerts-relay',
    // The detail page's Install button proves the listing loaded populated.
    wait: 'button:has-text("Install")',
    awaitPluginNav: false,
    action: async (page) => {
      await page.getByRole('button', { name: 'Install', exact: true }).click();
      const dialog = page.getByRole('dialog');
      // The per-item base input (prefix remap) and a resolved public route path
      // prove the preview resolved; the checkbox is the public-approval gate — the
      // three surfaces the shot must frame.
      await dialog.getByLabel('relay base').waitFor({ state: 'visible', timeout: 8000 });
      await dialog
        .getByText('/api/alerts/relay/inbound')
        .first()
        .waitFor({ state: 'visible', timeout: 8000 });
      await dialog
        .getByText('I accept these routes are served without authentication')
        .waitFor({ state: 'visible', timeout: 8000 });
    },
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
  {
    // A transcript whose visitor turn carries typed inbound attachments — a served image
    // inline and a document download chip — forced through a route override (the live demo
    // backend mints none). Nondeterministic: the transcript's timestamps render RELATIVELY
    // against the moment of capture (like the `conversations` frame), so the automated
    // pipeline skips it (SKIP_NONDETERMINISTIC_SHOTS) and a manual full run recaptures it
    // when the attachment UI changes.
    name: 'conversation-inbound-attachments',
    nondeterministic: true,
    path: `/conversations?route=${encodeURIComponent(ATTACHMENT_TRANSCRIPT_ROUTE)}&thread=${encodeURIComponent(ATTACHMENT_TRANSCRIPT_THREAD)}`,
    wait: '[data-testid="attachment-document"]',
    setup: async (page) => {
      const stubGet = async (pathname, data) => {
        await page.route(
          (url) => url.pathname === pathname,
          async (route) => {
            if (route.request().method() !== 'GET') {
              await route.fallback();
              return;
            }
            await route.fulfill({ json: { data } });
          },
        );
      };
      await stubGet(
        '/api/conversations',
        attachmentPageOf([
          {
            route_name: ATTACHMENT_TRANSCRIPT_ROUTE,
            door: 'channel',
            target_kind: 'agent',
            target_name: 'assistant',
            start_expr: null,
            reply_expr: null,
            execution_key: 'studio-docs',
            execution_key_fingerprint: 'fp-docs',
            initial_mode: 'agent',
            channel: 'whatsapp',
            our_identity: '+10000000000',
            callback_url: null,
            turns_per_hour_override: null,
            error_reply_text: null,
            callback_secret: null,
            locale: null,
            overlap: { running: 'continue', deliver: 'one', settle_seconds: 0 },
          },
        ]),
      );
      await stubGet(
        `/api/conversations/${ATTACHMENT_TRANSCRIPT_ROUTE}/threads`,
        attachmentPageOf([
          {
            thread_id: ATTACHMENT_TRANSCRIPT_THREAD,
            client_address: ATTACHMENT_TRANSCRIPT_ADDRESS,
            last_activity_at: 1_800_000_010,
            message_count: 1,
            last_delivery_status: 'delivered',
          },
        ]),
      );
      await stubGet(`/api/conversations/${ATTACHMENT_TRANSCRIPT_ROUTE}/thread/mode`, {
        mode: 'agent',
        source: 'route',
      });
      await stubGet(
        `/api/conversations/${ATTACHMENT_TRANSCRIPT_ROUTE}/transcript`,
        attachmentPageOf([ATTACHMENT_TRANSCRIPT_RECORD], { order: 'desc' }),
      );
      await page.route(
        (url) => url.pathname.startsWith('/api/interactions/media/'),
        async (route) => {
          await route.fulfill({ contentType: 'image/png', body: ATTACHMENT_PNG });
        },
      );
    },
    // Centre the document chip so the image, its caption and the chip are all in frame.
    action: async (page) => {
      await page
        .getByRole('link', { name: 'report.pdf' })
        .evaluate((el) => el.scrollIntoView({ block: 'center' }));
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
    // both, so no separate scoped-nav shot is taken. Waits on the ExplorerView count
    // summary ("N tools") rather than a tool name: the explorer paginates at 24/page
    // and this projection covers the full registry (its tool-runs door widens it), so a
    // named tool can sit past page 1. The count summary sits outside the paged body, and
    // the [1-9] floor keeps the check strict (an empty projection renders no count).
    name: 'scoped-tools',
    path: '/tools',
    apiKey: OWNED_KEY,
    wait: 'text=/[1-9]\\d* tools\\b/',
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
      // Grant the boot's one route-mapped scope (`studio`). A key with no scope and no
      // condition is no policy at all, so the claim-link door refuses it as "not a valid
      // API key"; the minted key must carry a real grant for the QR step to render.
      await page
        .getByRole('dialog', { name: 'Create API key' })
        .getByRole('group', { name: 'Scopes' })
        .getByRole('checkbox', { name: 'studio', exact: true })
        .click();
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

// Apply the ONLY filter (if set) to both page sets; an unknown name fails loudly so a
// typo never silently captures nothing. Every downstream guard and the capture loop
// read the FILTERED lists, so a frame a filtered run excludes needs none of its seeded
// prerequisites.
const AUTHED_RUN = ONLY ? AUTHED_PAGES.filter((entry) => ONLY.has(entry.name)) : AUTHED_PAGES;
const PUBLIC_RUN = ONLY ? PUBLIC_PAGES.filter((entry) => ONLY.has(entry.name)) : PUBLIC_PAGES;
if (ONLY) {
  const known = new Set([...AUTHED_PAGES, ...PUBLIC_PAGES].map((entry) => entry.name));
  const unknown = [...ONLY].filter((name) => !known.has(name));
  if (unknown.length > 0) {
    console.error(`ONLY names unknown screen(s): ${unknown.join(', ')} — check the frame names.`);
    process.exit(1);
  }
}

// The conversations frame deep-links a runtime-seeded route + thread; require them only
// when that frame is actually in the run (the runner seeds and exports both, but a
// filtered run without conversations needs neither).
if (
  AUTHED_RUN.some((entry) => entry.name === 'conversations') &&
  (!CONVERSATION_ROUTE || !CONVERSATION_THREAD)
) {
  console.error(
    'STUDIO_CONVERSATION_ROUTE and STUDIO_CONVERSATION_THREAD are required: the runner ' +
      '(docs-screenshots.sh) seeds the conversation route and its threads, then exports both.',
  );
  process.exit(1);
}

// An entry that declares `apiKey` MUST resolve to a real key: a present-but-empty
// override (the runner did not export STUDIO_OWNED_KEY) would otherwise fall back
// to the full DEMO_KEY and silently mis-capture the scoped view. Fail loudly here.
const missingKey = AUTHED_RUN.find((entry) => 'apiKey' in entry && !entry.apiKey);
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

/**
 * Frame a React Flow canvas so a TALL graph is captured WHOLE, not cut off.
 *
 * WHY: a canvas pane caps zoom at the flow's `minZoom` (0.5) and this harness shoots
 * a FIXED 1440x900 viewport. A graph taller than the ~900px pane cannot fit at >= 0.5
 * zoom, so `fitView` centers it and the top/bottom overflow is transformed off-screen
 * — present in the DOM but clipped by the pane's overflow, so the fixed-viewport shot
 * captures only the pane and cuts the graph off. Rather than accept that clip, measure
 * the graph's content extent, pin the pane's transform to the content's top-left at 1:1
 * (shrinking only if the graph exceeds CANVAS_MAX_DIMENSION), and grow the browser
 * viewport to that extent — so the capture is COMPLETE and legible. Reads only React
 * Flow's stable public DOM (`.react-flow__viewport` / `.react-flow__node` transforms),
 * and self-guards: a route with no pane rendered is left exactly as-is.
 */
async function frameCanvasContent(page) {
  const viewport = page.locator('.react-flow__viewport');
  if ((await viewport.count()) === 0) return;
  const pane = viewport.first();
  // Measured in the pane's own (untransformed) node coordinates: each node carries its
  // position as an inline `translate(x, y)` and its rendered size as offsetWidth/Height.
  const content = await pane.evaluate((el) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of el.querySelectorAll('.react-flow__node')) {
      const match = /translate(?:3d)?\(\s*([-\d.]+)px,\s*([-\d.]+)px/.exec(node.style.transform);
      if (!match) continue;
      const x = parseFloat(match[1]);
      const y = parseFloat(match[2]);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + node.offsetWidth);
      maxY = Math.max(maxY, y + node.offsetHeight);
    }
    if (maxX === -Infinity) return null;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  });
  if (!content) return;
  // 1:1 unless the graph is larger than the capture ceiling, then shrink to fit it.
  const scale = Math.min(
    1,
    CANVAS_MAX_DIMENSION / (content.width + CANVAS_PADDING * 2),
    CANVAS_MAX_DIMENSION / (content.height + CANVAS_PADDING * 2),
  );
  const box = {
    width: Math.max(VIEWPORT.width, Math.ceil(content.width * scale + CANVAS_PADDING * 2)),
    height: Math.max(VIEWPORT.height, Math.ceil(content.height * scale + CANVAS_PADDING * 2)),
  };
  // Grow the viewport BEFORE pinning the transform: resizing can trigger the pane's own
  // resize handling, so the transform is asserted last (after a settle) and wins.
  await page.setViewportSize(box);
  await page.waitForTimeout(200);
  await pane.evaluate(
    (el, { minX, minY, scale: s, pad }) => {
      el.style.transform = `translate(${pad - minX * s}px, ${pad - minY * s}px) scale(${s})`;
    },
    { minX: content.minX, minY: content.minY, scale, pad: CANVAS_PADDING },
  );
}

async function shoot(page, entry, theme, { awaitPluginNav }) {
  const url = `${STUDIO_URL}${entry.path}`;
  // `setup`, when present, runs BEFORE navigation so a route override is registered
  // in time to intercept the data fetch the page fires on mount (a forced payload
  // for a state the live demo backend does not produce naturally).
  if (entry.setup) await entry.setup(page);
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
  // plugin, so this entry always resolves. It renders under the single generic
  // "Plugins" section list; `exact` avoids the per-entry provenance badge link.
  if (awaitPluginNav) {
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('list', { name: 'Plugins' })
      .getByRole('link', { name: 'Reference', exact: true })
      .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  }
  // Let fonts/layout settle.
  await page.waitForTimeout(600);
  // Canvas routes only: frame the whole graph so a tall canvas is captured complete
  // rather than clipped at the pane's fitView min-zoom (see frameCanvasContent).
  if (entry.canvas) await frameCanvasContent(page);
  const file = `${OUT_DIR}/${entry.name}-${theme}.png`;
  // `frame`, when present, names the one element the shot captures whole (it may run
  // past the viewport); otherwise the shot is the fixed viewport.
  if (entry.frame) await entry.frame(page).screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage: false });
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

    for (const entry of AUTHED_RUN) {
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
    const participant = await browser.newContext({ viewport: VIEWPORT, colorScheme: theme });
    const participantPage = await participant.newPage();
    for (const entry of PUBLIC_RUN)
      await shoot(participantPage, entry, theme, { awaitPluginNav: false });
    await participant.close();
  }

  await browser.close();
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
