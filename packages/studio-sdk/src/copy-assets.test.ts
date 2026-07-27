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

/**
 * A throwaway package holding `modules` under `src/` and `stylesheets` (always at
 * least `theme.css`), wired so a live import passes every clause of the script:
 * every sheet gets the `exports` subpath the script also demands. The script under
 * test is COPIED rather than reimplemented, so this cannot drift from the build.
 */
function makePackage(
  modules: Record<string, string>,
  stylesheets: Record<string, string> = {},
): string {
  const root = mkdtempSync(join(tmpdir(), 'tai-copy-assets-'));
  fixtures.push(root);

  mkdirSync(join(root, 'scripts'));
  copyFileSync(script, join(root, 'scripts/copy-assets.mjs'));

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

  it('rejects a stylesheet whose only @import sits in a CSS comment', () => {
    const root = makePackage(
      { 'index.ts': "import './base.css';\n" },
      { 'base.css': "/* @import './theme.css'; */\n" },
    );
    expect(runCopyAssets(root)).toContain('would ship dead');
  });
});
