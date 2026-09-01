// Vendor wrapper: the served `@tai42/jq-studio` module — the standalone visual jq
// editor (`JqField`, `JqEditorDialog`, the `PrimitivesProvider` design-system
// injection point, and the worker/loader helpers). `react`, `react-dom`, and their
// subpaths are external so the editor binds the one React instance; everything else
// (the xyflow canvas, the jq worker, the wasm engine) is bundled here.
//
// THIS FILE IS THE SINGLETON. jq-studio builds a module-scoped React context for its
// primitives and installs one shared Web Worker, so a second copy would mean a second
// context (the host's injection silently falling back to the built-ins), a second
// worker, and a duplicate ~2.9MB wasm. The import map resolves the bare
// `@tai42/jq-studio` specifier to the single served build of this file, so the shell,
// every feature bundled into it, and every Studio plugin reach the same instance.
// The editor's stylesheet is loaded by the shell (src/main.tsx), not here.
export * from '@tai42/jq-studio';
