/**
 * The stylesheet-liveness gate.
 *
 * `scripts/copy-assets.mjs` is what stops a stylesheet nobody imports from being
 * copied into `dist/`, published, and exported as a subpath that serves rules no
 * page ever loads. It decides liveness by SCANNING the source for the import that
 * delivers the sheet, and a scanner that over-matches is a gate that passes
 * everything: the words `import './tokens.css'` inside a docblock, or inside a
 * test module the tarball never ships, are not what keeps a stylesheet alive, and
 * a scanner that counts them waves through exactly the sheet it exists to catch.
 *
 * The same script guards the other direction — nothing may sit in `dist/` that no
 * source under `src/` puts there — and reads `tsconfig.build.json` to tell a
 * published module from test scaffolding, so both are exercised here too.
 *
 * So the script is exercised as a program rather than read: each case builds a
 * throwaway package around a copy of the real script and runs it, which is the
 * only way to prove the gate FAILS on input it should reject.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = resolve(packageRoot, 'scripts/copy-assets.mjs');

const fixtures: string[] = [];

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

/** The `exclude` the fixture's `tsconfig.build.json` carries, as the real one does. */
const EXCLUDE = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  'src/test-setup.ts',
  '**/test-utils.ts',
  '**/test-utils.tsx',
];

/**
 * A throwaway package holding `modules` under `src/` and `stylesheets` (always at
 * least `theme.css`), wired so a live import passes every clause of the script:
 * every sheet gets the `exports` subpath the script also demands, and a
 * `tsconfig.build.json` supplies the `exclude` the script reads to tell a
 * published module from scaffolding. The script under test is COPIED rather than
 * reimplemented, so this cannot drift from the build.
 */
function makePackage(
  modules: Record<string, string>,
  stylesheets: Record<string, string> = {},
  exclude: string[] = EXCLUDE,
): string {
  const root = mkdtempSync(join(tmpdir(), 'tai-copy-assets-'));
  fixtures.push(root);

  mkdirSync(join(root, 'scripts'));
  copyFileSync(script, join(root, 'scripts/copy-assets.mjs'));

  writeFileSync(
    join(root, 'tsconfig.build.json'),
    `// The build config, comments and all: the script reads it as the source of\n// truth for what the build leaves out.\n${JSON.stringify({ include: ['src'], exclude }, null, 2)}\n`,
  );

  const sheets = { 'theme.css': ':root {\n  --fixture: 1;\n}\n', ...stylesheets };
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      exports: Object.fromEntries(
        Object.keys(sheets).map((name) => [`./${name}`, `./dist/${name}`]),
      ),
    }),
  );

  mkdirSync(join(root, 'src'));
  for (const [name, source] of Object.entries({ ...sheets, ...modules })) {
    mkdirSync(dirname(join(root, 'src', name)), { recursive: true });
    writeFileSync(join(root, 'src', name), source);
  }
  return root;
}

/** Runs the script in `root`; `null` on success, else the error it threw. */
function runCopyAssets(root: string): string | null {
  try {
    // stderr is captured rather than inherited: the rejection cases are supposed
    // to throw, and their stack traces are the assertion, not test-run noise.
    execFileSync(process.execPath, [join(root, 'scripts/copy-assets.mjs')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return null;
  } catch (error) {
    const { status, stderr } = error as { status?: number; stderr?: string };
    if (status === undefined || status === 0) throw error;
    return stderr ?? '';
  }
}

describe('copy-assets stylesheet liveness', () => {
  it('accepts a stylesheet a module really imports', () => {
    // The sensitivity case: without it every rejection below could come from a
    // fixture the script dislikes for some other reason.
    expect(runCopyAssets(makePackage({ 'index.ts': "import './theme.css';\n" }))).toBeNull();
  });

  it('accepts a stylesheet another live stylesheet @imports', () => {
    const root = makePackage(
      { 'index.ts': "import './base.css';\n" },
      { 'base.css': "@import './theme.css';\n" },
    );
    expect(runCopyAssets(root)).toBeNull();
  });

  it.each([
    ['a line comment', "// import './theme.css';\n"],
    [
      'a docblock line',
      "/**\n * The barrel does `import './theme.css'`.\n */\nexport const x = 1;\n",
    ],
    ['a trailing comment', "export const x = 1; // import './theme.css';\n"],
    ['a block comment at column 0', "/*\nimport './theme.css';\n*/\nexport const x = 1;\n"],
    [
      'an indented block comment',
      "function f() {\n  /*\n  import './theme.css';\n  */\n}\nexport const x = 1;\n",
    ],
    ['a template literal', "export const snippet = `\nimport './theme.css';\n`;\n"],
    [
      'a template literal holding an escaped backtick',
      "export const snippet = `\\`\nimport './theme.css';\n`;\n",
    ],
  ])('rejects a stylesheet mentioned only in %s', (_shape, source) => {
    const failure = runCopyAssets(makePackage({ 'index.ts': source }));
    expect(failure).toContain('would ship dead');
    expect(failure).toContain('theme.css');
  });

  it.each([
    ['a test module', 'theme.test.ts'],
    ['a spec module', 'theme.spec.tsx'],
    ['a test-support module', 'test-utils.tsx'],
  ])('rejects a stylesheet imported only by %s', (_shape, name) => {
    // `tsconfig.build.json` keeps these out of `dist/` and `files` keeps them out
    // of the tarball, so an import that lives only there reaches no consumer and
    // is not what keeps the sheet alive.
    const failure = runCopyAssets(
      makePackage({ 'index.ts': 'export const x = 1;\n', [name]: "import './theme.css';\n" }),
    );
    expect(failure).toContain('would ship dead');
  });

  it.each([
    ['on one line', "/* @import './theme.css'; */\n"],
    ['on a line of its own inside a block', "/*\n@import './theme.css';\n*/\n"],
  ])('rejects a stylesheet whose only @import sits in a CSS comment %s', (_shape, base) => {
    const root = makePackage({ 'index.ts': "import './base.css';\n" }, { 'base.css': base });
    expect(runCopyAssets(root)).toContain('would ship dead');
  });
});

describe('copy-assets published-module derivation', () => {
  it('treats a module tsconfig.build.json does not exclude as published', () => {
    // The list of scaffolding is READ from the build config, not restated: a
    // `test-`-prefixed module the build still emits reaches consumers, so its
    // import is what keeps the sheet alive.
    const root = makePackage({
      'index.ts': 'export const x = 1;\n',
      'test-helpers.ts': "import './theme.css';\n",
    });
    expect(runCopyAssets(root)).toBeNull();
  });

  it('treats a module tsconfig.build.json does exclude as scaffolding', () => {
    const root = makePackage(
      { 'index.ts': 'export const x = 1;\n', 'test-helpers.ts': "import './theme.css';\n" },
      {},
      [...EXCLUDE, '**/test-helpers.ts'],
    );
    expect(runCopyAssets(root)).toContain('would ship dead');
  });

  it('refuses to run when the build config excludes nothing', () => {
    const root = makePackage({ 'index.ts': "import './theme.css';\n" }, {}, []);
    expect(runCopyAssets(root)).toContain('declares no "exclude"');
  });
});

describe('copy-assets dist orphans', () => {
  /** Writes `name` into the fixture's `dist/`, as an earlier build would have. */
  function seedDist(root: string, name: string): void {
    const target = join(root, 'dist', name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, '// left behind\n');
  }

  it.each([
    ['a stylesheet', 'renamed.css'],
    ['a module', 'renamed.js'],
    ['a declaration', 'renamed.d.ts'],
    ['a source map', 'renamed.js.map'],
  ])('rejects %s in dist/ with no source under src/', (_shape, name) => {
    const root = makePackage({ 'index.ts': "import './theme.css';\n" });
    seedDist(root, name);
    const failure = runCopyAssets(root);
    expect(failure).toContain('with no source under src/');
    expect(failure).toContain(name);
  });

  it.each(['index.js', 'index.d.ts', 'index.js.map', 'index.d.ts.map'])(
    'accepts dist/%s, which the build emits for src/index.ts',
    (name) => {
      const root = makePackage({ 'index.ts': "import './theme.css';\n" });
      seedDist(root, name);
      expect(runCopyAssets(root)).toBeNull();
    },
  );

  it('rejects the dist/ output of a module the build no longer emits', () => {
    // A module moved into scaffolding stops being compiled; whatever `tsc -b`
    // emitted for it before is left in dist/ and would still be published.
    const root = makePackage({
      'index.ts': "import './theme.css';\n",
      'panel.test.ts': 'export const x = 1;\n',
    });
    seedDist(root, 'panel.test.js');
    expect(runCopyAssets(root)).toContain('with no source under src/');
  });
});
