import { expect, test } from '@playwright/test';

/**
 * ROUTER ENTRY-STATE PERSISTENCE — the external assumption this test pins.
 *
 * The SDK's per-history-entry state channel (`navigatePluginWithOptions` /
 * `PluginPageProps.entryState`) rests entirely on ONE behaviour of the router the
 * Studio app resolves — `@tanstack/react-router` (`^1.95.1`, currently 1.170.17):
 * that `router.navigate({ to, state })`
 *   (a) writes the custom bag into `window.history.state`,
 *   (b) exposes it via `useLocation().state` after a back / forward traversal, and
 *   (c) RESTORES it into both after a HARD RELOAD (the browser persists
 *       `history.state` across a document load).
 *
 * That claim is a LIBRARY invariant, not Studio code — so nothing in the unit or
 * component suites can catch it regressing. A RED here means a router upgrade (or a
 * browser-behaviour change) broke `history.state` persistence, which would silently
 * gut the entry-state channel: plugin drill trails / view checkpoints would stop
 * surviving reload and back/forward. Treat a failure as "the router bump is unsafe
 * for the entry-state channel — do not merge it until the channel is re-verified or
 * re-implemented," never as a flake.
 *
 * VERSION COUPLING: this package's `@tanstack/react-router` range in e2e/package.json
 * must match apps/studio/package.json's — pnpm resolves them to ONE lock entry today,
 * which is what makes this a tripwire for the version the app actually ships. Bump
 * both together; an app-only bump would leave this spec green on the old router.
 *
 * The fixture (src/main.tsx) is a minimal three-route app that drives the router
 * exactly as the host does, under the same `studioPluginEntryState` namespace.
 */

/** The per-entry bag the fixture writes, as it round-trips through `history.state`. */
interface EntryStateBag {
  studioPluginEntryState?: { demo?: { count: number; note: string } };
}

const EXPECTED_SLOT = { count: 42, note: 'hi' };

test('router.navigate state survives history.state, back/forward traversal, and a hard reload', async ({
  page,
}) => {
  const readBag = async (selector: string): Promise<EntryStateBag> => {
    const text = (await page.locator(selector).textContent()) ?? 'null';
    return JSON.parse(text) as EntryStateBag;
  };
  const locSlot = async (): Promise<unknown> =>
    (await readBag('#loc-state')).studioPluginEntryState?.demo;
  const histSlot = async (): Promise<unknown> =>
    (await readBag('#hist-state')).studioPluginEntryState?.demo;

  await page.goto('/');
  await expect(page.locator('#page')).toHaveText('index');

  // (a) navigate with state → lands in BOTH window.history.state and useLocation().state.
  await page.locator('#go-b').click();
  await expect(page.locator('#page')).toHaveText('b');
  await expect(page.locator('#path')).toHaveText('/b');
  expect(await locSlot()).toEqual(EXPECTED_SLOT);
  expect(await histSlot()).toEqual(EXPECTED_SLOT);

  // (b) push another entry, then Back → the state on /b is restored from history.
  await page.locator('#go-c').click();
  await expect(page.locator('#page')).toHaveText('c');
  await page.goBack();
  await expect(page.locator('#page')).toHaveText('b');
  expect(await locSlot()).toEqual(EXPECTED_SLOT);

  // Forward then Back once more — traversal is stable in both directions.
  await page.goForward();
  await expect(page.locator('#page')).toHaveText('c');
  await page.goBack();
  await expect(page.locator('#page')).toHaveText('b');
  expect(await locSlot()).toEqual(EXPECTED_SLOT);

  // (c) HARD RELOAD on /b → the state is restored from the persisted history.state.
  await page.reload();
  await expect(page.locator('#page')).toHaveText('b');
  await expect(page.locator('#path')).toHaveText('/b');
  expect(await locSlot()).toEqual(EXPECTED_SLOT);
  expect(await histSlot()).toEqual(EXPECTED_SLOT);
});
