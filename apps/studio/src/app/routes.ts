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
  conversations: '/conversations',
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

/**
 * The standalone lead nav row, shown above the labeled sections with no section
 * header of its own. Its {@link NAV_LABELS} label is already "Dashboard".
 */
export const DASHBOARD_TOKEN = 'observability' as const satisfies RouteToken;

/**
 * The primary nav's grouped structure and its ORDER: the single source of truth
 * for how feature tokens are labelled into sections and the sequence they render
 * in. {@link FEATURE_TOKENS} is derived from this (Dashboard first, then each
 * section in turn), so nav order and the flat token list can never drift apart.
 */
export const NAV_SECTIONS = [
  { label: 'Capabilities', tokens: ['tools', 'agents', 'presets', 'extensions', 'templates'] },
  { label: 'Integrations', tokens: ['connectors', 'hooks', 'storage'] },
  { label: 'Activity', tokens: ['scheduling', 'interactions', 'notifications', 'conversations'] },
  { label: 'Administration', tokens: ['marketplace', 'manifest', 'settings', 'system'] },
] as const satisfies readonly { readonly label: string; readonly tokens: readonly RouteToken[] }[];

/**
 * The feature routes the shell mounts (every token EXCEPT `login`), each backed
 * by its `@tai42/feature-*` page. DERIVED from {@link DASHBOARD_TOKEN} +
 * {@link NAV_SECTIONS} (order-preserving, Dashboard first) so the nav grouping is
 * the one place tokens are declared — the type below and every consumer track it.
 */
export const FEATURE_TOKENS = [
  DASHBOARD_TOKEN,
  ...NAV_SECTIONS.flatMap((section) => section.tokens),
] as const satisfies readonly RouteToken[];

export type FeatureToken = (typeof FEATURE_TOKENS)[number];
