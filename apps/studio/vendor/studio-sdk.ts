// Vendor wrapper: the served `@tai42/studio-sdk` module — the shared design
// system + plugin API (types, plugin context, hooks, primitives). `react`,
// `react-dom`, and their subpaths are external so the SDK binds the one React
// instance; everything else (Radix primitives) is bundled so the shell and every
// Studio-plugin share ONE SDK instance. The contribution registry is NOT part of
// this surface — it is host-only, served separately as `@tai42/studio-sdk/host`
// (studio-sdk-host.js), so a plugin importing this module cannot reach it. The
// SDK's token stylesheet is loaded by the shell, not here.
export * from '@tai42/studio-sdk';
