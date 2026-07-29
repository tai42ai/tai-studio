/**
 * The webServer's own knobs — every decision taken BEFORE a browser opens, each
 * of which can make a green suite say nothing about the working tree:
 *
 *   - `SKIP_SPA_BUILD`: a default that reuses `apps/studio/dist` serves whatever
 *     was built last;
 *   - the pnpm selector the SPA is built with: without the app's dependency
 *     closure the shell is rebuilt around whatever each workspace package's
 *     `dist/` already holds, so a source change under `packages/**` is invisible;
 *   - `reuseExistingServer`: adopting a skeleton already on the port skips the
 *     boot recipe wholesale, so nothing is built or seeded at all;
 *   - the port, key and user id: each is a second copy of a boot.sh default, and
 *     the exit code cannot tell a drifted copy from a working one.
 *
 * All four are pinned here, the last two by reading boot.sh itself.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { BOOT_DEFAULTS, spaBuildFlag, reuseServer } from '../playwright.config';

const BOOT_SH = readFileSync(fileURLToPath(new URL('../boot/boot.sh', import.meta.url)), 'utf8');

/**
 * The shell app's own package name, read from its manifest. The selector
 * assertion below is held against this rather than against a literal: a name
 * spelled out here too would be a third copy, free to agree with neither the
 * recipe nor the manifest.
 */
const STUDIO_APP_PACKAGE = (
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../apps/studio/package.json', import.meta.url)), 'utf8'),
  ) as { name: string }
).name;

test('a bare run builds the SPA from the working tree', () => {
  expect(spaBuildFlag({})).toBe('0');
});

test('an explicit opt-out reuses the prebuilt dist', () => {
  expect(spaBuildFlag({ SKIP_SPA_BUILD: '1' })).toBe('1');
});

test('any other value is not an opt-out', () => {
  expect(spaBuildFlag({ SKIP_SPA_BUILD: '0' })).toBe('0');
  expect(spaBuildFlag({ SKIP_SPA_BUILD: 'true' })).toBe('0');
  expect(spaBuildFlag({ SKIP_SPA_BUILD: '' })).toBe('0');
});

test('CI builds fresh even when asked to skip', () => {
  expect(spaBuildFlag({ CI: 'true', SKIP_SPA_BUILD: '1' })).toBe('0');
});

test('a bare run boots its own skeleton rather than adopting one on the port', () => {
  expect(reuseServer({})).toBe(false);
});

test('an explicit opt-in adopts a running skeleton', () => {
  expect(reuseServer({ E2E_REUSE_SERVER: '1' })).toBe(true);
});

test('any other value is not an opt-in', () => {
  expect(reuseServer({ E2E_REUSE_SERVER: '0' })).toBe(false);
  expect(reuseServer({ E2E_REUSE_SERVER: 'true' })).toBe(false);
  expect(reuseServer({ E2E_REUSE_SERVER: '' })).toBe(false);
});

test('CI boots its own skeleton even when asked to adopt one', () => {
  expect(reuseServer({ CI: 'true', E2E_REUSE_SERVER: '1' })).toBe(false);
});

/** The default boot.sh substitutes for `name` when the caller exports nothing. */
function bootDefault(name: string): string {
  const match = new RegExp(String.raw`\$\{${name}:-([^}]*)\}`).exec(BOOT_SH);
  expect(match, `boot.sh has no \${${name}:-…} default`).not.toBeNull();
  return match?.[1] ?? '';
}

test('the config repeats boot.sh defaults verbatim', () => {
  // Read from the recipe, never listed here a second time: a third copy would be
  // one more thing to keep in step, and one that agrees with neither side proves
  // nothing about the two that matter.
  for (const [name, configured] of Object.entries(BOOT_DEFAULTS)) {
    expect(bootDefault(name), name).toBe(configured);
  }
});

/**
 * The pnpm selector boot.sh runs the SPA's `build` script with. `build:reference-plugin`
 * is a different script, and is not matched.
 */
function spaBuildFilter(recipe: string = BOOT_SH): string {
  const match = /pnpm --filter '?([^'\s]+)'? run build(?![\w:.-])/.exec(recipe);
  expect(match, 'boot.sh no longer runs a filtered `pnpm run build`').not.toBeNull();
  return match?.[1] ?? '';
}

test('boot.sh builds the SPA together with its workspace dependency closure', () => {
  // Each workspace package resolves through its own `dist/` — its `exports` point
  // there — so a selector naming the app alone rebuilds the shell around whatever
  // `dist/` happens to be on disk, and a source change anywhere outside
  // `apps/studio` never reaches the browser. The trailing `...` selects the app AND
  // every package it depends on, in topological order. Measured without it: a
  // constant substituted for RunPanel's error message passed 2/2 with
  // SKIP_SPA_BUILD=0, `building the Studio SPA` logged once and `reusing existing
  // SPA dist` never — a false green that both boot-log greps read as correct, which
  // is why the selector is pinned here and not left to those greps.
  expect(spaBuildFilter()).toBe(`${STUDIO_APP_PACKAGE}...`);
});

test('boot.sh builds the reference-plugin bundle BEFORE installing it into the venv', () => {
  // `uv pip install` COPIES the package into site-packages and the skeleton serves
  // that copy. Build after the install and the bundle reaches the venv only on the
  // NEXT boot — every assertion over `studio-src/**` then judges the previous run,
  // which no exit code distinguishes from judging this one. Measured: with the two
  // steps the other way round, deleting a prop from the panel ran GREEN once and
  // RED on the re-run of the identical source.
  const build = BOOT_SH.indexOf('run build:reference-plugin');
  const install = BOOT_SH.indexOf('"${E2E_DIR}/reference-plugin"');
  expect(build, 'boot.sh no longer builds the reference-plugin bundle').toBeGreaterThan(-1);
  expect(install, 'boot.sh no longer installs the reference plugin').toBeGreaterThan(-1);
  expect(build).toBeLessThan(install);
});

test('the boot.sh reader finds a real default, and rejects a name it does not carry', () => {
  // Positive control: the assertion above is only worth its exit code while this
  // reader returns the recipe's own text.
  expect(bootDefault('SKIP_SPA_BUILD')).toBe('0');
  expect(() => bootDefault('NOT_A_BOOT_VARIABLE')).toThrow();
});

test('the selector reader tells the closure apart, and rejects a recipe carrying none', () => {
  // Negative control: a recipe naming the app alone must read back WITHOUT the
  // `...`, or the assertion above holds for both spellings and pins nothing. The
  // last case keeps the pattern off `build:reference-plugin`, whose selector is a
  // different package and would satisfy neither reading.
  expect(spaBuildFilter(`pnpm --filter ${STUDIO_APP_PACKAGE} run build`)).toBe(STUDIO_APP_PACKAGE);
  expect(spaBuildFilter(`pnpm --filter '${STUDIO_APP_PACKAGE}...' run build && :`)).toBe(
    `${STUDIO_APP_PACKAGE}...`,
  );
  expect(() => spaBuildFilter('pnpm --filter @tai42/e2e run build:reference-plugin')).toThrow();
});
