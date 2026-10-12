// Type declarations for gen-schemas.mjs, so a typed consumer (the freshness test) can import the
// pure generator without an untyped-module error.

/** The generated file names, in the order `generate` returns them. */
export declare const OUTPUT_FILES: readonly string[];

/**
 * Generate the api-client's schema, route-table and constants modules from a parsed contract
 * bundle and a parsed OpenAPI artifact.
 */
export declare const generate: (
  bundle: unknown,
  spec: unknown,
) => {
  readonly files: Readonly<Record<string, string>>;
  readonly documentNames: readonly string[];
};
