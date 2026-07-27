/**
 * The webServer's own knobs — every decision taken BEFORE a browser opens, each
 * of which can make a green suite say nothing about the working tree:
 *
 *   - `SKIP_SPA_BUILD`: a default that reuses `apps/studio/dist` serves whatever
 *     was built last;
 *   - `reuseExistingServer`: adopting a skeleton already on the port skips the
 *     boot recipe wholesale, so nothing is built or seeded at all;
 *   - the port, key and user id: each is a second copy of a boot.sh default, and
 *     the exit code cannot tell a drifted copy from a working one.
 *
 * All three are pinned here, the last by reading boot.sh itself.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { BOOT_DEFAULTS, spaBuildFlag, reuseServer } from '../playwright.config';

const BOOT_SH = readFileSync(fileURLToPath(new URL('../boot/boot.sh', import.meta.url)), 'utf8');

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
