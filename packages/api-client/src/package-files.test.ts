/**
 * What `files` publishes is DERIVED against what the build compiles, not assumed.
 *
 * `files` ships `src`, so every test or test-support module its `!` negations fail
 * to exclude lands in the published tarball — pulling in devDependencies a consumer
 * never installs and running module-scope setup nothing asked for. `tsconfig.build
 * .json`'s `exclude` already decides which modules are scaffolding (they must not
 * reach `dist`), so the tarball must agree with it: a file the build keeps out but
 * `files` ships is source the build never sees, shipped anyway.
 *
 * The sibling package `@tai42/studio-sdk` carries this same invariant in
 * `package-side-effects.test.ts`, but that gate is package-local; `@tai42/api-
 * client` is a second published package and needs its own. Both lists answer the
 * one question — what is test scaffolding — so they are reconciled here, in both
 * directions, over the files that exist AND over the patterns, so the first
 * `test-utils.ts` anyone adds is out of the tarball rather than discovered in it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = resolve(packageRoot, 'src');

const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
  files?: string[];
};

/**
 * `tsconfig.build.json`'s `exclude` — the files the emitting build never sees.
 * Whole-line `//` comments are stripped; a trailing comment would make JSON.parse
 * throw, which is a loud failure rather than a silent one.
 */
const buildExclude: string[] =
  (
    JSON.parse(
      readFileSync(resolve(packageRoot, 'tsconfig.build.json'), 'utf8').replace(
        /^\s*\/\/.*$/gm,
        '',
      ),
    ) as { exclude?: string[] }
  ).exclude ?? [];

/**
 * One glob as a regular expression, with npm/bundler `files`+tsconfig semantics:
 * a pattern without a slash is implicitly `**\/`-prefixed, `**` spans separators,
 * `*`/`?` do not.
 */
function globToRegExp(glob: string): RegExp {
  const relativeGlob = glob.startsWith('./') ? glob.slice(2) : glob;
  const anchored = relativeGlob.includes('/') ? relativeGlob : `**/${relativeGlob}`;
  const source = anchored.replace(/\*\*\/|\*\*|\*|\?|[^*?]+/g, (token) => {
    switch (token) {
      case '**/':
        return '(?:[^/]*/)*';
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

/** Whether `glob` matches `path` or any directory ABOVE it. */
function matchesPathOrAncestor(glob: string, path: string): boolean {
  const pattern = globToRegExp(glob.startsWith('!') ? glob.slice(1) : glob);
  const segments = path.split('/');
  return segments.some((_, index) => pattern.test(segments.slice(0, index + 1).join('/')));
}

/** Whether `files` packs `path` — named by an entry and by no `!` negation. */
function isPacked(path: string): boolean {
  const entries = manifest.files ?? [];
  const included = entries.filter((entry) => !entry.startsWith('!'));
  const negated = entries.filter((entry) => entry.startsWith('!'));
  return (
    included.some((entry) => matchesPathOrAncestor(entry, path)) &&
    !negated.some((entry) => matchesPathOrAncestor(entry, path))
  );
}

/** Whether `tsconfig.build.json` compiles `path` into `dist/`. */
function isBuilt(path: string): boolean {
  return !buildExclude.some((entry) => matchesPathOrAncestor(entry, path));
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

const sourceModules = filesWithin(srcDir, ['.ts', '.tsx']);

describe('published files vs the build', () => {
  it('packs exactly the source modules the build compiles', () => {
    expect(sourceModules.length).toBeGreaterThan(0);
    const packedNotBuilt = sourceModules.filter((path) => isPacked(path) && !isBuilt(path));
    const builtNotPacked = sourceModules.filter((path) => isBuilt(path) && !isPacked(path));
    expect({ packedNotBuilt, builtNotPacked }).toEqual({ packedNotBuilt: [], builtNotPacked: [] });
  });

  it.each([
    'src/index.ts',
    'src/client.ts',
    'src/client.test.ts',
    'src/http.spec.ts',
    'src/test-setup.ts',
    'src/test-utils.ts',
    'src/fixtures/test-utils.tsx',
  ])('agrees with the build about whether %s is scaffolding', (path) => {
    // These paths need not exist: they pin the PATTERNS, so the first `test-utils
    // .ts` or `.spec.ts` anyone writes is already out of the tarball rather than
    // discovered in it. `src/client.ts` is the positive control — real source both
    // publishes and builds.
    expect({ path, packed: isPacked(path) }).toEqual({ path, packed: isBuilt(path) });
  });

  it('ships the source directory the build emits from', () => {
    expect(manifest.files).toEqual(expect.arrayContaining(['dist', 'src']));
  });
});
