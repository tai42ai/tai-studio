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

// A virtual path inside feature-hooks. The file is never written to disk —
// `lintText` lints the provided source, and boundaries classifies it by path.
const featureHooksFile = `${repoRoot}/packages/features/hooks/src/__boundary_fixture__.ts`;

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

/** Lints `code` as feature-hooks and returns only the boundary violations. */
async function boundaryErrors(code: string, rule: Linter.RuleEntry) {
  const [result] = await makeLinter(rule).lintText(code, { filePath: featureHooksFile });
  if (result === undefined) throw new Error('ESLint returned no result for the fixture');
  return result.messages.filter((m) => m.ruleId === 'boundaries/dependencies');
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
