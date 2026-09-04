/**
 * Studio-plugin system, against the LIVE boot skeleton.
 *
 * The reference plugin is discovered post-login through the authed registry, its
 * bundle loads through the SERVER-INJECTED import map, its page + tool panel
 * render, a tool without a panel falls back to the auto-form, and both loud-error
 * paths this file owns (an integrity mismatch, a mid-session 401) behave exactly
 * as specified. The import map itself is asserted well-formed + CSP-enforced, and
 * the plugin's React is pinned identical to the host's.
 *
 * The API-version gate is `version-gate.spec.ts`, which pins EQUALITY in all
 * three directions (lower, higher, equal) against this same live boot.
 */
import { test, expect } from '@playwright/test';
import { loginViaUi, seedCredential, expectPluginErrorCard, openToolRow } from './helpers';

const REGISTRY_PATH = '/api/plugins';
const BUNDLE_GLOB = '**/api/plugins/reference_plugin/studio/*.js';

test('post-login the reference plugin is discovered, its page and tool panel render', async ({
  page,
}) => {
  await loginViaUi(page); // lands on the Dashboard; the shell starts the plugin load pass

  // Wait for the plugin BUNDLE to finish importing — it sets `window.__pluginReact`
  // at module-eval, which is the same point it registers its page + tool panel. Core
  // routes never block on the load pass, so we synchronise on it explicitly
  // before driving a contributed panel.
  await page.waitForFunction(() => '__pluginReact' in window);

  // The tool list lives on the Tools page; the landing route lands on the Dashboard,
  // so reach Tools by a CLIENT-SIDE nav (an AppLink click, no reload) to keep the
  // just-registered panel in module state.
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Tools' })
    .click();
  await page.waitForURL('**/tools');

  // Select the tool by CLIENT-SIDE navigation (an AppLink search-param change, no
  // reload) so the just-registered panel is in module state. The registered TOOL
  // PANEL replaces the auto-form for studio_demo_echo, driving it through the host's
  // ApiProvider singleton (useApi().runTool).
  await openToolRow(page, 'studio_demo_echo');
  const panel = page.getByTestId('reference-echo-panel');
  await expect(panel).toBeVisible();
  await page.getByTestId('echo-message').fill('live e2e');
  await page.getByTestId('echo-run').click();
  const result = page.getByTestId('echo-result');
  await expect(result).toBeVisible();
  await expect(result).toContainText('live e2e');

  // The registered PAGE renders on a cold navigation to the plugin route (its route
  // loader awaits the load pass, so this resolves even as a full reload).
  await page.goto('/plugins/reference_plugin/demo');
  await expect(page.getByTestId('reference-demo-page')).toBeVisible();
});

test('the reference plugin names its result pane after the tool, never the SDK default', async ({
  page,
}) => {
  // This plugin is what an author copies. `JsonTree` without a `label` takes the
  // SDK's "JSON" fallback, so a copied panel puts a region called "JSON" on a
  // screen that may already have one — two landmarks a keyboard user cannot tell
  // apart. The name exists ONLY while the pane overflows, so this drives it into
  // that state rather than asserting an attribute that is absent by design.
  await loginViaUi(page);
  await page.waitForFunction(() => '__pluginReact' in window);
  // The tool list is on the Tools page; the landing route lands on the Dashboard,
  // so reach Tools by a CLIENT-SIDE nav (no reload) before selecting the tool.
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Tools' })
    .click();
  await page.waitForURL('**/tools');
  await openToolRow(page, 'studio_demo_echo');
  await expect(page.getByTestId('reference-echo-panel')).toBeVisible();

  await page.getByTestId('echo-message').fill('x'.repeat(400));
  await page.getByTestId('echo-run').click();
  await expect(page.getByTestId('echo-result')).toBeVisible();

  // Cap the pane, then let the SDK's ResizeObserver re-measure it. A narrow
  // VIEWPORT does not reach this state: the ancestor chain above the panel takes
  // its width from content, so the 400-character value widens the document to
  // ~3000 px instead of scrolling the pane. Capping the pane is what puts
  // `scrollWidth > clientWidth` on the element `useOverflowRegion` watches, which
  // is the condition the whole naming contract hangs off.
  await page.getByTestId('echo-result').evaluate((node: HTMLElement) => {
    node.style.maxWidth = '240px';
  });

  await expect(page.getByRole('region', { name: 'studio_demo_echo result' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'JSON', exact: true })).toHaveCount(0);
});

test('the reference plugin contributes a sidebar nav entry and a host-injected scoped stylesheet', async ({
  page,
}) => {
  await loginViaUi(page); // lands on the Dashboard; the shell starts the plugin load pass
  // The nav entry is committed at the same module-eval point that sets __pluginReact.
  await page.waitForFunction(() => '__pluginReact' in window);

  // The registered nav entry appears under the plugin's own self-named section
  // in the Primary navigation and navigates (client-side) to the plugin's page.
  const navLink = page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Reference' });
  await expect(navLink).toBeVisible();
  await navLink.click();
  await expect(page).toHaveURL(/\/plugins\/reference_plugin\/demo$/);
  await expect(page.getByTestId('reference-demo-page')).toBeVisible();

  // The plugin's scoped stylesheet is injected as an SRI'd <link> for its served
  // CSS URL — proof the host, not the JS bundle, applied the styles.
  const cssLink = page.locator(
    'link[rel="stylesheet"][href*="/api/plugins/reference_plugin/studio/"][href$=".css"]',
  );
  await expect(cssLink).toHaveCount(1);
  await expect(cssLink).toHaveAttribute('integrity', /^sha384-/);

  // A computed, TOKEN-DERIVED property on the scoped element proves the stylesheet
  // applied. Radius tokens do not vary by theme, so the assertion is theme-stable.
  const radius = await page
    .getByTestId('reference-demo-scoped')
    .evaluate((el) => getComputedStyle(el).borderRadius);
  expect(radius).toBe('12px');
});

test('the reference plugin contributes a Settings tab that mounts after the core tabs', async ({
  page,
}) => {
  await loginViaUi(page); // lands on the Dashboard; the shell starts the plugin load pass
  // The settings tab is committed at the same module-eval point that sets __pluginReact.
  await page.waitForFunction(() => '__pluginReact' in window);

  await page.goto('/settings');
  // The core tabs render immediately; the plugin tab appears once the load pass
  // is ready and sorts AFTER them.
  const tablist = page.getByRole('tablist');
  const pluginTab = tablist.getByRole('tab', { name: 'Reference' });
  await expect(pluginTab).toBeVisible();
  const tabNames = await tablist.getByRole('tab').allInnerTexts();
  expect(tabNames).toEqual([
    'Settings',
    'Environment',
    'Profiles',
    'API keys',
    'Backup',
    'Roles',
    'Reference',
  ]);

  // Selecting it mounts the plugin's tab content through the host's SDK singletons.
  await pluginTab.click();
  await expect(page.getByTestId('reference-settings-tab')).toBeVisible();
});

test('a tool WITHOUT a panel falls back to the auto-form', async ({ page }) => {
  await seedCredential(page);
  // studio_demo_form ships no panel, so the schema-driven auto-form renders.
  await page.goto('/tools?tool=studio_demo_form');
  // The auto-form is a real <form> with a Run submit and the schema's `name` field;
  // the plugin panel testid must be ABSENT.
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
  await expect(page.getByLabel(/name/i).first()).toBeVisible();
  await expect(page.getByTestId('reference-echo-panel')).toHaveCount(0);
});

test('a COLD deep link to the plugin page as first navigation resolves (no 404 on first paint)', async ({
  page,
}) => {
  await seedCredential(page);
  // First navigation of the session is straight to the deep link. The skeleton's
  // SPA history fallback returns index.html (not 404), and the route loader gates
  // on the plugin load pass, then paints the registered page.
  const response = await page.goto('/plugins/reference_plugin/demo');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('reference-demo-page')).toBeVisible();
});

test("the plugin page's React === the host's (singleton pin)", async ({ page }) => {
  await seedCredential(page);
  await page.goto('/plugins/reference_plugin/demo');
  await expect(page.getByTestId('reference-demo-page')).toBeVisible();

  const identical = await page.evaluate(async () => {
    // A variable specifier so TS does not resolve it as a module at compile time;
    // at runtime the browser resolves it through the same import map the plugin used.
    const vendorReactUrl = '/vendor/react.js';
    const host: unknown = await import(/* @vite-ignore */ vendorReactUrl);
    return host === (window as unknown as { __pluginReact?: unknown }).__pluginReact;
  });
  expect(identical).toBe(true);
});

test('the served index.html carries exactly ONE importmap before the first module script, CSP-enforced', async ({
  page,
}) => {
  const response = await page.request.get('/');
  expect(response.status()).toBe(200);

  // CSP header present with a per-response nonce.
  const csp = response.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'none'");
  const nonceMatch = /script-src [^;]*'nonce-([A-Za-z0-9_-]+)'/.exec(csp);
  expect(nonceMatch).not.toBeNull();

  const html = await response.text();
  const importmaps = html.match(/<script type="importmap"/g) ?? [];
  expect(importmaps).toHaveLength(1);

  const importmapPos = html.indexOf('type="importmap"');
  const modulePos = html.indexOf('type="module"');
  expect(importmapPos).toBeGreaterThanOrEqual(0);
  expect(modulePos).toBeGreaterThan(importmapPos);

  // The inline importmap carries the CSP nonce (an inline script under bare
  // `script-src 'self'` would otherwise be blocked).
  const nonce = nonceMatch?.[1] ?? '';
  expect(html).toContain(`<script type="importmap" nonce="${nonce}">`);
});

test('a two-consecutive index.html responses carry DIFFERENT nonces (per-response CSPRNG)', async ({
  page,
}) => {
  const nonceOf = async (): Promise<string> => {
    const res = await page.request.get('/', { headers: { 'cache-control': 'no-cache' } });
    const csp = res.headers()['content-security-policy'] ?? '';
    return /'nonce-([A-Za-z0-9_-]+)'/.exec(csp)?.[1] ?? '';
  };
  const first = await nonceOf();
  const second = await nonceOf();
  expect(first).not.toBe('');
  expect(first).not.toBe(second);
});

test('an integrity mismatch (byte-mutated served chunk) rejects LOUDLY with a plugin error card', async ({
  page,
}) => {
  await seedCredential(page);

  // Byte-mutate the served bundle so the delivered bytes no longer match the
  // import map's declared sha384 — the browser's import-map integrity check must
  // REJECT the module (assert rejection, not mere key presence).
  await page.route(BUNDLE_GLOB, async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    const mutated = Buffer.from(body);
    mutated[0] = (mutated[0] ?? 0) ^ 0xff; // flip a byte
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
      body: mutated,
    });
  });

  await page.goto('/plugins/reference_plugin/demo');
  await expectPluginErrorCard(page, /failed to load/i);
  // The registered page must NOT have rendered.
  await expect(page.getByTestId('reference-demo-page')).toHaveCount(0);
});

test('a 401 during the post-login registry fetch is a LOGIN REDIRECT, never a plugin error card', async ({
  page,
}) => {
  await seedCredential(page);

  // Expire the credential mid-session: the registry fetch 401s.
  await page.route(
    (url) => url.pathname === REGISTRY_PATH,
    async (route) => {
      await route.fulfill({ status: 401, json: { error: 'unauthorized' } });
    },
  );

  await page.goto('/plugins/reference_plugin/demo');
  // A 401 is a login redirect, NOT a plugin error card.
  await page.waitForURL('**/login**');
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: /failed to load/i })).toHaveCount(0);
});
