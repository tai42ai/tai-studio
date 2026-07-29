// Vendor wrapper: the served `@tai42/studio-sdk/host` module — the HOST-ONLY
// registry API (`loadPlugin`, `getContributions`). `react`, `react-dom`, and their
// subpaths are external so this binds the one React instance; the registry is
// bundled here and NOWHERE else served, so the module-level registry state exists
// in exactly one served asset. Only the host shell imports this; plugin bundles get
// `@tai42/studio-sdk` (the plugin surface), which carries no registry.
export * from '@tai42/studio-sdk/host';
