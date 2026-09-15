/**
 * @tai42/studio-app — the shell's public/testable surface. The runnable entry is
 * `main.tsx`; this barrel exposes the composition root and the shell-owned routing
 * primitives (the token→path map, the navigation resolver, the plugin loader) so
 * tests and tooling import them from one place.
 */
export type { Studio, StudioDeps } from './app/create-studio';
export { createStudio } from './app/create-studio';
export { importMapIntegrityEnforced, IntegrityBanner } from './app/integrity';
export { createNavigation } from './app/navigation';
export type {
  ImportModule,
  PluginLoader,
  PluginLoaderDeps,
  PluginLoaderState,
} from './app/plugin-loader';
export { createPluginLoader } from './app/plugin-loader';
export type { AppRouter } from './app/router';
export { buildRouter } from './app/router';
export type { FeatureToken } from './app/routes';
export { FEATURE_TOKENS, PATH } from './app/routes';
