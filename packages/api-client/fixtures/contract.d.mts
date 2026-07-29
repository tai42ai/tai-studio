/** Types for the fixtures capture contract (see contract.mjs). */
export interface FixtureEndpoint {
  readonly name: string;
  readonly path: string;
  readonly schema: string;
}

/** A hand-authored Class 2 fixture (mutation or redacted) bound to a zod schema. */
export interface AuthoredFixture {
  readonly name: string;
  readonly path: string;
  readonly file: string;
  readonly schema: string;
}

export declare const FIXTURE_ENDPOINTS: readonly FixtureEndpoint[];
export declare const MUTATION_FIXTURES: readonly AuthoredFixture[];
export declare const REDACTED_FIXTURES: readonly AuthoredFixture[];
export declare const EXCLUDED_FROM_CAPTURE: readonly string[];
export declare function isExcluded(path: string): boolean;
export declare function assertCaptureSetSafe(endpoints?: readonly FixtureEndpoint[]): void;
