import type { Linter } from 'eslint';

/** A source-layer definition consumed by `boundaries/elements`. */
export interface BoundaryElement {
  readonly type: string;
  readonly pattern: string;
  readonly mode: string;
  readonly capture?: readonly string[];
}

export const boundariesElements: readonly BoundaryElement[];

/**
 * Builds the `boundaries/dependencies` allowlist rule entry. When
 * `includeTestExternals` is true the test-only packages are added.
 */
export function boundariesDependenciesRule(includeTestExternals: boolean): Linter.RuleEntry;

/** Globs matching test and test-support source files. */
export const TEST_GLOBS: readonly string[];

declare const config: readonly Linter.Config[];
export default config;
