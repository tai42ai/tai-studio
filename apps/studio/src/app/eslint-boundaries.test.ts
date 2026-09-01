import { ESLint, type Linter } from 'eslint';
import boundaries from 'eslint-plugin-boundaries';
import { describe, expect, it } from 'vitest';

import config, {
  boundariesDependenciesRule,
  boundariesElements,
  TEST_GLOBS,
} from '../../../../eslint.config.js';

/**
 * Lint-rule FIXTURE test for the architectural import boundary.
 *
 * Two things are proven together:
 *  - the allowlist LOGIC rejects a deliberate cross-feature import and a
 *    deliberate arbitrary-external import (lint them through the exported
 *    `boundaries/elements` + `boundaries/dependencies` config via ESLint's Node
 *    API, on a virtual feature file path);
 *  - the rule is actually WIRED into the applied eslint.config.js (a structural
 *    check on the default export), so removing it from the config — which the
 *    behavioural test alone would not catch — fails here.
 *
 * The sensitivity case relaxes the rule to `default: allow` and asserts the same
 * imports then pass, proving the assertions depend on the rule being strict.
 */

// The repo root, derived from this file's URL without importing node:path (this
// file is linted as app-layer source, which may not import Node core). The
// trailing slash is stripped so `boundaries/root-path` matches element patterns.
const repoRoot = new URL('../../../../', import.meta.url).pathname.replace(/\/+$/, '');

// Virtual paths, one per layer the rules distinguish. No file is ever written to
// disk — `lintText` lints the provided source, and boundaries classifies it by
// path. The `.test.ts` variants are the paths TEST_GLOBS selects, which is what
// decides whether the test-only half of the allowlist applies.
const featureHooksFile = `${repoRoot}/packages/features/hooks/src/__boundary_fixture__.ts`;
const featureHooksTestFile = `${repoRoot}/packages/features/hooks/src/__boundary_fixture__.test.ts`;
const featureToolsFile = `${repoRoot}/packages/features/tools/src/__boundary_fixture__.ts`;
const sdkFile = `${repoRoot}/packages/studio-sdk/src/components/__boundary_fixture__.ts`;
const sdkTestFile = `${repoRoot}/packages/studio-sdk/src/components/__boundary_fixture__.test.ts`;
const appFile = `${repoRoot}/apps/studio/src/app/__boundary_fixture__.ts`;
const appTestFile = `${repoRoot}/apps/studio/src/app/__boundary_fixture__.test.ts`;
const apiClientFile = `${repoRoot}/packages/api-client/src/__boundary_fixture__.ts`;
const apiClientTestFile = `${repoRoot}/packages/api-client/src/__boundary_fixture__.test.ts`;

/** Builds an ESLint instance wired with only the boundary config under test. */
function makeLinter(rule: Linter.RuleEntry) {
  return new ESLint({
    cwd: repoRoot,
    overrideConfigFile: true,
    overrideConfig: {
      files: ['**/*.{ts,tsx}'],
      plugins: { boundaries },
      languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
      settings: {
        'boundaries/root-path': repoRoot,
        'boundaries/elements': boundariesElements,
        'boundaries/legacy-templates': false,
      },
      rules: { 'boundaries/dependencies': rule },
    },
  });
}

/** Lints `code` as `filePath` and returns only the boundary violations. */
async function boundaryErrorsAt(filePath: string, code: string, rule: Linter.RuleEntry) {
  const [result] = await makeLinter(rule).lintText(code, { filePath });
  if (result === undefined) throw new Error('ESLint returned no result for the fixture');
  return result.messages.filter((m) => m.ruleId === 'boundaries/dependencies');
}

/** Lints `code` as feature-hooks and returns only the boundary violations. */
async function boundaryErrors(code: string, rule: Linter.RuleEntry) {
  return boundaryErrorsAt(featureHooksFile, code, rule);
}

describe('eslint-plugin-boundaries allowlist', () => {
  const strictRule = boundariesDependenciesRule(false);

  it('rejects a cross-feature import from within a feature', async () => {
    const errors = await boundaryErrors("import '@tai42/feature-tools';\n", strictRule);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('@tai42/feature-tools');
  });

  it('rejects an arbitrary third-party import the allowlist does not name', async () => {
    const errors = await boundaryErrors("import 'zustand';\n", strictRule);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('zustand');
  });

  it('permits the packages a feature is allowed to import', async () => {
    const errors = await boundaryErrors(
      "import '@tai42/studio-sdk';\nimport '@tai42/api-client';\nimport 'react';\nimport '@tanstack/react-query';\n",
      strictRule,
    );
    expect(errors).toHaveLength(0);
  });

  it('is sensitive to the rule: a relaxed rule stops reporting the same imports', async () => {
    // If the rule is gutted (default `allow`), the illegal imports no longer report.
    const relaxedRule: Linter.RuleEntry = ['error', { default: 'allow', rules: [] }];
    const errors = await boundaryErrors(
      "import '@tai42/feature-tools';\nimport 'zustand';\n",
      relaxedRule,
    );
    expect(errors).toHaveLength(0);
  });

  it('enforces boundaries/dependencies on source files in the applied eslint.config', () => {
    // The behavioural tests above use the exported builder, so they would still
    // pass if the rule were removed from the config. This pins that the SOURCE
    // block (`**/*.{ts,tsx}`) actually installs it at error level — deleting it
    // or setting it to `off` there makes real `pnpm lint` stop enforcing, and
    // fails this. (The tooling-file and this-test exemption blocks set `off` by
    // design, so a whole-config scan is not the right check.)
    const sourceEnforced = config.some((c) => {
      const entry = c.rules?.['boundaries/dependencies'];
      const level = Array.isArray(entry) ? entry[0] : entry;
      const files = Array.isArray(c.files) ? c.files : [];
      return level === 'error' && files.includes('**/*.{ts,tsx}');
    });
    expect(sourceEnforced).toBe(true);
  });
});

/**
 * The Node-core grant.
 *
 * The design-system and manifest gate tests READ the monorepo's own files from
 * disk, so they need `node:fs` and friends that the layer allowlist withholds
 * from library code. That grant is scoped by LAYER (`sdk`, `app`) and by the test
 * override, so it reaches a new scanner test the moment it is written and reaches
 * nothing else.
 *
 * These cases pin all four edges, because the obvious alternative — a block naming
 * each scanner file and setting `boundaries/dependencies` to `off` — silently
 * removes the WHOLE allowlist from every file it names, and goes stale besides.
 */
describe('Node core in the read-from-disk gate tests', () => {
  const testRule = boundariesDependenciesRule(true);
  const strictRule = boundariesDependenciesRule(false);

  it.each([
    ['the SDK', sdkTestFile],
    ['the shell app', appTestFile],
    ['the API client', apiClientTestFile],
  ])('permits Node core in a %s test', async (_layer, filePath) => {
    const errors = await boundaryErrorsAt(
      filePath,
      "import 'node:fs';\nimport 'node:path';\nimport 'node:url';\n",
      testRule,
    );
    expect(errors).toEqual([]);
  });

  it('keeps the rest of the allowlist ON in those same tests', async () => {
    // The whole point: a per-file `off` exemption buys Node core by switching the
    // architectural boundary off entirely, which would let an SDK gate test import
    // any package at all. Scoping to `origin: core` leaves everything else denied.
    const errors = await boundaryErrorsAt(
      sdkTestFile,
      "import 'zustand';\nimport '@dnd-kit/core';\n",
      testRule,
    );
    expect(errors.map((error) => error.message).join('\n')).toContain('zustand');
    expect(errors).toHaveLength(2);
  });

  it('withholds Node core from SDK production source', async () => {
    // The grant rides on the test override; production library code never gets it.
    const errors = await boundaryErrorsAt(sdkFile, "import 'node:fs';\n", strictRule);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('node:fs');
  });

  it('withholds Node core from api-client production source', async () => {
    // api-client is a published BROWSER library, so a `node:` import in its
    // production source breaks every consumer at bundle time. Its grant rides on
    // the same test override; production source never gets it. This is the layer
    // whose earlier UNCONDITIONAL core grant was withdrawn — the assertion that
    // reddens if that grant is re-added.
    const errors = await boundaryErrorsAt(apiClientFile, "import 'node:fs';\n", strictRule);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('node:fs');
  });

  it('withholds Node core from a feature test', async () => {
    // Scoped by layer: a feature renders, it does not read the repository.
    const errors = await boundaryErrorsAt(featureHooksTestFile, "import 'node:fs';\n", testRule);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('node:fs');
  });

  it('leaves no per-file block that switches the whole boundary off', () => {
    // A file list is an enumeration with a delay fuse: it goes stale, and every
    // path on it loses the entire allowlist rather than the one capability it
    // needed. Only two `off` blocks are legitimate — build/config tooling, which
    // the architectural boundary does not govern, and this fixture file, which
    // imports the config it exercises.
    const disablingBlocks = config
      .filter((c) => {
        const entry = c.rules?.['boundaries/dependencies'];
        return (Array.isArray(entry) ? entry[0] : entry) === 'off';
      })
      .map((c) => (Array.isArray(c.files) ? c.files : []));
    expect(disablingBlocks).toEqual([
      [
        '**/*.config.{js,ts}',
        'eslint.config.js',
        'eslint.config.d.ts',
        'apps/studio/vendor/**/*.ts',
        '**/scripts/**/*.mjs',
      ],
      ['apps/studio/src/app/eslint-boundaries.test.ts'],
    ]);
  });
});

/**
 * Confinement of the standalone visual jq editor (`@tai42/jq-studio`).
 *
 * The editor is a multi-megabyte package with a Web Worker and a wasm engine, and
 * the SDK deliberately holds NO edge to it: the barrel re-exports none of it, so a
 * consumer that imports the SDK for a Button ships no jq. Only the host app, the
 * features that actually author expressions, and the SDK's contract TEST (which
 * checks the real `JqField` still satisfies the mirrored injection contract) may
 * name it. These cases pin every edge of that grant, in both directions.
 */
describe('@tai42/jq-studio confinement', () => {
  const strictRule = boundariesDependenciesRule(false);
  const testRule = boundariesDependenciesRule(true);
  const importJq = "import '@tai42/jq-studio';\n";

  it('withholds the editor from SDK production source', async () => {
    // A production SDK module naming the editor re-emits it, its worker, and its
    // wasm into every bundling consumer — the regression the whole split prevents.
    const errors = await boundaryErrorsAt(sdkFile, importJq, strictRule);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('@tai42/jq-studio');
  });

  it('permits the editor in an SDK test (the injection-contract test)', async () => {
    const errors = await boundaryErrorsAt(sdkTestFile, importJq, testRule);
    expect(errors).toEqual([]);
  });

  it('permits the editor in the features that render it', async () => {
    const errors = await boundaryErrorsAt(featureHooksFile, importJq, strictRule);
    expect(errors).toEqual([]);
  });

  it('withholds the editor from a feature that does not render it', async () => {
    // The grant is scoped by captured feature name, not handed to the feature layer:
    // an unrelated feature reaching for the editor is a boundary error.
    const errors = await boundaryErrorsAt(featureToolsFile, importJq, strictRule);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('@tai42/jq-studio');
  });

  it('withholds the editor from a non-rendering feature in TESTS too', async () => {
    const errors = await boundaryErrorsAt(
      `${repoRoot}/packages/features/tools/src/__boundary_fixture__.test.ts`,
      importJq,
      testRule,
    );
    expect(errors).toHaveLength(1);
  });

  it('permits the editor in the shell app, which injects the primitives and worker', async () => {
    const errors = await boundaryErrorsAt(appFile, importJq, strictRule);
    expect(errors).toEqual([]);
  });
});

/**
 * Structural pins for the `no-restricted-imports` overrides. eslint-plugin-boundaries
 * matches external modules by package BASE name only, so it cannot confine a subpath
 * like `@tai42/studio-sdk/testing`; that confinement is done with `no-restricted-imports`
 * blocks instead. These assertions inspect the applied default-export config directly
 * (rather than linting through the typed config), so deleting either override turns the
 * relevant test red.
 */

/** Flatten every `no-restricted-imports` pattern `group` into a flat list of module names. */
function restrictedImportGroups(entry: unknown): string[] {
  if (!Array.isArray(entry)) return [];
  const options: unknown = entry[1];
  if (typeof options !== 'object' || options === null || !('patterns' in options)) return [];
  const patterns: unknown = options.patterns;
  if (!Array.isArray(patterns)) return [];
  const groups: string[] = [];
  for (const pattern of patterns as unknown[]) {
    if (typeof pattern !== 'object' || pattern === null || !('group' in pattern)) continue;
    const group: unknown = pattern.group;
    if (!Array.isArray(group)) continue;
    for (const module of group as unknown[]) if (typeof module === 'string') groups.push(module);
  }
  return groups;
}

describe('no-restricted-imports subpath confinement', () => {
  it('confines the reference plugin to @tai42/studio-sdk: forbids /host and /testing in its studio-src', () => {
    // Pins the plugin-author trust boundary override — deleting it would let a
    // reference-plugin source file reach the host registry or the test-only reset.
    const refGlob = 'e2e/reference-plugin/studio-src/**/*.{ts,tsx}';
    const block = config.find((c) => {
      const files = Array.isArray(c.files) ? c.files : [];
      return files.includes(refGlob) && c.rules?.['no-restricted-imports'] !== undefined;
    });
    expect(block).toBeDefined();
    const entry = block?.rules?.['no-restricted-imports'];
    const level = Array.isArray(entry) ? entry[0] : entry;
    expect(level).toBe('error');
    const groups = restrictedImportGroups(entry);
    expect(groups).toContain('@tai42/studio-sdk/host');
    expect(groups).toContain('@tai42/studio-sdk/testing');
  });

  it('forbids the test-only @tai42/studio-sdk/testing reset in production (non-test) source', () => {
    // Pins the production-confinement override — deleting it would let production
    // app/feature/SDK code import `__resetContributions` and wipe the live registry.
    const block = config.find((c) => {
      const files = Array.isArray(c.files) ? c.files : [];
      const entry = c.rules?.['no-restricted-imports'];
      return (
        entry !== undefined &&
        files.includes('apps/studio/**/*.{ts,tsx}') &&
        files.includes('packages/features/*/src/**/*.{ts,tsx}') &&
        files.includes('packages/studio-sdk/src/**/*.{ts,tsx}')
      );
    });
    expect(block).toBeDefined();
    // Tests are excluded via `ignores`, so they keep their access to the reset.
    const ignores = Array.isArray(block?.ignores) ? block.ignores : [];
    expect(ignores).toEqual(TEST_GLOBS);
    const entry = block?.rules?.['no-restricted-imports'];
    const level = Array.isArray(entry) ? entry[0] : entry;
    expect(level).toBe('error');
    const groups = restrictedImportGroups(entry);
    expect(groups).toContain('@tai42/studio-sdk/testing');
  });

  it('confines the SDK to a leaf: forbids importing any internal @tai42/* package at runtime', () => {
    // Pins the SDK runtime-leaf override — deleting or downgrading it would let the
    // SDK take a runtime dependency on another internal package and break the
    // shared-singleton boundary (type-only imports stay allowed).
    const sdkGlob = 'packages/studio-sdk/src/**/*.{ts,tsx}';
    const block = config.find((c) => {
      const files = Array.isArray(c.files) ? c.files : [];
      return (
        files.length === 1 &&
        files.includes(sdkGlob) &&
        c.rules?.['@typescript-eslint/no-restricted-imports'] !== undefined
      );
    });
    expect(block).toBeDefined();
    // The base rule is disabled here; the typescript-eslint variant carries the boundary.
    expect(block?.rules?.['no-restricted-imports']).toBe('off');
    const entry = block?.rules?.['@typescript-eslint/no-restricted-imports'];
    const level = Array.isArray(entry) ? entry[0] : entry;
    expect(level).toBe('error');
    const groups = restrictedImportGroups(entry);
    expect(groups).toContain('@tai42/*');
  });
});
