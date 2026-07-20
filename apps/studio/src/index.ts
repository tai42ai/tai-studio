/**
 * @tai42/studio-app — the shell's public/testable surface. The runnable entry is
 * `main.tsx`; this barrel exposes the composition root and the shell-owned routing
 * primitives (the token→path map, the navigation resolver, the plugin loader) so
 * tests and tooling import them from one place.
 */
export { createStudio } from './app/create-studio';
export type { Studio, StudioDeps } from './app/create-studio';
export { buildRouter } from './app/router';
export type { AppRouter } from './app/router';
export { createNavigation } from './app/navigation';
export { PATH, FEATURE_TOKENS } from './app/routes';
export type { FeatureToken } from './app/routes';
export { createPluginLoader } from './app/plugin-loader';
export type {
  PluginLoader,
  PluginLoaderState,
  PluginLoaderDeps,
  ImportModule,
} from './app/plugin-loader';
export { importMapIntegrityEnforced, IntegrityBanner } from './app/integrity';
