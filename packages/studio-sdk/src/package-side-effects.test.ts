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
 * `./dist/<name>.js` (the build) and `./src/<name>.ts`. The source path counts
 * because `files` publishes `src` and a bundler keys `sideEffects` on the module
 * PATH: however a consumer's resolver arrives at the shipped source (an alias, a
 * TS path mapping, an override), the flag has to be right there too or the
 * barrel's three CSS imports are dropped again. The stylesheets themselves are
 * checked the same way, and every entry in the list must match something real so
 * a typo cannot sit there looking like cover.
 *
 * What `files` publishes is itself derived rather than assumed, and pinned
 * against the set `tsconfig.build.json` keeps out of the build: the two lists
 * answer the same question — what is test scaffolding — and a package that
 * builds without a file but ships it publishes source the build never sees.
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

/**
 * `tsconfig.build.json`'s `exclude` — the files the emitting build never sees.
 *
 * DECLARED LIMIT: whole-line `//` comments are stripped, which is every comment
 * that file carries. A comment appended after a value would survive and
 * `JSON.parse` would throw, which is a loud failure rather than a silent one.
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

/**
 * Whether `glob` matches `path` or any directory ABOVE it — a `files` entry or a
 * tsconfig `exclude` entry naming a directory takes everything under it.
 */
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

const sourceTree = filesWithin(srcDir, ['.ts', '.tsx', '.css']);
const publishedSources = sourceTree.filter(isPacked);

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
    // The source entry: `files` ships `src`, and a bundler applies `sideEffects`
    // to whatever module path its resolver lands on.
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

  it('packs exactly the source modules the build compiles', () => {
    // `files` ships `src`, so every test and test-support module it fails to
    // negate lands in the tarball — importing devDependencies a consumer never
    // installs, and running module-scope setup nothing asked for. The build
    // already decides which modules are scaffolding; the tarball must agree.
    const modules = sourceTree.filter((path) => /\.tsx?$/.test(path));
    expect(modules.length).toBeGreaterThan(0);
    const packedNotBuilt = modules.filter((path) => isPacked(path) && !isBuilt(path));
    const builtNotPacked = modules.filter((path) => isBuilt(path) && !isPacked(path));
    expect({ packedNotBuilt, builtNotPacked }).toEqual({ packedNotBuilt: [], builtNotPacked: [] });
  });

  it.each([
    'src/index.ts',
    'src/components/button.tsx',
    'src/components/button.test.tsx',
    'src/components/button.spec.ts',
    'src/test-setup.ts',
    'src/components/test-utils.tsx',
    'src/hooks/test-utils.ts',
  ])('agrees with the build about whether %s is scaffolding', (path) => {
    // The case above compares the two lists over the files that exist TODAY, so a
    // negation matching nothing yet is cover it cannot prove. These paths need not
    // exist: they pin the PATTERNS, so the first `test-utils.tsx` anyone writes is
    // already out of the tarball rather than discovered in it.
    expect({ path, packed: isPacked(path) }).toEqual({ path, packed: isBuilt(path) });
  });

  it('exports its own manifest', () => {
    // `exports` closes every path it does not name, so without this entry
    // `require('@tai42/studio-sdk/package.json')` — what a bundler asks for when
    // it wants `sideEffects` or `browserslist`, and what dependency tooling reads
    // — fails with ERR_PACKAGE_PATH_NOT_EXPORTED.
    const exportsMap = JSON.parse(readSource('package.json')) as {
      exports: Record<string, unknown>;
    };
    expect(exportsMap.exports['./package.json']).toBe('./package.json');
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
