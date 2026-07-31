/**
 * The join between an emitted class NAME and a declared RULE, in both directions.
 *
 * `vitest.config.ts` sets `css: false`, so nothing in the unit suite ever
 * connects the two: a component can render `className="tai-feild-error"` and
 * every test stays green because jsdom applied no stylesheet, and a rule can
 * outlive its last call site for as long as nobody reads the sheet. Both halves
 * have happened here — `.tai-field-group` and `.tai-select-viewport` landed with
 * no gate joining them to anything — so this file asserts the join statically.
 *
 * FORWARD: every `tai-*` class name this monorepo emits is declared in
 * `components.css`. That catches the typo, the renamed rule, and the class a
 * feature invents for itself instead of using the design system.
 *
 * BACKWARD: every class the sheet declares is emitted somewhere, or carries a
 * stated reason for being published surface with no call site of its own. The
 * sheet ships as `@tai42/studio-sdk/components.css`, so "nothing in this repo
 * renders it" is not the same as "dead" — but it is not a free pass either, and
 * an unexplained one is exactly the ambiguity this direction exists to remove.
 *
 * DECLARED LIMIT — the scan reads `tai-` TOKENS out of source rather than
 * parsing JSX, so it sees a class name wherever it is written: a `className`
 * attribute, a constant module such as `control-styles.ts`, a lookup table such
 * as `json-diff.tsx`. The price is that a `tai-` identifier that is not a class
 * has to be named below, and that a name COMPOSED at runtime
 * (`tai-diff-${kind}`) is invisible to it — the prefix alone is skipped. Every
 * such family in this repo also writes its full names as literals, which is what
 * the forward direction actually reads.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { withoutComments } from './test-css-reader';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const stylesheet = readFileSync(resolve(here, 'components.css'), 'utf8');

/** The sheet with its prose docblocks removed, so a class NAMED in a comment is not a rule. */
const sheetRules = withoutComments(stylesheet);

/** Every class the sheet declares a rule for. */
const declared = new Set(
  [...sheetRules.matchAll(/\.(tai-[\w-]+)/g)].map((match) => match[1] ?? ''),
);

const SKIPPED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.turbo',
  '__snapshots__',
]);

/**
 * Product source: the files that can put a class on an element. Test files, test
 * harnesses and the SDK's own `testing` entry are OUT — a class named only by a
 * test has no user-visible call site, which is precisely what the backward
 * direction is asking about.
 */
function sourceFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      if (SKIPPED_DIRECTORIES.has(name)) continue;
      const path = join(directory, name);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      if (/\.test\.tsx?$/.test(name)) continue;
      if (/test-utils|test-harness/.test(path)) continue;
      if (path.includes(join('src', 'testing'))) continue;
      found.push(path);
    }
  };
  walk(root);
  return found;
}

/**
 * Where that source lives. The reference plugin is in: it is the repo's one real
 * plugin and the worked example of the published component API, so a class it
 * misspells is the exact failure a plugin author would copy. The rest of `e2e/`
 * is the Playwright harness and its specs, which are tests and stay out by the
 * same rule that keeps every other test out.
 */
const SCAN_ROOTS = ['packages', 'apps', join('e2e', 'reference-plugin')];

const files = SCAN_ROOTS.map((root) => join(repoRoot, root)).flatMap(sourceFiles);

/**
 * Every `tai-*` token a file writes, keyed to the files that write it.
 *
 * A token ending in `-` is the PREFIX half of a name composed at runtime and is
 * skipped; a token followed by `.` is a namespaced identifier
 * (`tai-studio.apiKey`), not a class list.
 */
function tokensIn(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/(?<![\w-])(tai-[a-z][\w-]*)(?![\w])/g)) {
    const name = match[1] ?? '';
    if (name.endsWith('-')) continue;
    if (source[match.index + match[0].length] === '.') continue;
    names.push(name);
  }
  return names;
}

const emitted = new Map<string, string[]>();
/** Every class-list-shaped string literal in the scanned source. */
const classLists: string[] = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const name of tokensIn(source)) {
    const seen = emitted.get(name) ?? [];
    if (!seen.includes(file)) seen.push(file);
    emitted.set(name, seen);
  }
  for (const match of source.matchAll(/['"`]([\w -]+)['"`]/g)) {
    const literal = match[1] ?? '';
    if (literal.includes('tai-')) classLists.push(literal);
  }
}

/**
 * `tai-` identifiers in product source that are NOT design-system classes. The
 * scan reads tokens rather than parsing JSX — that is what lets it catch a typo
 * in a `className` — so the handful of names that are something else are said
 * here rather than being filtered by a pattern that would also hide a typo.
 */
const NOT_A_CLASS: Readonly<Record<string, string>> = {
  'tai-oauth':
    'the OAuth popup WINDOW NAME in `features/connectors/src/oauth.ts` — a `window.open` target, never rendered on an element',
};

/**
 * Classes the sheet declares that nothing in this repo renders, each with the
 * reason it is published surface rather than dead.
 *
 * `components.css` ships as `@tai42/studio-sdk/components.css`, so a host or a
 * plugin composes with these names directly; deleting one is a breaking change
 * to a consumer, and keeping one unexplained is the ambiguity this list closes.
 * Every entry names what the class IS and which shipped family it belongs to, so
 * a reason cannot be a restatement of the name.
 */
const PUBLISHED_WITHOUT_A_CALL_SITE: Readonly<Record<string, string>> = {
  'tai-badge-solid-ok':
    'the solid OK fill, published so a chart legend or a status swatch draws `--tai-color-ok-fill` with the `on-fill` ink instead of inventing its own pair',
  'tai-badge-solid-err':
    'the solid error fill, published so a chart legend or a status swatch draws `--tai-color-err-fill` with the `on-fill` ink instead of inventing its own pair',
  'tai-badge-solid-warn':
    'the solid warning fill, published so a chart legend or a status swatch draws `--tai-color-warn-fill` with the `on-fill` ink instead of inventing its own pair',
  'tai-input-mono':
    'the mono variant of `.tai-input`, declared in the same rule as the rendered `.tai-textarea-mono` so a single-line identifier field matches the editor',
};

/**
 * A rule the sheet gates on `:not(.other)` is reachable only if something emits
 * the subject class WITHOUT the excluded one. Where nothing does, the reason it
 * is still published surface is stated here.
 */
const UNREACHABLE_BY_DESIGN: Readonly<Record<string, string>> = {};

describe('emitted class names and declared rules', () => {
  it('scans real source and a real sheet (either found empty would pass vacuously)', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(declared.size).toBeGreaterThan(80);
    expect(emitted.size).toBeGreaterThan(60);
    expect(classLists.length).toBeGreaterThan(50);
  });

  it('declares a rule for every class the product emits', () => {
    const undeclaredNames = [...emitted.keys()]
      .filter((name) => !declared.has(name))
      .filter((name) => !(name in NOT_A_CLASS))
      .sort();
    expect(undeclaredNames).toEqual([]);
  });

  it('names every `tai-` identifier that is not a class, rather than filtering it away', () => {
    for (const [name, reason] of Object.entries(NOT_A_CLASS)) {
      // Still live: a name that has left the source has left this list too.
      expect([name, emitted.has(name)]).toEqual([name, true]);
      expect([name, declared.has(name)]).toEqual([name, false]);
      expect([name, reason.length > 40]).toEqual([name, true]);
    }
  });

  it('gives every declared class an emitter or a stated reason', () => {
    const unexplained = [...declared]
      .filter((name) => !emitted.has(name))
      .filter((name) => !(name in PUBLISHED_WITHOUT_A_CALL_SITE))
      .sort();
    expect(unexplained).toEqual([]);
  });

  it('keeps that list honest: live, distinct, and about the class rather than its name', () => {
    const reasons = Object.values(PUBLISHED_WITHOUT_A_CALL_SITE);
    // Distinct, so a reason copied from a sibling cannot stand in for one.
    expect(new Set(reasons).size).toBe(reasons.length);
    for (const [name, reason] of Object.entries(PUBLISHED_WITHOUT_A_CALL_SITE)) {
      // A floor that can actually trip: the shortest reason here is 76
      // characters, so a name-shaped placeholder fails rather than passing.
      expect([name, reason.length > 60]).toEqual([name, true]);
      // Not stale in either direction: the rule still exists, and nothing has
      // started rendering it since — a class that gained a call site has to lose
      // its entry, or the list quietly becomes fiction.
      expect([name, declared.has(name)]).toEqual([name, true]);
      expect([name, emitted.has(name)]).toEqual([name, false]);
    }
  });

  it('shows a rule gated on `:not(.other)` reaching something, or says why not', () => {
    // The whole interactive half of `.tai-chip` was unreachable and nothing said
    // so: every emitter adds `.tai-chip-static`, which the hover, the pressed
    // ground and the coarse pointer target all exclude.
    const gated = [
      ...new Set(
        [...sheetRules.matchAll(/(\.tai-[\w-]+):not\((\.tai-[\w-]+)\)/g)].map(
          (match) => `${(match[1] ?? '').slice(1)}:not(${match[2] ?? ''})`,
        ),
      ),
    ].sort();
    expect(gated.length).toBeGreaterThan(0);
    for (const guard of gated) {
      const subject = guard.slice(0, guard.indexOf(':not('));
      const excluded = guard.slice(guard.indexOf(':not(') + 6, -1);
      const reachable = classLists.some((list) => {
        const names = list.split(/\s+/);
        return names.includes(subject) && !names.includes(excluded);
      });
      const reason = UNREACHABLE_BY_DESIGN[guard];
      expect([guard, reachable || reason !== undefined]).toEqual([guard, true]);
      if (reason !== undefined) {
        expect([guard, reason.length > 60]).toEqual([guard, true]);
        // …and the exemption is not stale: it may not describe a rule that IS
        // reachable, or the next unreachable one hides behind it.
        expect([guard, reachable]).toEqual([guard, false]);
      }
    }
  });

  it('leaves no exemption naming a guard the sheet no longer writes', () => {
    const gated = new Set(
      [...sheetRules.matchAll(/(\.tai-[\w-]+):not\((\.tai-[\w-]+)\)/g)].map(
        (match) => `${(match[1] ?? '').slice(1)}:not(${match[2] ?? ''})`,
      ),
    );
    expect(Object.keys(UNREACHABLE_BY_DESIGN).filter((guard) => !gated.has(guard))).toEqual([]);
  });
});
