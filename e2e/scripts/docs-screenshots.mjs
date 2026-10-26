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
 *   - run-subject — the run panel's optional Subject section, expanded (nothing is run).
 *   - run-caller-asks — the run panel's caller-asks result for `parking_ask`, one row per
 *                  ask with its prompt and copyable id.
 *   - run-caller-asks-many — the same list with many long asks, each prompt on one line
 *                  inside the list's bounded, scrolling height.
 *   - run-answer-unreadable — the sync run panel's unreadable-answer panel (its Details
 *                  open), via a forced `POST /api/run-tool` body the live server never
 *                  answers (a bare value with no `kind`).
 *   - run-answer-parked-unreadable — the background card of a parked run whose stored
 *                  answer is in an older format (its Details open), via forced
 *                  `GET /api/tool-runs` / `GET /api/tool-runs/{id}` payloads.
 *   - settings   — the config workbench from `GET /api/config/*` (settings schema).
 *   - profiles   — the Settings page's Profiles tab: the seeded `production` profile
 *                  row (name + description) from `GET /api/config/profiles`. The action
 *                  switches to the tab and waits on that row.
 *   - settings-access — the API keys tab's "Access control" card (the scopes mapper):
 *                  the scope zones, the Unassigned bucket of unmapped routes, and the Public
 *                  zone with its note, captured as the whole card.
 *   - profile-apply-recycle-stopped — the profile apply report for a recycle roll that
 *                  stopped (a forced apply response): the recycle rows, the stop panel, and
 *                  the workers the server names as still awaiting a restart.
 *   - backup-restore-recycle-stopped — the Backup tab's import report for an env-section
 *                  restore whose recycle roll stopped (a forced import response): the section
 *                  row, the workers the server names as still awaiting a restart, and the
 *                  recycle rows with the stop panel, captured as the whole Import card.
 *   - backup-export-section-errors — the Backup tab's Export card after an export whose
 *                  document names a failed section (a forced export answer): the file still
 *                  downloads, and the warning names the section with its message.
 *   - settings-env-recycle — the Environment tab after a save that rolled a worker
 *                  recycle (a forced save response: the docs-demo stack runs bare): the
 *                  recycle rows, captured as the whole Environment variables card.
 *   - agents     — the registered `tools_agent` from `GET /api/agents`.
 *   - presets    — the Presets list (`GET /api/presets`): the two seeded
 *                  `studio_demo_echo` presets, the master pane rendered full-width (no
 *                  selection). The version detail is NOT shot — its version panel stamps
 *                  a server `created_at` that would churn every run.
 *   - preset-kwargs-{fields,json} — the create-preset dialog's fixed-kwargs editor, in
 *                  its fields view and its raw JSON view.
 *   - preset-maps — the create-preset dialog after authoring an input schema, an input
 *                  map and an output map.
 *   - states-{list,declaration,templates,records,consumers,record} — the platform state
 *                  store (`GET /api/states*`, `/api/state-templates`): the seeded `notes`
 *                  state's list row, its Declaration / Templates / Records / Consumers
 *                  tabs, and one subject's record page (document + `api` Writes audit).
 *   - state-template-typed — the state-template screen for the seeded `display` template: its
 *                  fields, Write policies, Parameters (name, schema, default) and the Trace writes line.
 *   - states-pending-saves — the States page's Pending saves card on its All outstanding tab:
 *                  the newer save held behind a failed save (Retry / Discard), newest first, via a
 *                  forced `GET /api/state-pending-saves` payload (the demo backend runs nothing
 *                  whose save can fail).
 *   - states-records-held — the Records tab with the line above the subjects table that counts
 *                  the subjects held by a failed pending save and links to the Pending saves card,
 *                  via the live subjects page with a forced `held` entry (the same failed save the
 *                  pending-saves frame shows).
 *   - states-records-check — the Records tab's "Check records against the schema" card after a
 *                  live walk of the `notes` thread records: the summary and the misfits table, via
 *                  the live check page with a forced misfit added (every seeded record fits the
 *                  schema it was written under, so the demo backend reports none).
 *   - dashboard  —the observability Dashboard (`GET /api/observability/metrics`):
 *                  the seeded docs-demo monitoring backend gives it a real trend
 *                  chart AND a by-model breakdown.
 *   - dashboard-by-model-unavailable — the same Dashboard with the by-model card in
 *                  its degraded state, via a forced `byModelAvailable:false` payload
 *                  the live backend never returns.
 *   - tracing-sort-guard — the Tracing tab under a cost sort with the filters that sort
 *                  cannot carry disabled, via a forced `GET /api/observability/capabilities`
 *                  payload: a backend that declares exclusions, held in this script. The live
 *                  demo backend declares no sort × filter exclusion, so it never disables a
 *                  filter; the runs list, the sort and the rows stay live.
 *   - tracing-link-not-served — the Tracing tab opened from a link whose cost sort the same
 *                  forced declaration excludes with its status filter: the not-served notice
 *                  with its "Sort newest first" button in place of the table, the filter bar
 *                  keeping the link's values. No runs read is sent for that link.
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
 *   - manifest   — the manifest document, its "MCP servers" block and its Extensions
 *                  section (non-empty `user_tools`, the loaded `ask_external`, the
 *                  manifest's extension settings).
 *   - served-endpoints — the Served endpoints registry: the sub-MCP list (empty, the
 *                  runner seeds none) above its inline create form.
 *   - storage    — the Storage browser over the seeded files, with the seeded
 *                  welcome-email.md open in the detail (deep-linked).
 *   - storage-delete-held — the Delete dialog of the seeded `jq/gate`, refused because
 *                  the seeded `gate-watch` hook's condition names it: the holder list.
 *   - system     — the health badge (the health router is loaded before the SPA
 *                  catch-all, so it renders ops text, not index.html) plus the
 *                  populated Plugin kinds table.
 *   - system-kinds — the same /system route scrolled to the "Plugin kinds" table,
 *                  populated from `GET /api/system/kinds`.
 *   - members    — the generic Members directory (`GET /api/auth/members` +
 *                  `GET /api/auth/member-actions`): the People table beside the Pending
 *                  invitations table, each row naming its provider in the Provider
 *                  column and its actions joined from the declared catalog, populated
 *                  by the runner's member-action seed.
 *   - member-action-input — the page-scoped "Invite a user" action's SchemaForm over its
 *                  declared input schema (filled, not submitted — no account is created).
 *   - member-action-confirm — a destructive row action ("Remove user") stopped at its
 *                  confirm step (never confirmed, so no account is removed).
 *   - member-action-result — a row action ("Send a new login link") run live against the
 *                  seeded pending invite, framing the one-time-secret result (the minted
 *                  invite link through CopyField).
 *   - marketplace — the Marketplace list with the seeded generic plugin
 *                  (acme/alerts-relay) from the minimal seeded registry.
 *   - marketplace-install — the Marketplace detail page's route-mounting install
 *                  dialog for the seeded generic plugin (acme/alerts-relay): the
 *                  resolved routes, the per-item base-prefix remap input, and the
 *                  public-route acceptance checkbox, all from the minimal seeded
 *                  registry the runner boots (MARKETPLACE_URL).
 *   - connectors — the Connectors page: the directory (a provider with two stubbed
 *                  connections, a never-connected provider, the MCP entries, the
 *                  marketplace listings) above "Your connections".
 *   - connectors-pick-tools — the connect flow at Pick tools for a hand-added server, its
 *                  advertised tools answered by a route stub; nothing is saved.
 *   - connectors-add-server — the Connectors page with the "Add MCP server" dialog, opened
 *                  from the header's "Add a custom server", at its review step, the single
 *                  look-up answered by a route stub (the demo backend has no
 *                  OAuth-protected server to look up); nothing is added.
 *   - conversations — the conversation monitor at its deepest level: a seeded route's
 *                  thread list beside one thread's transcript, both populated by the
 *                  real turns the runner drives through the authed api door.
 *   - conversation-inbound-attachments — a transcript whose visitor turn carries typed
 *                  inbound attachments (a served image inline, a document download chip),
 *                  via a forced transcript + served-media override the live backend never
 *                  produces.
 *   - conversation-inbound-reply-to — a transcript whose visitor turns quote earlier
 *                  messages: one quote the thread holds, drawn with its text, and one it
 *                  does not hold, drawn with the message id, via a forced transcript the
 *                  live backend never produces. Captured as the whole transcript card,
 *                  which runs past the viewport.
 *   - conversation-transcript-sends — a transcript carrying the platform's own sends: a send
 *                  made during a turn drawn inside that turn, a sent message and a question
 *                  asked outside any turn (the question sensitive, its reply not stored), a
 *                  platform notice, a failed channel notice and a send whose outcome is
 *                  unknown, both open delivery details showing, via forced transcript
 *                  records the demo backend never produces. Captured as the whole transcript
 *                  card, which runs past the viewport.
 *   - conversation-bulk-reset-{select,confirm,result} — the thread list's bulk reset over a
 *                  forced route and its three threads: every row ticked through the header
 *                  checkbox with the "Reset selected (3)" action, the confirm dialog naming the
 *                  count, and the per-item result (two threads reset, one failed row with its
 *                  reason and a Retry). The deletes are answered by route stubs, so no live
 *                  thread is forgotten.
 *   - entry-gate —the drill-in of the seeded `relay` web route: the web channel's
 *                  "Web chat" panel's entry-gate section, gate on, with its one `launch` code
 *                  row.
 *   - entry-gate-empty — the drill-in of the seeded `relay-open` web route: the panel's
 *                  "No entry codes" state.
 *   - entry-gate-mint — the panel's shown-once mint dialog on `relay-open`, after a real
 *                  mint (the fresh code and its chat link).
 *   - entry-gate-unavailable — the panel's "Entry gate unavailable" card, via the real
 *                  `GET /api/plugins` answer with the web channel's mounts emptied.
 *   - web-words — the same panel's words section on `relay`, with the route's own words
 *                  for its entry-refused page and its busy sentence stored through the
 *                  real words door.
 *   - conversation-route-agent-contract — the route CREATE dialog for the `tools_agent`
 *                  target on the `web` channel door, framing the execution key (the first
 *                  listed one) and the five door-contract jq fields.
 *   - conversation-route-reply-texts — the same CREATE dialog framing its Reply texts
 *                  group, with the failed-turn and pairing-code words filled in.
 *   - conversation-route-channel-hint — the CREATE dialog's Door group on the `web`
 *                  channel, with that channel's identity hint under "Our identity".
 *   - conversation-route-no-grant — the CREATE dialog's Target group when `GET /api/agents`
 *                  answers 403 (forced): the Agent picker's refused note.
 *   - conversation-route-key-not-own — the EDIT dialog's Execution key field for an admin
 *                  session on a stub route bound to `svc-other`: the unlisted-key line and
 *                  the not-your-identity line (the live session answer with a fixed `user_id`).
 *   - conversation-route-own-identity — the CREATE dialog's Execution key field with the
 *                  session's own identity picked and an empty key list (forced): the own-
 *                  identity hint and the empty-list note.
 *   - schedule-contract — the add-schedule dialog framing its door-contract section (the
 *                  execution-key picker + the four jq fields), backed by the RQ scheduling
 *                  backend the docs-demo boot installs.
 *   - scheduling-rows — the Scheduling page's schedules table with an interval row, a cron
 *                  row and a row carrying a backend error (its warning Error badge), via a
 *                  forced `GET /api/schedules` payload (the demo backend records no scheduling
 *                  failure and seeds no schedule).
 *   - schedule-cron-error — the add-schedule dialog with a cron expression of the wrong
 *                  length, showing the field error (nothing is submitted).
 *   - hooks      — the Hooks registry with the seeded consumer hook (`notes-updater`).
 *   - interactions — the interactions inbox under the full key.
 *   - notifications — the notifications inbox under the full key (nondeterministic: each
 *                  row shows its server-stamped `created_at`).
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

/** The two seeded web routes the entry-gate and words shots drill into, each texted at its own name
 * as its web identity: `ENTRY_GATE_ROUTE` gated with one live `launch` code,
 * `ENTRY_GATE_OPEN_ROUTE` ungated with none. The runner (docs-screenshots.sh) creates both
 * and seeds their gates after boot, then exports their names; there is no static fallback. */
const ENTRY_GATE_ROUTE = process.env.STUDIO_ENTRY_GATE_ROUTE;
const ENTRY_GATE_OPEN_ROUTE = process.env.STUDIO_ENTRY_GATE_OPEN_ROUTE;
/** The web channel's entry-gate doors, keyed by a web route's identity. */
const ENTRY_GATE_DOORS = '/api/channels/web/gates';
/** The panel the web channel's Studio plugin contributes to a web route's drill-in: its
 * entry-gate and words sections. */
const WEB_CHAT_PANEL = 'section[aria-label="Web chat"]';

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

/** The fixed identity the session frames name in place of the minted key's own `user_id`. */
const FRAMED_SESSION_USER = 'studio-docs-admin';

/**
 * Serve `GET /api/auth/me` as the live projection with `fields` laid over it, so a frame
 * draws a fixed session identity whatever the capture key resolves to. A live answer that
 * is not a projection fails the capture loudly.
 */
async function stubSessionFields(page, fields) {
  await page.route(
    (url) => url.pathname === '/api/auth/me',
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      if (!response.ok()) {
        throw new Error(`GET /api/auth/me answered ${String(response.status())}`);
      }
      const body = await response.json();
      if (typeof body.data?.user_id !== 'string') {
        throw new Error(`GET /api/auth/me carried no projection: ${JSON.stringify(body)}`);
      }
      await route.fulfill({ response, json: { ...body, data: { ...body.data, ...fields } } });
    },
  );
}

/** A route dialog field's whole block (label, description, control and lines): a single
 * field's label is a `label`, a group's a `span`. */
function routeDialogField(page, label, { group = false } = {}) {
  return page
    .getByRole('dialog')
    .locator(`.tai-field:has(> ${group ? 'span' : 'label'}:text-is("${label}"))`);
}

/** Open the route CREATE dialog and pick an agent target through the pickers. */
async function openAgentRouteDialog(page) {
  await page.getByRole('button', { name: 'Create route' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Route name' }).fill('events');
  await pickRouteOption(page, dialog, 'Target kind', 'Agent');
  return dialog;
}

/** Pick `option` in the route dialog's combobox named `name`. */
async function pickRouteOption(page, dialog, name, option) {
  await dialog.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

/** Fill the channel door on the demo's `web` channel. */
async function fillWebDoor(page, dialog) {
  await pickRouteOption(page, dialog, 'Door', 'Channel');
  await pickRouteOption(page, dialog, 'Channel', 'web');
  await dialog.getByRole('textbox', { name: 'Our identity' }).fill('events');
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

/** The web channel's words doors, keyed by a web route's identity. */
const WEB_WORDS_DOORS = '/api/channels/web/words';
/** The words the `web-words` frame stores on its route. */
const WEB_WORDS = {
  page: {
    entry_refused: { heading: 'Members only', text: 'Ask for a fresh link to join.' },
  },
  transport: { busy: 'One moment, please send that again.' },
};

/** Store `WEB_WORDS` as the web route `identity`'s whole words through the real words door. */
async function storeWebWords(page, identity) {
  const stored = await page.request.put(
    `${STUDIO_URL}${WEB_WORDS_DOORS}/${encodeURIComponent(identity)}`,
    { headers: { 'x-api-key': DEMO_KEY }, data: WEB_WORDS },
  );
  if (!stored.ok()) throw new Error(`storing the words on ${identity} failed (${stored.status()})`);
}

/** Revoke every live entry code on the web route `identity` through the real gate doors. */
async function revokeEntryCodes(page, identity) {
  const doors = `${STUDIO_URL}${ENTRY_GATE_DOORS}/${encodeURIComponent(identity)}`;
  const headers = { 'x-api-key': DEMO_KEY };
  const gate = await page.request.get(doors, { headers });
  if (!gate.ok())
    throw new Error(`reading the entry gate on ${identity} failed (${gate.status()})`);
  for (const code of (await gate.json()).data.codes) {
    const revoked = await page.request.delete(
      `${doors}/codes/${encodeURIComponent(code.code_id)}`,
      { headers },
    );
    if (!revoked.ok()) {
      throw new Error(
        `revoking entry code ${code.code_id} on ${identity} failed (${revoked.status()})`,
      );
    }
  }
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

// A forced served-capabilities payload for the sort-guard and not-served states: a
// backend that declares exclusions (its metric sorts cannot carry the status / cost /
// token / latency / version filters). The live demo backend combines every sort with
// every filter, so it never declares an exclusion.
const METRIC_FILTERS = [
  'maxCost',
  'maxLatencyMs',
  'maxTokens',
  'minCost',
  'minLatencyMs',
  'minTokens',
  'status',
  'version',
];
const EXCLUDING_CAPABILITIES = {
  pageSizeMax: 100,
  sortKeys: ['createdAt', 'cost', 'latencyMs', 'totalTokens'],
  incompatibleFilters: {
    cost: METRIC_FILTERS,
    latencyMs: METRIC_FILTERS,
    totalTokens: METRIC_FILTERS,
  },
  metrics: { measures: ['cost', 'count', 'latency', 'tokens'], dimensions: ['model'] },
};

/** Serve the declaration that excludes the metric filters under a metric sort. */
async function forceExcludingCapabilities(page) {
  await page.route(
    (url) => url.pathname === '/api/observability/capabilities',
    (route) => route.fulfill({ json: { data: EXCLUDING_CAPABILITIES } }),
  );
}

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

// The pending-saves payload is FORCED through a route override: a save fails only when its
// apply is refused after the run committed (a re-declare between the two, or a deferred call
// that fails), and the demo backend runs nothing that defers a call or stages across a
// re-declare. Two saves on one `notes` subject: the older one failed its records phase, the
// newer one waits behind it. Each answer is the door's real page shape (decoded by the
// studio's strict `pendingSavesPage` schema), answered per `status` filter the way the door
// filters: `failed` lists the failed save, `outstanding` (or none) both. The ages are
// relative to the capture, so the Age column reads the same on every run.
const PENDING_SAVES_SUBJECT = {
  target_kind: 'tool',
  target_name: 'studio_demo_echo',
  kind: 'thread',
  key: 't-002',
};
function pendingSavesPage(status) {
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();
  const failed = {
    id: '41',
    status: 'failed',
    run_id: '7c2e9a1f-4b6d-4e0a-9f3b-5c8d1e2a7b40',
    states: ['notes'],
    subjects: [{ state: 'notes', subject: PENDING_SAVES_SUBJECT }],
    calls: [{ kind: 'tool', target: 'studio_demo_echo' }],
    attempts: 1,
    last_error:
      "ValueValidationError: state 'notes' subject tool/studio_demo_echo/thread/t-002: record invalid under the state schema at $.items[0].id: 7 is not of type 'string'",
    failed_phase: 'records',
    created_at: ago(12),
    failed_at: ago(12),
  };
  const held = {
    id: '42',
    status: 'pending',
    run_id: '0b8d3f6a-2c1e-4a7b-8e9f-0a1b2c3d4e5f',
    states: ['notes'],
    subjects: [{ state: 'notes', subject: PENDING_SAVES_SUBJECT }],
    calls: [],
    attempts: 0,
    last_error: null,
    failed_phase: null,
    created_at: ago(4),
    failed_at: null,
  };
  const items = status === 'failed' ? [failed] : [held, failed];
  return { items, next_cursor: null, outstanding: 2, failed: 1 };
}

// The Records tab's held line reads the `held` entries the subjects page carries. The live
// page is fetched and answered with the two saves of the pending-saves payload above added:
// the failed save (held by itself) and the outstanding save held behind it, both on the
// listed subject `t-002`.
const HELD_ON_SUBJECTS_PAGE = [
  { save_id: '41', held_by: '41', subjects: [PENDING_SAVES_SUBJECT] },
  { save_id: '42', held_by: '41', subjects: [PENDING_SAVES_SUBJECT] },
];

// The Check records card lists only the records that do not fit the state's current schema.
// Every seeded `notes` record was validated against that schema when it was written, so the
// live walk finds none; the walk's first page is fetched live and answered with one misfit
// added on the listed subject `t-001` (a stored item id that is not a string, the reason the
// pending-saves payload above names). Its `updated_at` is a fixed instant, so the Updated cell
// reads the same on every run.
const CHECK_RECORDS_MISFIT = {
  subject: { target_kind: 'tool', target_name: 'studio_demo_echo', kind: 'thread', key: 't-001' },
  updated_at: 1_788_255_000,
  reasons: [{ path: '$.items[0].id', message: "7 is not of type 'string'" }],
};
/** The Records tab's Check records card. */
const checkRecordsCard = (page) =>
  page.locator('.tai-card').filter({
    has: page.getByRole('heading', { name: 'Check records against the schema', level: 3 }),
  });

// The Members People table's "Mixed roles" badge reads a person whose logins hold different
// roles. The demo's accounts provider holds one login per person, so the live directory is
// fetched and answered with one forced member row added: two logins, one `viewer` and one
// `admin`, so the row carries no single role. It reuses a live member row's action keys, so its
// actions render as every other row's do.
function withMixedRolesMember(directory) {
  const template =
    directory.members.find((row) => row.action_keys.length > 0) ?? directory.members[0];
  if (template === undefined)
    throw new Error('members scene: the live directory has no member row');
  return {
    ...directory,
    members: [
      ...directory.members,
      {
        ...template,
        id: 'demo-mixed-roles',
        email: 'dorothy.vaughan@demo.tai',
        role: null,
        principals: [
          { user_id: 'usr-demo-login-1', disabled: false, role: 'viewer' },
          { user_id: 'usr-demo-login-2', disabled: false, role: 'admin' },
        ],
        disabled: false,
      },
    ],
  };
}

// The forced schedules listing the `scheduling-rows` frame renders: one interval, one cron and one
// row carrying a backend scheduling failure, as typed `ScheduleListRow` rows with fixed values.
const SCHEDULE_ROWS = [
  {
    name: 'hourly-sync',
    tool: 'studio_demo_echo',
    cadence: { kind: 'interval', every: 3600, relative: false },
    enabled: true,
    next_run_at_ts: null,
    next_run_at_iso: null,
    error: null,
  },
  {
    name: 'nightly-refresh',
    tool: 'studio_demo_echo',
    cadence: {
      kind: 'crontab',
      minute: '0',
      hour: '2',
      day_of_month: '*',
      month_of_year: '*',
      day_of_week: '*',
    },
    enabled: true,
    next_run_at_ts: null,
    next_run_at_iso: null,
    error: null,
  },
  {
    name: 'weekly-digest',
    tool: 'studio_demo_echo',
    cadence: {
      kind: 'crontab',
      minute: '30',
      hour: '6',
      day_of_month: '*',
      month_of_year: '*',
      day_of_week: '1',
    },
    enabled: true,
    next_run_at_ts: null,
    next_run_at_iso: null,
    error: {
      message: 'the worker could not re-arm the schedule',
      at_iso: '2026-01-05T06:30:00+00:00',
    },
  },
];

// The inbound-attachments transcript is FORCED through a route override: the live demo
// backend mints no byte-backed inbound attachments, so the transcript record, its thread
// and its served-media bitmap are all stubbed to render the attachment states
// deterministically. The record is stamped `ATTACHMENT_MINUTES_AGO` before the capture, so
// its relative time label reads the same on every run.
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
};
const ATTACHMENT_MINUTES_AGO = 8;

// The sends transcript is FORCED on the same stubbed thread: the demo backend runs no channel
// that records platform sends, so the turn, the send made during it, the sends made outside any
// turn and their outcomes are stubbed records, oldest first. Each label the frame draws follows
// from its record: only `m-302` carries a `turn_message_id`, so it alone is drawn inside a turn.
// Each record is stamped `minutesAgo` before the capture (like the bulk-reset threads), so the
// transcript's relative time labels read the same on every run.
const SENDS_RECORD_BASE = {
  route_name: ATTACHMENT_TRANSCRIPT_ROUTE,
  door: 'channel',
  thread_id: ATTACHMENT_TRANSCRIPT_THREAD,
  client_address: ATTACHMENT_TRANSCRIPT_ADDRESS,
  caller_principal: null,
  inbound_attachments: null,
};
const SEND_RECORD_BASE = {
  ...SENDS_RECORD_BASE,
  origin: 'send',
  inbound_text: '',
  answer_status: null,
  successor_id: null,
  turn_message_id: null,
};
const SENDS_TRANSCRIPT_RECORDS = [
  {
    ...SENDS_RECORD_BASE,
    message_id: 'm-301',
    origin: 'client',
    inbound_text: 'is the nightly export done',
    answer_status: 'answered',
    answer: 'Yes — the export finished at 02:10.',
    successor_id: null,
    delivery_status: 'delivered',
    minutesAgo: 50,
  },
  {
    ...SEND_RECORD_BASE,
    message_id: 'm-302',
    sent_by: 'notify',
    turn_message_id: 'm-301',
    answer: 'Checking the export log now.',
    delivery_status: 'delivered',
    sends: [{ part: 0, chars: 28, provider_message_ids: ['SM-302'] }],
    minutesAgo: 49,
  },
  {
    ...SEND_RECORD_BASE,
    message_id: 'm-303',
    sent_by: 'notify',
    answer: 'Your weekly summary is ready.',
    delivery_status: 'delivered',
    sends: [{ part: 0, chars: 29, provider_message_ids: ['SM-303'] }],
    minutesAgo: 40,
  },
  {
    ...SEND_RECORD_BASE,
    message_id: 'm-304',
    sent_by: 'ask',
    answer: 'Please reply with the one-time code from your account page.',
    ask: { answer_format: 'text', attempts: 1, interaction_id: 'int-304', sensitive: true },
    ask_reply: {
      answer: null,
      answeredMinutesAgo: 29,
      medium_message_id: 'SM-in-304',
    },
    delivery_status: 'delivered',
    sends: [{ part: 0, chars: 59, provider_message_ids: ['SM-304'] }],
    minutesAgo: 30,
  },
  {
    ...SEND_RECORD_BASE,
    message_id: 'm-305',
    sent_by: 'notice',
    answer: 'This conversation was linked to your other channel.',
    delivery_status: 'delivered',
    sends: [{ part: 0, chars: 51, provider_message_ids: ['SM-305'] }],
    minutesAgo: 20,
  },
  {
    ...SEND_RECORD_BASE,
    message_id: 'm-306',
    sent_by: 'channel',
    answer: 'That form has closed.',
    delivery_status: 'failed',
    attempts: 1,
    error: 'ChannelDeliveryError: the provider refused the recipient',
    minutesAgo: 10,
  },
  {
    ...SEND_RECORD_BASE,
    message_id: 'm-307',
    sent_by: 'notify',
    answer: 'Your export link expires tomorrow.',
    delivery_status: 'outcome_unknown',
    attempts: 1,
    error: 'the send did not answer within 30s; the outcome is unknown',
    minutesAgo: 5,
  },
];

/** The sends transcript stamped against `nowSeconds`, oldest first. */
// The reply-to transcript is FORCED on the same stubbed thread, oldest first: an answered turn,
// a turn quoting that answer (held, so its text shows) and a turn quoting a message the thread
// does not hold. Each record is stamped `minutesAgo` before the capture.
const REPLY_TO_ANSWER = 'There are two options: the daily digest or the weekly summary.';
const REPLY_TO_TRANSCRIPT_RECORDS = [
  {
    ...SENDS_RECORD_BASE,
    message_id: 'm-401',
    origin: 'client',
    inbound_text: 'which reports can I get',
    answer_status: 'answered',
    answer: REPLY_TO_ANSWER,
    successor_id: null,
    delivery_status: 'delivered',
    minutesAgo: 30,
  },
  {
    ...SENDS_RECORD_BASE,
    message_id: 'm-402',
    origin: 'client',
    inbound_text: 'the second one, please',
    inbound_reply_to: { message_id: 'wamid.demo-401', status: 'found', text: REPLY_TO_ANSWER },
    answer_status: 'answered',
    answer: 'Done: the weekly summary is on.',
    successor_id: null,
    delivery_status: 'delivered',
    minutesAgo: 20,
  },
  {
    ...SENDS_RECORD_BASE,
    message_id: 'm-403',
    origin: 'client',
    inbound_text: 'and is this one still right?',
    inbound_reply_to: { message_id: 'wamid.demo-117', status: 'not_found', text: null },
    answer_status: 'answered',
    answer: 'I cannot see that earlier message here. Could you send it again?',
    successor_id: null,
    delivery_status: 'delivered',
    minutesAgo: 10,
  },
];

function sendsTranscriptRecords(nowSeconds) {
  return SENDS_TRANSCRIPT_RECORDS.map(({ minutesAgo, ...record }) => {
    const at = nowSeconds - minutesAgo * 60;
    const stamped = { ...record, created_at: at, updated_at: at };
    if (record.ask_reply) {
      const { answeredMinutesAgo, ...reply } = record.ask_reply;
      const answeredAt = new Date((nowSeconds - answeredMinutesAgo * 60) * 1000);
      stamped.ask_reply = { ...reply, answered_at: answeredAt.toISOString() };
    }
    return stamped;
  });
}

/** Open the delivery detail of the transcript exchange whose text includes `text`. */
async function openDeliveryDetail(page, text) {
  await page
    .getByTestId('conversation-exchange')
    .filter({ hasText: text })
    .getByTestId('exchange-admin-detail')
    .locator('summary')
    .click();
}

/** One paged read-door envelope shaped as the doors return it. */
function pageOf(items, extra = {}) {
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

/** Answer every `GET` on `pathname` with the skeleton's `{ data }` envelope; other methods
 * fall through to the live skeleton. */
async function stubGet(page, pathname, data) {
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
}

/** The forced channel route the stubbed conversation frames list. The live seeded routes'
 * threads are stamped when the runner drives their turns, so a frame that needs fixed threads
 * or records serves this route and its reads instead. */
const STUB_CHANNEL_ROUTE = {
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
  reply_texts: null,
  callback_secret: null,
  locale: null,
  overlap: { running: 'continue', deliver: 'one', settle_seconds: 0 },
};

// The bulk-reset frames select over three threads on the forced channel route above: enough
// for the header select-all, a multi-count action, and a result that mixes resets with one
// failure. Each thread's last activity is relative to the capture (like the pending-saves
// ages), so the list's relative "last spoke" labels read the same on every run.
const BULK_RESET_ROUTE = STUB_CHANNEL_ROUTE.route_name;
const BULK_RESET_THREADS = [
  { address: '+10000000001', minutesAgo: 12, messages: 4, delivery: 'delivered' },
  { address: '+10000000002', minutesAgo: 3 * 60, messages: 2, delivery: 'delivered' },
  { address: '+10000000003', minutesAgo: 2 * 24 * 60, messages: 7, delivery: 'failed' },
].map((thread) => ({ ...thread, thread_id: `${BULK_RESET_ROUTE}/${thread.address}` }));
/** The thread whose reset the result frame fails: a turn is in flight on it, so its DELETE
 * answers 409 with the skeleton's `{ error }` message. */
const BULK_RESET_FAILED_THREAD = BULK_RESET_THREADS[2].thread_id;
const BULK_RESET_FAILURE = 'This thread has a turn in flight; try again once it settles.';
/** The action that opens the confirm, and the confirm's own label; both name the count. */
const BULK_RESET_ACTION = `Reset selected (${BULK_RESET_THREADS.length})`;
const BULK_RESET_CONFIRM = `Reset ${BULK_RESET_THREADS.length} threads`;

/** The threads page the bulk-reset frames list, keeping only the threads in `present`. */
function bulkResetThreadsPage(present) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return pageOf(
    BULK_RESET_THREADS.filter((thread) => present.has(thread.thread_id)).map((thread) => ({
      thread_id: thread.thread_id,
      client_address: thread.address,
      last_activity_at: nowSeconds - thread.minutesAgo * 60,
      message_count: thread.messages,
      last_delivery_status: thread.delivery,
    })),
  );
}

/**
 * Serve the bulk-reset frames' doors: the forced route list, and the route's threads read
 * from a live set. With `answerDeletes`, the per-thread DELETE door is answered too: every
 * thread but the failing one resets and drops from the set, the failing one answers 409, and
 * no request reaches the live skeleton.
 */
async function stubBulkResetDoors(page, { answerDeletes }) {
  const present = new Set(BULK_RESET_THREADS.map((thread) => thread.thread_id));
  await stubGet(page, '/api/conversations', pageOf([STUB_CHANNEL_ROUTE]));
  await page.route(
    (url) => url.pathname === `/api/conversations/${BULK_RESET_ROUTE}/threads`,
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({ json: { data: bulkResetThreadsPage(present) } });
    },
  );
  if (!answerDeletes) return;
  await page.route(
    (url) => url.pathname === `/api/conversations/${BULK_RESET_ROUTE}/thread`,
    async (route) => {
      if (route.request().method() !== 'DELETE') {
        await route.fallback();
        return;
      }
      const threadId = new URL(route.request().url()).searchParams.get('thread_id') ?? '';
      if (threadId === BULK_RESET_FAILED_THREAD) {
        await route.fulfill({ status: 409, json: { error: BULK_RESET_FAILURE } });
        return;
      }
      present.delete(threadId);
      await route.fulfill({
        json: {
          data: { removed: 1, route_name: BULK_RESET_ROUTE, thread_id: threadId, states_erased: 0 },
        },
      });
    },
  );
}

/** Tick every loaded thread through the header checkbox, then wait for the count action. */
async function selectAllThreads(page) {
  await page.getByRole('checkbox', { name: 'Select all threads' }).click();
  await page
    .getByRole('button', { name: BULK_RESET_ACTION })
    .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
}

// The look-up answer the `connectors-add-server` frame stubs: a server that signs in at
// one service and registers apps by itself.
const ADD_SERVER_LOOKUP = {
  url: 'https://mcp.example.com/mcp',
  resource: 'https://mcp.example.com/mcp',
  resource_name: 'Remote files',
  issuer: 'https://login.example.com',
  authorization_servers: ['https://login.example.com'],
  client_issuer: null,
  registration_supported: true,
  automatic_client: true,
  scopes_supported: ['files.read', 'files.write'],
  suggested_id: 'remote_files',
  suggested_display_name: 'Remote files',
  redirect_uri: null,
};

// The scene the `connectors` and `connectors-pick-tools` frames stub: a provider with
// two connections (aliases `work` and `personal`), one never-connected provider, and a
// hand-added server beside the connections' entries; the marketplace listings come
// from the registry the runner boots.
const CONNECTORS_SCENE_PROVIDERS = [
  {
    id: 'acme_files',
    display_name: 'Acme files',
    description: 'Read and write files in an Acme workspace.',
    icon_url: null,
    kind: 'oauth',
    origin: 'system',
    category: 'tools',
    sub_services: [{ id: 'default', display_name: 'Files', description: '', scopes: [] }],
    config_fields: [],
  },
  {
    id: 'acme_calendar',
    display_name: 'Acme calendar',
    description: 'Read and create events in an Acme calendar.',
    icon_url: null,
    kind: 'oauth',
    origin: 'system',
    category: 'tools',
    sub_services: [{ id: 'default', display_name: 'Calendar', description: '', scopes: [] }],
    config_fields: [],
  },
];
const CONNECTORS_SCENE_CONNECTIONS = ['work', 'personal'].map((alias) => ({
  connection_id: `conn-${alias}`,
  provider_id: 'acme_files',
  alias,
  kind: 'oauth',
  account_identity: `${alias}@example.com`,
  enabled_sub_services: ['default'],
  granted_scopes: [],
  unreachable_sub_services: [],
  auth_health_state: 'healthy',
  created_at: '2026-08-01T00:00:00.000Z',
}));
const CONNECTORS_SCENE_SERVER = 'docs-search';
const CONNECTORS_SCENE_TOOLS = ['search', 'fetch_page', 'list_sources'];

/** A preserved-manifest MCP entry, managed by `connectionId` when one is given. */
function sceneMcpEntry(title, connectionId) {
  return {
    title,
    config: { transport: 'streamable-http', url: `https://mcp.example.com/${title}` },
    include: [],
    exclude: [],
    managed:
      connectionId === null
        ? null
        : { connection_id: connectionId, provider_id: 'acme_files', sub_service: 'default' },
  };
}

/** Stub the Connectors scene's providers, connections, manifest entries and live status. */
async function stubConnectorsScene(page) {
  const entries = [
    ...CONNECTORS_SCENE_CONNECTIONS.map((c) =>
      sceneMcpEntry(`acme-files-${c.alias}`, c.connection_id),
    ),
    sceneMcpEntry(CONNECTORS_SCENE_SERVER, null),
  ];
  await stubGet(page, '/api/connectors/providers', {
    providers: CONNECTORS_SCENE_PROVIDERS,
    categories: [{ id: 'tools', display_name: 'Tools', sort_order: 1 }],
  });
  await stubGet(page, '/api/connectors/connections', {
    items: CONNECTORS_SCENE_CONNECTIONS,
    total: CONNECTORS_SCENE_CONNECTIONS.length,
    unhealthy: 0,
  });
  await stubGet(page, '/api/manifest/preserved', {
    mcp: entries,
    user_tools: [],
    extension_settings: {
      extensions_modules: [],
      backend_module: null,
      tools: [],
      mcp: [],
      api_tools: {},
    },
  });
  await stubGet(page, '/api/mcp-status', {
    bound: Object.fromEntries(entries.map((entry) => [entry.title, CONNECTORS_SCENE_TOOLS])),
    failed: [],
    health: {},
  });
}

/** The stored environment the `settings-env-recycle` scene's tab reads (forced, so the
 * shot frames rows rather than the demo stack's empty store). */
const ENV_SAVE_STORED = {
  env: {
    LOG_LEVEL: 'info',
    TAI_BUS_HEARTBEAT_TTL: '7',
    TAI_TOOL_RUNS_SHUTDOWN_DRAIN_SECONDS: '90',
  },
  secret_keys: [],
};

/** The forced response of an Environment-tab save that rolled a worker recycle (the
 * `settings-env-recycle` scene): two backend workers recycled onto fresh lives and the
 * writer's own deferred self-exit. Names only, as the server sends. */
const ENV_SAVE_RECYCLE_ROLL = {
  status: 'ok',
  env_keys: 4,
  awaiting_respawn: [],
  fanout: { mode: 'local-only', note: 'no worker bus configured; only this worker reloaded' },
  recycle: {
    recycle: [
      {
        name: 'backend-1',
        kind: 'backend',
        status: 'recycled',
        generation_before: 3,
        detail: null,
      },
      {
        name: 'backend-2',
        kind: 'backend',
        status: 'recycled',
        generation_before: 1,
        detail: null,
      },
      {
        name: 'serve-1',
        kind: 'serve',
        status: 'self-deferred',
        generation_before: 2,
        detail: null,
      },
    ],
    fresh: [
      { name: 'backend-1', kind: 'backend', generation: 4 },
      { name: 'backend-2', kind: 'backend', generation: 2 },
    ],
    recycle_stopped: null,
  },
};

/** The backup document the `backup-restore-recycle-stopped` scene uploads: one `env`
 * section (names only matter; the forced import response stands in for the restore). */
const BACKUP_RESTORE_DOCUMENT = {
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  sections: { env: { TAI_BUS_HEARTBEAT_TTL: '20' } },
};

/** The forced response of that restore (the docs-demo stack runs bare, where a
 * recycle-class restore is refused): one backend recycled, the roll stopped at the next,
 * and the server's verdict naming the workers still awaiting a restart. */
const BACKUP_RESTORE_STOPPED = {
  ok: true,
  sections: {
    env: {
      created: 0,
      updated: 1,
      skipped: 0,
      errors: [],
      details: {},
      fanout: { mode: 'local-only', note: 'no worker bus configured; only this worker reloaded' },
      recycle: {
        recycle: [
          {
            name: 'backend-1',
            kind: 'backend',
            status: 'recycled',
            generation_before: 3,
            detail: null,
          },
          {
            name: 'backend-2',
            kind: 'backend',
            status: 'timed-out',
            generation_before: 1,
            detail: 'its old life was still present after 90s',
          },
        ],
        fresh: [{ name: 'backend-1', kind: 'backend', generation: 4 }],
        recycle_stopped: {
          kind: 'backend',
          name: 'backend-2',
          detail: 'its old life was still present after 90s',
        },
      },
      awaiting_respawn: [
        { name: 'backend-2', keys: ['TAI_BUS_HEARTBEAT_TTL'] },
        { name: 'serve-1', keys: ['TAI_BUS_HEARTBEAT_TTL'] },
      ],
    },
  },
};

/** The forced export answer of the `backup-export-section-errors` scene: the document
 * with one section exported and the `storage` section named, with its message, in its
 * `errors` map (the docs-demo storage backend fails no read on demand). */
const BACKUP_EXPORT_SECTION_ERRORS = {
  version: 1,
  created_at: '2026-01-01T00:00:00Z',
  sections: { env: { TAI_BUS_HEARTBEAT_TTL: '20' } },
  errors: { storage: 'storage read failed: connection refused' },
};

/** The forced response of a profile apply whose recycle roll stopped (the
 * `profile-apply-recycle-stopped` scene): one backend recycled, the roll stopped at the
 * next, and the server's verdict naming the workers still awaiting a restart. */
const PROFILE_APPLY_STOPPED = {
  hot: ['LOG_LEVEL'],
  recycle: [
    { name: 'backend-1', kind: 'backend', status: 'recycled', generation_before: 3, detail: null },
    {
      name: 'backend-2',
      kind: 'backend',
      status: 'timed-out',
      generation_before: 1,
      detail: 'its old life was still present after 90s',
    },
  ],
  fresh: [{ name: 'backend-1', kind: 'backend', generation: 4 }],
  refused: [],
  recycle_stopped: {
    kind: 'backend',
    name: 'backend-2',
    detail: 'its old life was still present after 90s',
  },
  awaiting_respawn: [
    { name: 'backend-2', keys: ['TAI_BUS_HEARTBEAT_TTL'] },
    { name: 'serve-1', keys: ['TAI_BUS_HEARTBEAT_TTL'] },
  ],
  fanout: { mode: 'local-only', note: 'no worker bus configured; only this worker reloaded' },
};

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
    // The sync run panel's unreadable-answer panel: the run-tool body is forced to a bare
    // value with no `kind` (a body the live server never answers), so the api-client
    // refuses it and the panel shows the fixed sentence; Details is opened to show the
    // first issue. The error card appears only after the action runs the tool, past the
    // pre-action error guard; the wait below is the panel's own test id.
    name: 'run-answer-unreadable',
    path: '/tools?tool=studio_demo_form',
    wait: 'button:has-text("Run in background")',
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/run-tool',
        (route) => route.fulfill({ json: { data: { greeting: 'Hello, Ada' } } }),
      );
    },
    action: async (page) => {
      await page.getByLabel('name', { exact: true }).fill('Ada');
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      const panel = page.getByTestId('run-answer-unreadable');
      await panel.waitFor({ state: 'visible', timeout: 8000 });
      await panel.getByText('Details').click();
      await panel.scrollIntoViewIfNeeded();
    },
  },
  {
    // The background card of a parked run whose stored answer is in an older format: the
    // recent-runs list and the run's record are forced (the live store holds no such
    // record), the record's `result` a park body without a run-answer `kind`, so the
    // record read is refused and the card shows the fixed sentence; Details is opened.
    name: 'run-answer-parked-unreadable',
    path: '/tools?tool=studio_demo_form',
    wait: 'button:has-text("Run in background")',
    setup: async (page) => {
      const run = {
        run_id: 'run-parked-older',
        tool_name: 'studio_demo_form',
        status: 'parked',
        started_at: '2026-01-01T09:00:00+00:00',
        finished_at: '2026-01-01T09:00:02+00:00',
      };
      await page.route(
        (url) => url.pathname === '/api/tool-runs',
        (route) => route.fulfill({ json: { data: [run] } }),
      );
      await page.route(
        (url) => url.pathname === `/api/tool-runs/${run.run_id}`,
        (route) =>
          route.fulfill({
            json: {
              data: {
                ...run,
                result: { interaction_id: 'ask-1', interaction_ids: ['ask-1'] },
              },
            },
          }),
      );
    },
    action: async (page) => {
      await page.getByRole('button', { name: /run-parked-older/ }).click();
      const panel = page.getByTestId('tool-run-answer-unreadable');
      await panel.waitFor({ state: 'visible', timeout: 8000 });
      await panel.getByText('Details').click();
      await panel.scrollIntoViewIfNeeded();
    },
  },
  {
    // The conversation-route CREATE dialog for an AGENT target, framing the door-contract
    // section: the execution key and the five inline jq fields (Start / Reply / Cancel /
    // Resume / Extras) an asking route carries. The action opens the dialog and drives the
    // pickers: target `tools_agent`, the channel door on `web`, a typed identity and the
    // first listed execution key, then scrolls the section into view. Nothing is
    // submitted, so no backend state is touched. The first listed key varies with the
    // keys' creation times, so the frame is nondeterministic.
    name: 'conversation-route-agent-contract',
    path: '/conversations',
    wait: 'button:has-text("Create route")',
    nondeterministic: true,
    action: async (page) => {
      const dialog = await openAgentRouteDialog(page);
      await pickRouteOption(page, dialog, 'Agent', 'tools_agent');
      await fillWebDoor(page, dialog);
      await pickFirstExecutionKey(page, dialog);
      // The door-contract jq fields are the shot's subject: wait on the Reply-expression
      // field and scroll the execution key to the top so the section is framed.
      await dialog
        .getByText('Reply expression', { exact: true })
        .waitFor({ state: 'visible', timeout: 8000 });
      await routeDialogField(page, 'Execution key').evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      });
      // Move the pointer off the dialog so no field wears the hover border.
      await page.mouse.move(0, 0);
    },
  },
  {
    // The same CREATE dialog framing its Reply texts group: the route's own words for the
    // platform's fixed participant replies, each blank input drawing the built-in English.
    // The action fills the required fields and two of the group's inputs. Nothing is
    // submitted, so no backend state is touched and the frame is deterministic.
    name: 'conversation-route-reply-texts',
    path: '/conversations',
    wait: 'button:has-text("Create route")',
    action: async (page) => {
      const dialog = await openAgentRouteDialog(page);
      await pickRouteOption(page, dialog, 'Agent', 'tools_agent');
      await fillWebDoor(page, dialog);
      const replyTexts = dialog.getByRole('group', { name: 'Reply texts' });
      await replyTexts
        .getByRole('textbox', { name: /^Failed turn\b/ })
        .fill('Something went wrong, please try again.');
      const pairingCode = replyTexts.getByRole('textbox', { name: /^Pairing code(?! refused)/ });
      await pairingCode.fill('Your code is {pairing_code}. It works until {expires_at}.');
      // Drop the focus and move the pointer off the dialog so no input wears the focus or
      // hover border, then scroll the group's heading and hint, which sit just above its
      // box, to the top of the dialog.
      await pairingCode.blur();
      await page.mouse.move(0, 0);
      await dialog.getByText('Reply texts', { exact: true }).evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      });
    },
  },
  {
    // The route CREATE dialog framing its Door group once the `web` channel is picked: the
    // "Our identity" field's description is that channel's own declared identity hint.
    name: 'conversation-route-channel-hint',
    path: '/conversations',
    wait: 'button:has-text("Create route")',
    action: async (page) => {
      const dialog = await openAgentRouteDialog(page);
      await fillWebDoor(page, dialog);
      await dialog
        .getByText('Any name you choose', { exact: false })
        .waitFor({ state: 'visible', timeout: 8000 });
      // Drop the typed field's focus ring and the pointer's hover border from the frame.
      await dialog.getByRole('textbox', { name: 'Our identity' }).blur();
      await page.mouse.move(0, 0);
    },
    frame: (page) => routeDialogField(page, 'Door', { group: true }),
  },
  {
    // The route CREATE dialog framing its Target group when the session may not list
    // agents: `GET /api/agents` answers 403, so the Agent picker draws its refused note.
    name: 'conversation-route-no-grant',
    path: '/conversations',
    wait: 'button:has-text("Create route")',
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/agents',
        async (route) => {
          if (route.request().method() !== 'GET') {
            await route.fallback();
            return;
          }
          await route.fulfill({ status: 403, json: { error: 'Forbidden' } });
        },
      );
    },
    action: async (page) => {
      const dialog = await openAgentRouteDialog(page);
      await dialog
        .getByText('This session cannot list agents', { exact: false })
        .waitFor({ state: 'visible', timeout: 8000 });
      await page.mouse.move(0, 0);
    },
    frame: (page) => routeDialogField(page, 'Target', { group: true }),
  },
  {
    // The route EDIT dialog framing its Execution key field for an admin session whose
    // stored route runs as another identity: the key is not a listed key of this session,
    // and the field says whose identity it is not. The routes list carries one stub route
    // bound to `svc-other`; the session answer is the live one with a fixed `user_id`.
    name: 'conversation-route-key-not-own',
    path: '/conversations',
    wait: `button[aria-label="Edit route ${STUB_CHANNEL_ROUTE.route_name}"]`,
    setup: async (page) => {
      await stubGet(
        page,
        '/api/conversations',
        pageOf([{ ...STUB_CHANNEL_ROUTE, execution_key: 'svc-other' }]),
      );
      await stubSessionFields(page, { user_id: FRAMED_SESSION_USER });
    },
    action: async (page) => {
      await page
        .getByRole('button', { name: `Edit route ${STUB_CHANNEL_ROUTE.route_name}` })
        .click();
      await page
        .getByRole('dialog')
        .getByText(`svc-other is not this session's identity (${FRAMED_SESSION_USER}).`)
        .waitFor({ state: 'visible', timeout: 8000 });
      await page.mouse.move(0, 0);
    },
    frame: (page) => routeDialogField(page, 'Execution key'),
  },
  {
    // The route CREATE dialog framing its Execution key field with this session's own
    // identity picked, for an api-key session whose owner holds no listed keys: the field
    // says the route runs as that identity with its live grants, and how to mint a
    // narrower key. The key list is stubbed empty and the session answer is the live one
    // laid over with the key's owner and principal.
    name: 'conversation-route-own-identity',
    path: '/conversations',
    wait: 'button:has-text("Create route")',
    setup: async (page) => {
      await stubGet(page, '/api/auth/tokens-payload', []);
      await stubSessionFields(page, {
        user_id: FRAMED_SESSION_USER,
        owner_user_id: 'docs-owner',
        principal: { user_id: 'docs-owner', display_name: 'docs-owner', kind: 'human' },
      });
    },
    action: async (page) => {
      const dialog = await openAgentRouteDialog(page);
      await pickRouteOption(
        page,
        dialog,
        'Execution key',
        `${FRAMED_SESSION_USER} — this session's identity`,
      );
      await dialog
        .getByText(
          `This runs as this session's own identity, ${FRAMED_SESSION_USER}, with its live grants.`,
          { exact: true },
        )
        .waitFor({ state: 'visible', timeout: 8000 });
      await page.mouse.move(0, 0);
    },
    frame: (page) => routeDialogField(page, 'Execution key'),
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
  {
    // The schedules table with one row of each kind the page renders: an interval, a cron and a
    // row carrying the backend's last scheduling failure. The listing is FORCED (the demo backend
    // seeds no schedule and records no failure); the rows are fixed, so the frame is
    // deterministic. The table's card is framed, leaving out the live server clock.
    name: 'scheduling-rows',
    path: '/scheduling',
    wait: 'text=Every 3600s',
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/schedules',
        (route) =>
          route.request().method() === 'GET'
            ? route.fulfill({ json: { data: SCHEDULE_ROWS } })
            : route.fallback(),
      );
    },
    action: async (page) => {
      await page
        .locator('[data-testid="schedule-error-badge"]')
        .waitFor({ state: 'visible', timeout: 8000 });
    },
    frame: (page) => page.locator('.tai-card:has(table)'),
  },
  {
    // The add-schedule dialog with a four-field cron expression submitted: the cron field shows
    // its length error and nothing is sent, so no schedule is created.
    name: 'schedule-cron-error',
    path: '/scheduling',
    wait: 'button:has-text("Add schedule")',
    action: async (page) => {
      await page.getByRole('button', { name: 'Add schedule' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add schedule' });
      await dialog.getByLabel('Name').fill('nightly-refresh');
      await dialog.getByRole('combobox', { name: 'Tool' }).click();
      await page.getByRole('option', { name: 'studio_demo_echo' }).click();
      await dialog.getByLabel('Cron expression').fill('0 2 * *');
      await dialog.getByRole('button', { name: 'Create schedule' }).click();
      const cronError = dialog.getByText(
        'Use 5 fields (minute hour day-of-month month day-of-week)',
        { exact: false },
      );
      await cronError.waitFor({ state: 'visible', timeout: 8000 });
      // The submit leaves the dialog scrolled to its footer; bring the cron field and its error
      // back to the middle of the dialog, where the operator reads them.
      await cronError.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    },
  },
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
    // The profile apply report for a recycle roll that stopped: the shared recycle rows
    // (one recycled backend, the backend the roll stopped at with its reason), the stop
    // panel, and the server's verdict — the workers still awaiting a restart — in the fleet
    // report's restart panel. The diff is the live seeded `production` profile's; the apply's
    // response is the forced payload below (the docs-demo stack runs bare, where a
    // recycle-class apply is refused). The dialog is captured whole.
    name: 'profile-apply-recycle-stopped',
    path: '/settings',
    wait: 'text=LoggingSettings',
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/config/profiles/production/apply',
        (route) => route.fulfill({ json: { data: PROFILE_APPLY_STOPPED } }),
      );
    },
    action: async (page) => {
      await page.getByRole('tab', { name: 'Profiles' }).click();
      await page.getByRole('button', { name: 'Apply profile production' }).click();
      const apply = page.getByRole('button', { name: 'Apply profile', exact: true });
      await apply.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
      await page
        .locator('button:enabled', { hasText: /^Apply profile$/ })
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
      await apply.click();
      await page
        .locator('[data-testid="recycle-stopped"]')
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    },
    frame: (page) => page.getByRole('dialog'),
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
  {
    // The Environment tab after a save that rolled a worker recycle: the shared recycle
    // rows (a recycled backend joined onto its fresh life, the writer's own self-deferred
    // line). The docs-demo stack runs bare, where a recycle-class save is refused, so the
    // save's response is the forced roll payload below, and the stored env the tab reads is
    // forced too (the demo store is empty). The action opens the tab, saves,
    // and waits for the "Worker recycle" region; the Environment variables card is
    // captured whole. Deterministic — the rows come entirely from the forced payload.
    name: 'settings-env-recycle',
    path: '/settings',
    wait: 'text=LoggingSettings',
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/config/env',
        async (route) => {
          if (route.request().method() !== 'POST') {
            await route.fulfill({ json: { data: ENV_SAVE_STORED } });
            return;
          }
          await route.fulfill({ json: { data: ENV_SAVE_RECYCLE_ROLL } });
        },
      );
    },
    action: async (page) => {
      await page.getByRole('tab', { name: 'Environment' }).click();
      await page.getByRole('button', { name: 'Save' }).click();
      await page
        .getByRole('region', { name: 'Worker recycle' })
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    },
    frame: (page) =>
      page
        .locator('.tai-card')
        .filter({ has: page.getByRole('heading', { name: 'Environment variables', level: 3 }) }),
  },
  {
    // The Backup tab's import report after an env-section restore whose recycle roll
    // stopped: the section row, the restart list the server's verdict names, and the
    // recycle rows with the stop panel. The import response is the forced payload above
    // (the docs-demo stack runs bare, where a recycle-class restore is refused); the
    // uploaded document is the synthetic one beside it. The Import card is captured whole.
    name: 'backup-restore-recycle-stopped',
    path: '/settings',
    wait: 'text=LoggingSettings',
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/backup/import',
        (route) => route.fulfill({ json: { data: BACKUP_RESTORE_STOPPED } }),
      );
    },
    action: async (page) => {
      await page.getByRole('tab', { name: 'Backup' }).click();
      await page.getByLabel('Backup file').setInputFiles({
        name: 'backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(BACKUP_RESTORE_DOCUMENT)),
      });
      await page.getByRole('button', { name: 'Import selected' }).click();
      await page
        .locator('[data-testid="recycle-stopped"]')
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    },
    frame: (page) =>
      page
        .locator('.tai-card')
        .filter({ has: page.getByRole('heading', { name: 'Import', level: 3 }) }),
  },
  {
    // The Backup tab's Export card after an export whose document names a failed
    // section: the file still downloads, and the warning under the section checklist
    // names the `storage` section with its message. The export answer is the forced
    // document above; the section checklist is live. The Export card is captured whole.
    name: 'backup-export-section-errors',
    path: '/settings',
    wait: 'text=LoggingSettings',
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/backup/export',
        (route) => route.fulfill({ json: BACKUP_EXPORT_SECTION_ERRORS }),
      );
    },
    action: async (page) => {
      await page.getByRole('tab', { name: 'Backup' }).click();
      const download = page.waitForEvent('download', { timeout: WAIT_TIMEOUT });
      await page.getByRole('button', { name: 'Export backup' }).click();
      await download;
      await page
        .locator('[data-testid="export-section-errors"]')
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    },
    frame: (page) =>
      page
        .locator('.tai-card')
        .filter({ has: page.getByRole('heading', { name: 'Export', level: 3 }) }),
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
    // number row, and a secret-reference row showing the committed env-key chip.
    name: 'preset-kwargs-fields',
    path: '/presets',
    wait: 'button:has-text("Create preset")',
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
    action: async (page) => {
      const dialog = await authorPresetKwargs(page);
      await dialog.getByRole('button', { name: 'JSON' }).click();
      await dialog.getByLabel('Fixed kwargs JSON').waitFor({ state: 'visible', timeout: 8000 });
      await frameKwargsEditor(page);
    },
  },
  {
    // The create-preset dialog after authoring the preset's input and output: an input
    // schema for what callers send, the input map that turns that input into the base
    // tool's arguments, and the output map that reshapes the tool's result. The section
    // runs from the Input schema label to the Output map; the viewport grows to hold it
    // whole and the Input schema field is scrolled to the dialog's top. Nothing is
    // submitted, so no backend state is touched.
    name: 'preset-maps',
    path: '/presets',
    wait: 'button:has-text("Create preset")',
    action: async (page) => {
      await page.getByRole('button', { name: 'Create preset' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('textbox', { name: 'Name' }).fill('greet_visitor');
      await dialog.getByRole('textbox', { name: /Description/ }).fill('Greets a visitor by name.');
      await dialog.getByRole('combobox', { name: /Base tool/ }).click();
      await page.getByRole('option', { name: 'studio_demo_form' }).first().click();
      // Laid out by hand to fit the editor's ten rows, so the whole schema shows.
      await dialog
        .getByLabel('Input schema JSON')
        .fill(
          [
            '{',
            '  "type": "object",',
            '  "properties": {',
            '    "who": { "type": "string", "description": "Who to greet." }',
            '  },',
            '  "required": ["who"],',
            '  "additionalProperties": false',
            '}',
          ].join('\n'),
        );
      await dialog
        .getByTestId('binding-jq-input-map')
        .getByRole('textbox')
        .first()
        .fill('{name: .who, mood: "cheerful"}');
      const outputMap = dialog.getByTestId('binding-jq-output-map');
      await outputMap.getByRole('textbox').first().fill('{text: .greeting}');
      await outputMap.getByRole('textbox').first().blur();
      await page.mouse.move(0, 0);
      const inputSchema = dialog.getByTestId('create-preset-input-schema');
      const top = await inputSchema.evaluate((el) => el.getBoundingClientRect().top);
      const bottom = await outputMap.evaluate((el) => el.getBoundingClientRect().bottom);
      const scroller = await inputSchema.evaluate((el) => {
        let node = el.parentElement;
        while (node && node.scrollHeight <= node.clientHeight) node = node.parentElement;
        if (!node) throw new Error('preset-maps: the create dialog has no scrolling body');
        return node.getBoundingClientRect().height;
      });
      const grow = Math.max(0, Math.ceil(bottom - top - scroller) + 48);
      if (grow > 0) {
        await page.setViewportSize({ width: VIEWPORT.width, height: VIEWPORT.height + grow });
        await page.waitForTimeout(200);
      }
      await inputSchema.evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      });
    },
  },
  // --- States screens (the platform state store) -------------------------------
  // The nine frames the docs "## States" section shows, all under the seeded `notes`
  // state (the `docs-screenshots.sh` state-store seeding declares it, attaches a template, writes two subject
  // records and registers a consumer hook, and uploads the typed `display` template; the pending saves
  // and the held saves are forced payloads).
  // Each waits on a stable, populated element — a table row, a tab's populated control, or the record
  // page's own document/audit — never a bare timeout. The pending saves' ages are relative to the
  // capture. Both Records frames show the subjects' Updated timestamps, written by the seed at boot;
  // the held-line frame carries the `nondeterministic` flag.
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
    // The state-template screen of the seeded unattached `display` template, whose typed
    // sections all render: the fields, Write policies, Parameters and the Trace writes line.
    // Waits on the Parameters heading and the trace line; the template card is captured whole.
    name: 'state-template-typed',
    path: '/states?template=display',
    wait: '[data-testid="template-trace"]',
    action: async (page) => {
      await page
        .getByRole('heading', { name: 'Parameters', level: 3 })
        .waitFor({ state: 'visible', timeout: 8000 });
    },
    frame: (page) => page.locator('[data-testid="state-template-detail"]'),
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
    // The Pending saves card with a failed save and the outstanding save held behind it,
    // from the forced pending-saves payload above (the live `notes` list stays beneath it).
    // The card opens on its Failed tab; the action switches to All outstanding so both rows
    // are framed, and waits for the newer save's row. The card is captured whole.
    name: 'states-pending-saves',
    path: '/states',
    wait: '[data-testid="pending-saves-summary"]',
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/state-pending-saves',
        (route) =>
          route.fulfill({
            json: {
              data: pendingSavesPage(new URL(route.request().url()).searchParams.get('status')),
            },
          }),
      );
    },
    action: async (page) => {
      await page.getByRole('tab', { name: 'All outstanding' }).click();
      await page
        .locator('#state-pending-saves')
        .getByRole('cell', { name: '42', exact: true })
        .waitFor({ state: 'visible', timeout: 8000 });
    },
    frame: (page) => page.locator('#state-pending-saves'),
  },
  {
    // The Records tab with the held line above the subjects table, from the live subjects page
    // with the forced `held` entries above. Waits on the line, which renders only for a held
    // subject, then on the listed subject it names. The Subjects card is captured whole, so the
    // line and the table it glosses are framed together.
    name: 'states-records-held',
    path: '/states?state=notes&tab=records',
    nondeterministic: true,
    wait: '[data-testid="held-subjects-line"]',
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/states/notes/subjects',
        async (route) => {
          const response = await route.fetch();
          const body = await response.json();
          await route.fulfill({
            response,
            json: { ...body, data: { ...body.data, held: HELD_ON_SUBJECTS_PAGE } },
          });
        },
      );
    },
    action: async (page) => {
      await page.getByText('t-002').first().waitFor({ state: 'visible', timeout: 8000 });
    },
    frame: (page) =>
      page
        .locator('.tai-card')
        .filter({ has: page.getByRole('heading', { name: 'Subjects', level: 3 }) }),
  },
  {
    // The Check records card after a walk of the `notes` thread records: the live check page
    // with the forced misfit above added to its first page. The action runs the check and waits
    // for the misfit's row. The card is captured whole, so the summary and the misfits table are
    // framed without the subjects table above it.
    name: 'states-records-check',
    path: '/states?state=notes&tab=records',
    wait: 'h3:has-text("Check records against the schema")',
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/states/notes/records/check',
        async (route) => {
          const response = await route.fetch();
          const body = await response.json();
          const first = !new URL(route.request().url()).searchParams.has('cursor');
          const items = first ? [CHECK_RECORDS_MISFIT, ...body.data.items] : body.data.items;
          await route.fulfill({ response, json: { ...body, data: { ...body.data, items } } });
        },
      );
    },
    action: async (page) => {
      await page.getByRole('button', { name: 'Check records', exact: true }).click();
      await page
        .getByTestId('check-summary')
        .filter({ hasText: '1 do not fit' })
        .waitFor({ state: 'visible', timeout: 8000 });
      await checkRecordsCard(page)
        .getByRole('button', { name: CHECK_RECORDS_MISFIT.subject.key, exact: true })
        .waitFor({ state: 'visible', timeout: 8000 });
    },
    frame: checkRecordsCard,
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
    // (a backend that declares exclusions), so the filters a cost sort cannot carry render
    // disabled. Matched on the pathname, registered before navigation.
    setup: forceExcludingCapabilities,
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
    name: 'tracing-link-not-served',
    path: '/observability?tab=tracing&sort=cost&dir=desc&status=error',
    wait: '[data-testid="observability-read-not-served"]',
    // The same forced declaration: a cost sort cannot carry the status filter the link sets.
    setup: forceExcludingCapabilities,
    // The notice is the shot: refuse to capture unless it names the sort and offers the way out.
    action: async (page) => {
      const notice = page.getByTestId('observability-read-not-served');
      const expected = [
        notice.getByText(
          'The monitoring backend does not sort runs by Cost with the filters in this link.',
        ),
        notice.getByRole('button', { name: 'Sort newest first' }),
      ];
      for (const locator of expected) {
        await locator.waitFor({ state: 'visible', timeout: WAIT_TIMEOUT }).catch((error) => {
          throw new Error(
            'tracing-link-not-served: the not-served notice does not show its message and its "Sort newest first" button — refusing to ship a wrong screenshot',
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
  // A non-empty `user_tools` renders the manifest JSON tree with that key; the "MCP
  // servers" block lists the mounted servers above its config editor; the Extensions
  // section lists the loaded `ask_external` and the manifest's extension settings.
  {
    name: 'manifest',
    path: '/manifest',
    wait: 'text=user_tools',
    action: async (page) => {
      await page
        .getByRole('region', { name: 'MCP servers' })
        .getByText('Mounted servers')
        .waitFor({ state: 'visible', timeout: 8000 });
      const section = page.getByRole('region', { name: 'Extensions' });
      await section.getByText('Loaded extensions').waitFor({ state: 'visible', timeout: 8000 });
      await section.getByText('ask_external').first().waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    // The Served endpoints registry: the sub-MCP list above its inline create form. The
    // runner seeds no sub-MCP, so the list's empty state is the settled signal.
    name: 'served-endpoints',
    path: '/served-endpoints',
    wait: 'text=No sub-MCP servers',
  },
  {
    // The Storage browser over the storage-local root the runner points at the seeded
    // files, deep-linked to one: the list row and the detail's content both render.
    name: 'storage',
    path: '/storage?id=welcome-email.md',
    wait: '[aria-label="Open welcome-email.md"]',
    action: async (page) => {
      await page.locator('text=Subject:').first().waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    // The seeded `jq/gate` is named by the seeded `gate-watch` hook's condition, so its
    // Delete is refused and the dialog lists the hook. The dialog is captured whole.
    name: 'storage-delete-held',
    path: '/storage?id=jq/gate',
    wait: '[aria-label="Delete jq/gate"]',
    action: async (page) => {
      await page.getByRole('button', { name: 'Delete jq/gate' }).click();
      const dialog = page.getByRole('dialog', { name: 'Delete resource' });
      await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
      await dialog
        .getByText('Still used by — remove these first:')
        .waitFor({ state: 'visible', timeout: 8000 });
    },
    frame: (page) => page.getByRole('dialog', { name: 'Delete resource' }),
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
    // `GET /api/system/kinds` (the docs-demo mounts `system_kinds`), which returns
    // one row per pluggable kind and per gated feature; a failed query renders the card's own inline ErrorState
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
    // the Pending invitations table, each row naming its provider in the Provider column and
    // its actions joined from the declared `GET /api/auth/member-actions` catalog. The runner seeds a realistic membership (an
    // admin owner + an active editor and viewer + a pending invite) before capture, so both
    // tables are populated; the forced row above adds a person whose logins hold different
    // roles. Waits on the seeded owner's People row, and the action requires the seeded
    // pending invite row and the forced row's "Mixed roles" badge so every state is framed.
    name: 'members',
    path: '/members',
    wait: 'text=ada.lovelace@demo.tai',
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/auth/members',
        async (route) => {
          const response = await route.fetch();
          const body = await response.json();
          await route.fulfill({
            response,
            json: { ...body, data: withMixedRolesMember(body.data) },
          });
        },
      );
    },
    action: async (page) => {
      await page
        .locator('[data-testid="mixed-roles-badge"]')
        .waitFor({ state: 'visible', timeout: 8000 });
      await page
        .locator('[data-testid="invite-row"]')
        .first()
        .waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    // A member action's INPUT dialog: the page-scoped "Invite a user" action opens the
    // platform `SchemaForm` over the action's declared input schema (Email + Role). Filled,
    // never submitted, so no account is created and the frame is deterministic.
    name: 'member-action-input',
    path: '/members',
    wait: 'text=ada.lovelace@demo.tai',
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
    // step, never confirmed, so no account is removed and the frame is deterministic.
    name: 'member-action-confirm',
    path: '/members',
    wait: 'text=alan.turing@demo.tai',
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
    // view changes.
    name: 'member-action-result',
    nondeterministic: true,
    path: '/members',
    wait: 'text=katherine.johnson@demo.tai',
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
    // The Marketplace list: the minimal seeded registry (MARKETPLACE_URL) answers with
    // one published plugin, so the card is the same on every run.
    name: 'marketplace',
    path: '/marketplace',
    wait: 'text=Alerts Relay',
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
    name: 'marketplace-install',
    path: '/marketplace?plugin=acme/alerts-relay',
    // The detail page's Install button proves the listing loaded populated.
    wait: 'button:has-text("Install")',
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
    // The Connectors page: the directory (a provider with its two connections and "Add
    // another account", a never-connected provider, the connections' and a hand-added
    // server's entries, and the registry's marketplace listings) above "Your
    // connections". The stubbed connections' rows are the settled signal.
    name: 'connectors',
    path: '/connectors',
    wait: 'text=Your connections',
    setup: stubConnectorsScene,
    action: async (page) => {
      await page
        .getByRole('button', { name: 'Add another account' })
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
      await page
        .getByRole('list', { name: 'Connections to Acme files' })
        .getByRole('button', { name: 'Pick tools for personal' })
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    },
  },
  {
    // The connect flow at Pick tools for the hand-added server: the tools it advertises,
    // each with its tick. The advertised read is a probe of the server, answered by a
    // route stub; nothing is saved.
    name: 'connectors-pick-tools',
    path: '/connectors',
    wait: 'text=Your connections',
    setup: async (page) => {
      await stubConnectorsScene(page);
      await page.route(
        (url) => url.pathname === `/api/mcp-status/${CONNECTORS_SCENE_SERVER}/advertised-tools`,
        (route) =>
          route.fulfill({
            json: {
              data: {
                title: CONNECTORS_SCENE_SERVER,
                include: [],
                exclude: [],
                unadvertised: [],
                tools: CONNECTORS_SCENE_TOOLS.map((name) => ({
                  name,
                  title: null,
                  description: null,
                  bound: true,
                  selected: true,
                  unbound_reason: null,
                })),
              },
            },
          }),
      );
    },
    action: async (page) => {
      await page
        .getByRole('row')
        .filter({ has: page.locator(`[data-directory-row="server:${CONNECTORS_SCENE_SERVER}"]`) })
        .getByRole('button', { name: 'Pick tools' })
        .click();
      const dialog = page.getByRole('dialog', { name: `Pick tools: ${CONNECTORS_SCENE_SERVER}` });
      const all = dialog.getByRole('checkbox', {
        name: 'Mount every tool, including tools the server adds later',
      });
      await all.waitFor({ state: 'visible', timeout: 8000 });
      await all.click();
      await dialog
        .getByRole('checkbox', { name: 'list_sources' })
        .waitFor({ state: 'visible', timeout: 8000 });
    },
  },
  {
    // The Connectors page with the "Add MCP server" dialog, opened from the header's "Add a
    // custom server", at its review step: where the server signs in, its app registration,
    // and the prefilled name, identifier and scopes. The single look-up call is answered by a route stub — the docs-demo backend has no
    // OAuth-protected server to look up — and nothing is added, so the frame is
    // deterministic.
    name: 'connectors-add-server',
    path: '/connectors',
    wait: 'button:has-text("Add a custom server")',
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/connectors/providers/discover',
        (route) => route.fulfill({ json: { data: ADD_SERVER_LOOKUP } }),
      );
    },
    action: async (page) => {
      await page.getByRole('button', { name: 'Add a custom server' }).click();
      const dialog = page.getByRole('dialog', { name: 'Add MCP server' });
      await dialog.getByLabel('Server address').fill(ADD_SERVER_LOOKUP.url);
      await dialog.getByRole('button', { name: 'Look up' }).click();
      await dialog
        .getByRole('button', { name: 'Add server' })
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
    // backend mints none). The record is stamped relative to the capture, so the frame is
    // the same on every run.
    name: 'conversation-inbound-attachments',
    path: `/conversations?route=${encodeURIComponent(ATTACHMENT_TRANSCRIPT_ROUTE)}&thread=${encodeURIComponent(ATTACHMENT_TRANSCRIPT_THREAD)}`,
    wait: '[data-testid="media-document"]',
    setup: async (page) => {
      const at = Math.floor(Date.now() / 1000) - ATTACHMENT_MINUTES_AGO * 60;
      await stubGet(page, '/api/conversations', pageOf([STUB_CHANNEL_ROUTE]));
      await stubGet(
        page,
        `/api/conversations/${ATTACHMENT_TRANSCRIPT_ROUTE}/threads`,
        pageOf([
          {
            thread_id: ATTACHMENT_TRANSCRIPT_THREAD,
            client_address: ATTACHMENT_TRANSCRIPT_ADDRESS,
            last_activity_at: at,
            message_count: 1,
            last_delivery_status: 'delivered',
          },
        ]),
      );
      await stubGet(page, `/api/conversations/${ATTACHMENT_TRANSCRIPT_ROUTE}/thread/mode`, {
        mode: 'agent',
        source: 'route',
      });
      await stubGet(
        page,
        `/api/conversations/${ATTACHMENT_TRANSCRIPT_ROUTE}/transcript`,
        pageOf([{ ...ATTACHMENT_TRANSCRIPT_RECORD, created_at: at, updated_at: at }], {
          order: 'desc',
          person_id: null,
        }),
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
  {
    // A transcript whose visitor turns quote earlier messages, forced through route overrides
    // (the live demo backend runs no channel that quotes): a held quote with its text above the
    // message and a quote the thread does not hold, naming its id. The shot is the whole
    // transcript card, which runs past the viewport. The records are stamped relative to the
    // capture, so the frame is the same on every run.
    name: 'conversation-inbound-reply-to',
    path: `/conversations?route=${encodeURIComponent(ATTACHMENT_TRANSCRIPT_ROUTE)}&thread=${encodeURIComponent(ATTACHMENT_TRANSCRIPT_THREAD)}`,
    wait: '[data-testid="exchange-quote"][data-status="not_found"]',
    setup: async (page) => {
      const now = Math.floor(Date.now() / 1000);
      const records = REPLY_TO_TRANSCRIPT_RECORDS.map(({ minutesAgo, ...record }) => {
        const at = now - minutesAgo * 60;
        return { ...record, created_at: at, updated_at: at };
      });
      const newest = records[records.length - 1];
      await stubGet(page, '/api/conversations', pageOf([STUB_CHANNEL_ROUTE]));
      await stubGet(
        page,
        `/api/conversations/${ATTACHMENT_TRANSCRIPT_ROUTE}/threads`,
        pageOf([
          {
            thread_id: ATTACHMENT_TRANSCRIPT_THREAD,
            client_address: ATTACHMENT_TRANSCRIPT_ADDRESS,
            last_activity_at: newest.created_at,
            message_count: records.length,
            last_delivery_status: newest.delivery_status,
          },
        ]),
      );
      await stubGet(page, `/api/conversations/${ATTACHMENT_TRANSCRIPT_ROUTE}/thread/mode`, {
        mode: 'agent',
        source: 'route',
      });
      // The transcript door reads newest first; the page reverses it to reading order.
      await stubGet(
        page,
        `/api/conversations/${ATTACHMENT_TRANSCRIPT_ROUTE}/transcript`,
        pageOf([...records].reverse(), { order: 'desc', person_id: null }),
      );
    },
    frame: (page) =>
      page
        .locator('.tai-card')
        .filter({ has: page.getByTestId('conversation-transcript') })
        .last(),
  },
  {
    // A transcript carrying the platform's own sends beside a visitor turn, forced through
    // route overrides (the live demo backend records no channel sends). The two delivery
    // details are opened, and the shot is the whole transcript card, which runs past the
    // viewport. The records are stamped relative to the capture, so the frame is the same on
    // every run.
    name: 'conversation-transcript-sends',
    path: `/conversations?route=${encodeURIComponent(ATTACHMENT_TRANSCRIPT_ROUTE)}&thread=${encodeURIComponent(ATTACHMENT_TRANSCRIPT_THREAD)}`,
    wait: '[data-testid="exchange-mid-turn-send"]',
    setup: async (page) => {
      const records = sendsTranscriptRecords(Math.floor(Date.now() / 1000));
      const newest = records[records.length - 1];
      await stubGet(page, '/api/conversations', pageOf([STUB_CHANNEL_ROUTE]));
      await stubGet(
        page,
        `/api/conversations/${ATTACHMENT_TRANSCRIPT_ROUTE}/threads`,
        pageOf([
          {
            thread_id: ATTACHMENT_TRANSCRIPT_THREAD,
            client_address: ATTACHMENT_TRANSCRIPT_ADDRESS,
            last_activity_at: newest.created_at,
            message_count: records.length,
            last_delivery_status: newest.delivery_status,
          },
        ]),
      );
      await stubGet(page, `/api/conversations/${ATTACHMENT_TRANSCRIPT_ROUTE}/thread/mode`, {
        mode: 'agent',
        source: 'route',
      });
      // The transcript door reads newest first; the page reverses it to reading order.
      await stubGet(
        page,
        `/api/conversations/${ATTACHMENT_TRANSCRIPT_ROUTE}/transcript`,
        pageOf([...records].reverse(), { order: 'desc', person_id: null }),
      );
    },
    action: async (page) => {
      await openDeliveryDetail(page, 'Your weekly summary is ready.');
      await openDeliveryDetail(page, 'Your export link expires tomorrow.');
      await page
        .getByTestId('conversation-transcript')
        .getByText('Sent, outcome unknown')
        .waitFor({ state: 'visible', timeout: 8000 });
    },
    frame: (page) =>
      page
        .locator('.tai-card')
        .filter({ has: page.getByTestId('conversation-transcript') })
        .last(),
  },
  {
    // The thread list's multi-select surface over the forced route's three threads: the header
    // checkbox ticks every loaded row and reveals the "Reset selected (3)" danger action. The
    // DELETE capability the action is gated on comes from the full-admin key.
    name: 'conversation-bulk-reset-select',
    path: `/conversations?route=${encodeURIComponent(BULK_RESET_ROUTE)}`,
    wait: '[data-testid="conversation-threads-table"]',
    setup: async (page) => {
      await stubBulkResetDoors(page, { answerDeletes: false });
    },
    action: selectAllThreads,
  },
  {
    // The "Reset selected threads" confirm, whose copy and confirm label name the count. It is
    // never confirmed, so nothing is deleted.
    name: 'conversation-bulk-reset-confirm',
    path: `/conversations?route=${encodeURIComponent(BULK_RESET_ROUTE)}`,
    wait: '[data-testid="conversation-threads-table"]',
    setup: async (page) => {
      await stubBulkResetDoors(page, { answerDeletes: false });
    },
    action: async (page) => {
      await selectAllThreads(page);
      await page.getByRole('button', { name: BULK_RESET_ACTION }).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: BULK_RESET_CONFIRM })
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    },
  },
  {
    // The per-item result of a confirmed reset: the stubbed DELETE door resets two threads,
    // which drop from the list, and answers 409 for the third, which stays as a failed row
    // with its reason and a Retry beside the "2 threads reset." summary.
    name: 'conversation-bulk-reset-result',
    path: `/conversations?route=${encodeURIComponent(BULK_RESET_ROUTE)}`,
    wait: '[data-testid="conversation-threads-table"]',
    setup: async (page) => {
      await stubBulkResetDoors(page, { answerDeletes: true });
    },
    action: async (page) => {
      await selectAllThreads(page);
      await page.getByRole('button', { name: BULK_RESET_ACTION }).click();
      await page.getByRole('dialog').getByRole('button', { name: BULK_RESET_CONFIRM }).click();
      await page
        .getByTestId('conversation-bulk-reset-result')
        .getByRole('button', { name: 'Retry' })
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    },
  },
  {
    // The entry-gate panel on the gated `relay` route: the "Require an entry code" box
    // ticked and the seeded `launch` code's row. Nondeterministic: the row's Created
    // instant is stamped when the runner mints the code, so it differs every run.
    name: 'entry-gate',
    nondeterministic: true,
    path: `/conversations?route=${encodeURIComponent(ENTRY_GATE_ROUTE)}`,
    wait: `${WEB_CHAT_PANEL} td:text-is("launch")`,
  },
  {
    // The panel on the ungated `relay-open` route, which holds no code. A code an earlier
    // `entry-gate-mint` frame minted on it (the other theme's pass) is revoked first, so
    // the frame always shows the empty state.
    name: 'entry-gate-empty',
    path: `/conversations?route=${encodeURIComponent(ENTRY_GATE_OPEN_ROUTE)}`,
    wait: `${WEB_CHAT_PANEL} >> text=No entry codes`,
    setup: async (page) => {
      await revokeEntryCodes(page, ENTRY_GATE_OPEN_ROUTE);
    },
  },
  {
    // The shown-once mint dialog on `relay-open`, after a real mint through the panel.
    // Nondeterministic: the minted code (and the chat link carrying it) is fresh each run.
    // The other theme's pass minted on this route too, so its codes are revoked first and
    // the dialog opens over the same empty panel in both themes.
    name: 'entry-gate-mint',
    nondeterministic: true,
    path: `/conversations?route=${encodeURIComponent(ENTRY_GATE_OPEN_ROUTE)}`,
    wait: `${WEB_CHAT_PANEL} >> text=No entry codes`,
    setup: async (page) => {
      await revokeEntryCodes(page, ENTRY_GATE_OPEN_ROUTE);
    },
    action: async (page) => {
      await page.locator(WEB_CHAT_PANEL).getByRole('button', { name: 'Mint entry code' }).click();
      const dialog = page.getByRole('dialog', { name: 'Mint entry code' });
      await dialog.getByRole('button', { name: 'Mint code' }).click();
      await dialog
        .getByText('This code is shown once', { exact: false })
        .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
    },
  },
  {
    // The panel's unavailable card: the real `GET /api/plugins` answer with the web
    // channel's `mounts` emptied, so its plugin registers with no gate route to call (the
    // live boot always mounts the web channel's doors).
    name: 'entry-gate-unavailable',
    path: `/conversations?route=${encodeURIComponent(ENTRY_GATE_ROUTE)}`,
    wait: `${WEB_CHAT_PANEL} >> text=Entry gate unavailable`,
    setup: async (page) => {
      await page.route(
        (url) => url.pathname === '/api/plugins',
        async (route) => {
          const response = await route.fetch();
          const body = await response.json();
          const channelWeb = body.data.find((entry) => entry.name === 'tai42_channel_web');
          if (channelWeb === undefined) {
            throw new Error('entry-gate-unavailable: GET /api/plugins lists no tai42_channel_web');
          }
          channelWeb.mounts = {};
          await route.fulfill({ response, json: body });
        },
      );
    },
  },
  {
    // The panel's words section on the gated `relay` route, its stored words loaded into
    // the form. The section sits under the entry-gate section, so the shot scrolls its
    // heading to the top of the view.
    name: 'web-words',
    path: `/conversations?route=${encodeURIComponent(ENTRY_GATE_ROUTE)}`,
    wait: `${WEB_CHAT_PANEL} input[value="Members only"]`,
    setup: async (page) => {
      await storeWebWords(page, ENTRY_GATE_ROUTE);
    },
    action: async (page) => {
      await page
        .locator(WEB_CHAT_PANEL)
        .getByRole('heading', { name: 'Words', exact: true })
        .evaluate((el) => {
          el.scrollIntoView({ block: 'start' });
        });
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
    // The interactions inbox under the full key. Waits on the pending question the runner
    // seeds (docs-screenshots.sh).
    name: 'interactions',
    path: '/interactions',
    wait: 'text=Approve the staging deploy',
  },
  {
    // The notifications inbox under the full key. Waits on the notification the runner
    // seeds (docs-screenshots.sh).
    //
    // Nondeterministic: the row renders its server-stamped `created_at`, so the shown
    // timestamp differs every run. Gated out of the automated pipeline
    // (SKIP_NONDETERMINISTIC_SHOTS); recaptured on a manual full run.
    name: 'notifications',
    nondeterministic: true,
    path: '/notifications',
    wait: 'text=Your nightly export finished',
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
    action: async (page) => {
      await page.getByRole('tab', { name: 'API keys' }).click();
      await page.getByRole('button', { name: 'Create key' }).click();
      // A UNIQUE user_id per invocation: the mint door rejects a duplicate, and this
      // action runs once per theme against the SAME live backend, so a fixed id would
      // 400 on the second pass. The id is cosmetic here — the shot frames the minted-
      // key dialog's QR, not the create form.
      await page.getByLabel('Key user ID').fill(`svc-demo-${Date.now()}`);
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
    // The Hooks registry: the seeded consumer hook's row above the register form.
    name: 'hooks',
    path: '/hooks',
    wait: 'text=notes-updater',
  },
  {
    // The trigger-link create flow: driven with the FULL key (the section + create
    // control show for a full/admin projection), the shot frames the create dialog's
    // QR step; the QR wait is the stable signal.
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

// The entry-gate and words frames drill into the runtime-seeded web routes; require their
// names only when one of those frames is in the run.
if (
  AUTHED_RUN.some((entry) => entry.name.startsWith('entry-gate') || entry.name === 'web-words') &&
  (!ENTRY_GATE_ROUTE || !ENTRY_GATE_OPEN_ROUTE)
) {
  console.error(
    'STUDIO_ENTRY_GATE_ROUTE and STUDIO_ENTRY_GATE_OPEN_ROUTE are required: the runner ' +
      '(docs-screenshots.sh) seeds the two web routes and their entry gates, then exports both.',
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
 * WHY: a canvas pane caps zoom at the canvas's `minZoom` (0.5) and this harness shoots
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
  // Deterministic sidebar: the reference plugin's "Reference" nav entry appears
  // only once the shell's plugin loader has committed the plugin's contributions,
  // which races the async bundle load. Every signed-in shot renders that sidebar,
  // so wait for the entry before shooting — otherwise the sidebar is present in
  // some shots and missing in others. The demo boot always loads the reference
  // plugin, so this entry always resolves. It renders under the single generic
  // "Plugins" section list; `exact` avoids the per-entry provenance badge link.
  //
  // The wait runs BEFORE the entry's action: an action that opens a modal dialog
  // hides the rest of the page from the accessibility tree (the sidebar gets
  // `aria-hidden`), so a role query for the nav entry would never match after it.
  // Once committed, the plugin's contributions stay, so the sidebar the shot
  // captures (behind an overlay or not) carries the entry either way.
  if (awaitPluginNav) {
    await page
      .getByRole('navigation', { name: 'Primary' })
      .getByRole('list', { name: 'Plugins' })
      .getByRole('link', { name: 'Reference', exact: true })
      .waitFor({ state: 'visible', timeout: WAIT_TIMEOUT });
  }
  if (entry.action) await entry.action(page);
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
      // never renders it and must not wait on it.
      const awaitPluginNav = key === DEMO_KEY;
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
