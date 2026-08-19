// Declares the bare side-effect CSS import in the barrel, so `./fonts.css`
// resolves in every program that compiles index.ts — including feature tooling
// programs that resolve the SDK to source, where TS6 hard-errors (TS2882) on an
// unresolved side-effect import. Side-effect only: no JS bindings.
export {};
