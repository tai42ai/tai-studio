// Type declarations for gen-schemas.mjs, so a typed consumer (the freshness test)
// can import the pure generator without an untyped-module error.

/** Generate the served-document schema module source from a parsed contract bundle. */
export declare const generate: (bundle: unknown) => {
  readonly source: string;
  readonly documentNames: readonly string[];
};
