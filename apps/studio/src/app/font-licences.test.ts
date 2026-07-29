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
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const licenceDirectory = resolve(repoRoot, 'apps/studio/public/licenses');
const sdkManifest = resolve(repoRoot, 'packages/studio-sdk/package.json');

/** Resolution rooted at the SDK, which is the package that declares the fonts. */
const requireFromSdk = createRequire(sdkManifest);

/** The `@fontsource*` packages the SDK pulls in, read from its manifest. */
function fontPackages(): string[] {
  const manifest = readFileSync(sdkManifest, 'utf8');
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

/** The licence text shipped in `public/licenses/` for a family. */
function shippedLicence(packageName: string): string {
  return readFileSync(join(licenceDirectory, `${familySlug(packageName)}-OFL.txt`), 'utf8');
}

/**
 * The licence the font package itself redistributes, resolved FROM the package.
 *
 * This is what makes the notice a notice for THIS font rather than for some font:
 * every OFL file says "SIL OPEN FONT LICENSE Version 1.1" and carries a
 * `Copyright <year> The <X> Project Authors` line, so a check for those two shapes
 * is satisfied by any OFL text at all — the two shipped files could be SWAPPED and
 * every assertion still passed. `@fontsource-variable/*` exports its `LICENSE`
 * explicitly, so the upstream text is readable rather than transcribed.
 */
function upstreamLicence(packageName: string): string {
  return readFileSync(requireFromSdk.resolve(`${packageName}/LICENSE`), 'utf8');
}

/** The family name the font package declares, e.g. `Inter`, `Geist Mono`. */
function familyName(packageName: string): string {
  const metadata: unknown = JSON.parse(
    readFileSync(requireFromSdk.resolve(`${packageName}/metadata.json`), 'utf8'),
  );
  const family =
    typeof metadata === 'object' && metadata !== null && 'family' in metadata
      ? (metadata as { family?: unknown }).family
      : undefined;
  if (typeof family !== 'string' || family === '') {
    throw new Error(`${packageName} declares no family name in its metadata`);
  }
  return family;
}

/** The `Copyright <year> The <X> Project Authors` line a licence opens with. */
function copyrightNotice(licence: string): string {
  const found = /Copyright \d{4} The .+? Project Authors/.exec(licence);
  if (found === null) throw new Error('the licence text carries no OFL copyright notice');
  return found[0];
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

  it('ships each family the licence ITS OWN package redistributes, byte for byte', () => {
    // Without this an empty placeholder file would satisfy the check above — and
    // so would the OTHER family's licence, which is the failure a shape check
    // cannot see: both files say "SIL OPEN FONT LICENSE Version 1.1" and both
    // carry a `Copyright <year> The <X> Project Authors` line, so swapping the two
    // notices left every assertion green while each font shipped somebody else's
    // copyright. The comparison is against the text the font package itself
    // redistributes, so it is exact rather than shaped.
    for (const name of fontPackages()) {
      const upstream = upstreamLicence(name);
      // The gate is only as good as what it compares against.
      expect([name, upstream.includes('SIL OPEN FONT LICENSE Version 1.1')]).toEqual([name, true]);
      expect([name, /Copyright \d{4} The .+ Project Authors/.test(upstream)]).toEqual([name, true]);
      expect([name, shippedLicence(name) === upstream]).toEqual([name, true]);
    }

    // …and the two texts really are distinguishable, or the comparison above
    // could not tell a swap from a match.
    const texts = fontPackages().map(shippedLicence);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('carries no licence for a family that is not bundled', () => {
    // The reverse direction: a stale notice for a dropped dependency is as wrong
    // as a missing one, and would otherwise sit in the build forever.
    const expected = new Set(fontPackages().map((name) => `${familySlug(name)}-OFL.txt`));
    const stale = readdirSync(licenceDirectory).filter((entry) => !expected.has(entry));
    expect(stale).toEqual([]);
  });

  it('attributes both families in the repository NOTICE, by name and by copyright', () => {
    // A bare substring is not attribution: `includes('inter')` is satisfied by the
    // word "interface", by "internal", and by the sentence above it — so the
    // attribution for Inter could be deleted outright and this gate stayed green.
    // The family name is matched as a LINE of the notice, and the copyright line
    // is read out of the shipped licence rather than transcribed, so a notice that
    // credits the wrong project fails.
    const notice = readFileSync(resolve(repoRoot, 'NOTICE'), 'utf8');
    const lines = notice.split('\n').map((line) => line.trim());
    expect(notice).toContain('SIL Open Font License, Version 1.1');
    for (const name of fontPackages()) {
      expect([name, lines.includes(familyName(name))]).toEqual([name, true]);
      expect([name, notice.includes(copyrightNotice(shippedLicence(name)))]).toEqual([name, true]);
    }
  });
});
