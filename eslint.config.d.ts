import type { Linter } from 'eslint';

/** The eslint-plugin-boundaries settings every source file is linted with. */
export const boundariesSettings: Readonly<NonNullable<Linter.Config['settings']>> & {
  /** The repo root on disk; the elements' patterns are relative to it. */
  readonly 'boundaries/root-path': string;
};

/**
 * Builds the `boundaries/dependencies` allowlist rule entry. When
 * `includeTestExternals` is true the test-only packages are added.
 */
export function boundariesDependenciesRule(includeTestExternals: boolean): Linter.RuleEntry;

/** Globs matching test and test-support source files. */
export const TEST_GLOBS: readonly string[];

declare const config: readonly Linter.Config[];
export default config;
