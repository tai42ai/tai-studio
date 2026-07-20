/**
 * The single place shell route TOKENS bind to real paths. Features and the
 * shell navigate by opaque {@link RouteToken}; only this map knows the path a
 * token resolves to, so a route rename is a one-line change here and a compile
 * break at any call site that used a now-removed token.
 */
import type { RouteToken } from '@tai42/studio-sdk';

/**
 * Token → path. Every {@link RouteToken} in the SDK contract has an entry.
 */
export const PATH: Record<RouteToken, string> = {
  login: '/login',
  tools: '/tools',
  agents: '/agents',
  presets: '/presets',
  extensions: '/extensions',
  interactions: '/interactions',
  notifications: '/notifications',
  connectors: '/connectors',
  hooks: '/hooks',
  templates: '/templates',
  storage: '/storage',
  manifest: '/manifest',
  settings: '/settings',
  system: '/system',
  scheduling: '/scheduling',
  observability: '/observability',
  marketplace: '/marketplace',
};

/** The feature routes the shell mounts (every token EXCEPT `login`), each backed
 * by its `@tai42/feature-*` page. */
export const FEATURE_TOKENS = [
  'tools',
  'agents',
  'presets',
  'extensions',
  'interactions',
  'notifications',
  'connectors',
  'hooks',
  'templates',
  'storage',
  'manifest',
  'settings',
  'system',
  'scheduling',
  'observability',
  'marketplace',
] as const satisfies readonly RouteToken[];

export type FeatureToken = (typeof FEATURE_TOKENS)[number];
