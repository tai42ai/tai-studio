/**
 * Every bundled font family redistributes its licence with its binaries.
 *
 * The SDK depends on `@fontsource-variable/*` packages and imports their CSS
 * from the barrel, so the SPA build materialises the woff2 files into
 * `dist/assets/` — 13 of them, ~282 KB. Both families are SIL Open Font License
 * 1.1, whose §2 requires the copyright notice and the licence text to accompany
 * the Font Software wherever it is redistributed. `dist/` is what is packaged
 * and served, so the notices have to be IN it, not merely in the repository or
 * in `node_modules`.
 *
 * `public/` is copied verbatim to the build root by Vite, which is why the
 * licences live at `public/licenses/`. This gate reads the SDK's declared font
 * dependencies rather than a hand-written list, so adding a third family is a
 * red test until its licence ships too.
 *
 * It checks the SOURCE tree, not `dist`: `dist` is build output that a test run
 * cannot assume exists. The `public/` → root copy is Vite's own contract and is
 * exercised by the build.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const licenceDirectory = resolve(repoRoot, 'apps/studio/public/licenses');

/** The `@fontsource*` packages the SDK pulls in, read from its manifest. */
function fontPackages(): string[] {
  const manifest = readFileSync(resolve(repoRoot, 'packages/studio-sdk/package.json'), 'utf8');
  const parsed: unknown = JSON.parse(manifest);
  const dependencies =
    typeof parsed === 'object' && parsed !== null && 'dependencies' in parsed
      ? (parsed as { dependencies?: Record<string, string> }).dependencies
      : undefined;
  return Object.keys(dependencies ?? {}).filter((name) => name.startsWith('@fontsource'));
}

/** `@fontsource-variable/geist-mono` → `geist-mono`. */
function familySlug(packageName: string): string {
  return packageName.slice(packageName.lastIndexOf('/') + 1);
}

describe('bundled font licences', () => {
  it('reads the SDK manifest (a gate over an empty list would pass vacuously)', () => {
    expect(fontPackages()).toEqual([
      '@fontsource-variable/geist-mono',
      '@fontsource-variable/inter',
    ]);
  });

  it('ships an OFL notice for every bundled family', () => {
    const missing = fontPackages().filter(
      (name) => !existsSync(join(licenceDirectory, `${familySlug(name)}-OFL.txt`)),
    );
    expect(missing).toEqual([]);
  });

  it('ships the real licence text and the upstream copyright line', () => {
    // Without this an empty placeholder file would satisfy the check above.
    for (const name of fontPackages()) {
      const text = readFileSync(join(licenceDirectory, `${familySlug(name)}-OFL.txt`), 'utf8');
      expect([name, text.includes('SIL OPEN FONT LICENSE Version 1.1')]).toEqual([name, true]);
      expect([name, /Copyright \d{4} The .+ Project Authors/.test(text)]).toEqual([name, true]);
    }
  });

  it('carries no licence for a family that is not bundled', () => {
    // The reverse direction: a stale notice for a dropped dependency is as wrong
    // as a missing one, and would otherwise sit in the build forever.
    const expected = new Set(fontPackages().map((name) => `${familySlug(name)}-OFL.txt`));
    const stale = readdirSync(licenceDirectory).filter((entry) => !expected.has(entry));
    expect(stale).toEqual([]);
  });

  it('names both families in the repository NOTICE', () => {
    const notice = readFileSync(resolve(repoRoot, 'NOTICE'), 'utf8');
    expect(notice).toContain('SIL Open Font License, Version 1.1');
    for (const name of fontPackages()) {
      expect([name, notice.toLowerCase().includes(familySlug(name).replace('-', ' '))]).toEqual([
        name,
        true,
      ]);
    }
  });
});
