/**
 * The `sideEffects` gate.
 *
 * The barrel delivers the design system through three bare side-effect imports
 * (`import './components/tokens.css'` and friends). A bare import contributes no
 * binding, so a bundler keeps it only while the module CONTAINING it is declared
 * side-effectful. While `sideEffects` listed `**\/*.css` alone, `dist/index.js`
 * was side-effect-free, webpack 5 and Vite dropped all three imports, and a
 * published consumer doing `import { Button } from '@tai42/studio-sdk'` received
 * ZERO bytes of CSS — an unstyled app, with nothing failing anywhere.
 *
 * So the list is checked against the source rather than trusted: every module
 * under `src/` that carries a bare `*.css` import is found by SCANNING, and both
 * of the paths a consumer can resolve it at must come out side-effectful —
 * `./dist/<name>.js` (the build) and `./src/<name>.ts` (`files` ships `src` too,
 * and app configs do alias to it). The stylesheets themselves are checked the
 * same way, and every entry in the list must match something real so a typo
 * cannot sit there looking like cover.
 *
 * `hasSideEffects` below reimplements the npm `sideEffects` contract as the
 * bundlers apply it, so the gate answers the question the bundler asks.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = resolve(packageRoot, 'src');

const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
  sideEffects?: boolean | string[];
  files?: string[];
};

/** Files `files` excludes, so the gate reasons only about what is published. */
const UNPUBLISHED = /(\.test\.tsx?|__snapshots__)/;

/**
 * One `sideEffects` glob as a regular expression, with the semantics webpack's
 * `SideEffectsFlagPlugin` and `@rollup/pluginutils` (which Vite and Rollup use)
 * share: paths are package-relative and unprefixed, a pattern without a slash is
 * implicitly `**\/`-prefixed, `**` spans path separators and `*`/`?` do not.
 */
function globToRegExp(glob: string): RegExp {
  const relativeGlob = glob.startsWith('./') ? glob.slice(2) : glob;
  const anchored = relativeGlob.includes('/') ? relativeGlob : `**/${relativeGlob}`;

  const source = anchored.replace(/\*\*\/|\*\*|\*|\?|[^*?]+/g, (token) => {
    switch (token) {
      case '**/':
        return '(?:[^/]*/)*'; // zero or more whole segments
      case '**':
        return '.*';
      case '*':
        return '[^/]*';
      case '?':
        return '[^/]';
      default:
        return token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  });
  return new RegExp(`^${source}$`);
}

/** Whether a bundler must evaluate `modulePath` (package-relative, no `./`). */
function hasSideEffects(modulePath: string): boolean {
  const declared = manifest.sideEffects;
  if (declared === undefined || declared === true) return true;
  if (declared === false) return false;
  return declared.some((glob) => globToRegExp(glob).test(modulePath));
}

/** Every file under `dir` with one of `extensions`, package-relative, POSIX-separated. */
function filesWithin(dir: string, extensions: readonly string[]): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesWithin(full, extensions));
    } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
      found.push(relative(packageRoot, full).split(sep).join('/'));
    }
  }
  return found;
}

const publishedSources = filesWithin(srcDir, ['.ts', '.tsx', '.css']).filter(
  (path) => !UNPUBLISHED.test(path),
);

/** The `dist/` path `tsc -b` + `copy-assets.mjs` emit for a `src/` file. */
function distCounterpart(sourcePath: string): string {
  return sourcePath.replace(/^src\//, 'dist/').replace(/\.tsx?$/, '.js');
}

/**
 * The modules that carry a bare CSS import — `import './x.css';` with no binding,
 * which is exactly the form a bundler is free to drop. Derived by scanning, never
 * hand-listed, so a new carrier is covered the moment it is written.
 */
const cssImportCarriers = publishedSources.filter(
  (path) => /\.tsx?$/.test(path) && /^\s*import\s+['"][^'"]+\.css['"]/m.test(readSource(path)),
);

function readSource(path: string): string {
  return readFileSync(resolve(packageRoot, path), 'utf8');
}

describe('published sideEffects declaration', () => {
  it('finds the barrel among the modules carrying a bare CSS import', () => {
    // A scan that silently matched nothing would make every gate below vacuous.
    expect(cssImportCarriers).toContain('src/index.ts');
  });

  it.each(cssImportCarriers)('keeps %s side-effectful at both published paths', (carrier) => {
    // The built entry: what `exports`/`main` resolve to for a published consumer.
    expect({
      path: distCounterpart(carrier),
      sideEffectful: hasSideEffects(distCounterpart(carrier)),
    }).toEqual({
      path: distCounterpart(carrier),
      sideEffectful: true,
    });
    // The source entry: `files` ships `src`, and configs alias to it.
    expect({ path: carrier, sideEffectful: hasSideEffects(carrier) }).toEqual({
      path: carrier,
      sideEffectful: true,
    });
  });

  it('keeps every published stylesheet side-effectful at both paths', () => {
    const stylesheets = publishedSources.filter((path) => path.endsWith('.css'));
    expect(stylesheets.length).toBeGreaterThan(0);
    const dropped = stylesheets
      .flatMap((path) => [path, distCounterpart(path)])
      .filter((path) => !hasSideEffects(path));
    expect(dropped).toEqual([]);
  });

  it('ships both directories the declaration names', () => {
    // `./src/…` entries are only meaningful because `files` publishes `src`.
    expect(manifest.files).toEqual(expect.arrayContaining(['dist', 'src']));
  });

  it('carries no entry that matches nothing shipped', () => {
    // A typo'd glob looks like cover and provides none.
    const shipped = publishedSources.flatMap((path) => [path, distCounterpart(path)]);
    const declared = manifest.sideEffects;
    const patterns = Array.isArray(declared) ? declared : [];
    const dead = patterns.filter((glob) => !shipped.some((path) => globToRegExp(glob).test(path)));
    expect(dead).toEqual([]);
  });
});

describe('sideEffects glob semantics', () => {
  // The gate is only as good as its matcher, so the matcher is pinned too.
  it.each([
    ['**/*.css', 'dist/components/tokens.css', true],
    ['**/*.css', 'tokens.css', true],
    ['**/*.css', 'dist/index.js', false],
    ['./dist/index.js', 'dist/index.js', true],
    ['./dist/index.js', 'dist/host.js', false],
    ['./dist/index.js', 'dist/nested/index.js', false],
    ['*.css', 'dist/components/tokens.css', true],
    ['./src/index.ts', 'src/index.ts', true],
    ['./src/index.ts', 'src/index.tsx', false],
    ['dist/**', 'dist/components/tokens.css', true],
    ['dist/**', 'src/index.ts', false],
    ['./dist/inde?.js', 'dist/index.js', true],
    ['./dist/inde?.js', 'dist/inde/x.js', false],
  ])('%s vs %s', (glob, path, expected) => {
    expect(globToRegExp(glob).test(path)).toBe(expected);
  });
});
