/**
 * Every feature page's PageHeader `eyebrow` matches the nav section its token sits in.
 *
 * The eyebrow is the small label above a page's title; it names the section the page
 * belongs to, and the primary nav groups the same token under that section
 * ({@link NAV_SECTIONS}). Those two live apart — the eyebrow is a hardcoded string in
 * each `@tai42/feature-*` page, the grouping is this app's route map — so a nav refit
 * that moves a token to a new section leaves the page's eyebrow naming the OLD one, a
 * silent drift a reader on the page sees but no compile step catches.
 *
 * This is a STATIC SOURCE SCAN, not a mount: rendering all eighteen pages would need
 * every page's provider stack and data stubs, so instead each page's source is read
 * from disk and its `eyebrow="…"` literal is compared to the section its token maps to.
 * The token→source map is checked against {@link FEATURE_TOKENS} first, so a feature
 * added to the nav without an entry here fails rather than slipping the scan.
 *
 * Reading the monorepo's own files needs `node:` core, granted to app-layer test files
 * by the architectural boundary (see `eslint-boundaries.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DASHBOARD_TOKEN, FEATURE_TOKENS, NAV_SECTIONS, type FeatureToken } from './routes';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const featuresDir = resolve(repoRoot, 'packages/features');

/**
 * Token → the page source that carries its `PageHeader` eyebrow, relative to
 * `packages/features`. This is the one bit of test-maintained data; the completeness
 * check below pins it against the shipped token list so it cannot silently go stale.
 */
const PAGE_SOURCES: Record<FeatureToken, string> = {
  tools: 'tools/src/ToolsPage.tsx',
  agents: 'agents/src/agents.tsx',
  presets: 'presets/src/PresetsPage.tsx',
  extensions: 'extensions/src/extensions.tsx',
  templates: 'templates/src/TemplatesPage.tsx',
  connectors: 'connectors/src/connectors-page.tsx',
  servedEndpoints: 'manifest/src/ServedEndpointsPage.tsx',
  hooks: 'hooks/src/HooksPage.tsx',
  scheduling: 'scheduling/src/SchedulingPage.tsx',
  conversations: 'conversations/src/ConversationsPage.tsx',
  interactions: 'interactions/src/interactions.tsx',
  notifications: 'notifications/src/NotificationsPage.tsx',
  settings: 'settings/src/SettingsPage.tsx',
  storage: 'storage/src/StoragePage.tsx',
  marketplace: 'marketplace/src/MarketplacePage.tsx',
  manifest: 'manifest/src/ManifestPage.tsx',
  system: 'system/src/SystemPage.tsx',
  observability: 'observability/src/ObservabilityPage.tsx',
};

/** The single `eyebrow="…"` literal in a page source (there is exactly one per page). */
function eyebrowOf(token: FeatureToken): string {
  const source = readFileSync(resolve(featuresDir, PAGE_SOURCES[token]), 'utf8');
  const matches = [...source.matchAll(/eyebrow="([^"]+)"/g)].flatMap((m) =>
    m[1] === undefined ? [] : [m[1]],
  );
  const [only, ...rest] = matches;
  if (only === undefined || rest.length > 0) {
    throw new Error(
      `Expected exactly one eyebrow in ${PAGE_SOURCES[token]}, found ${matches.length.toString()}`,
    );
  }
  return only;
}

/** Token → the nav section label it renders under; the dashboard token sits in none. */
const sectionLabelOf = new Map<FeatureToken, string>();
for (const section of NAV_SECTIONS) {
  for (const token of section.tokens) sectionLabelOf.set(token, section.label);
}

describe('feature page eyebrows track their nav section', () => {
  it('has a page source for every shipped feature token (nothing slips the scan)', () => {
    expect(Object.keys(PAGE_SOURCES).sort()).toEqual([...FEATURE_TOKENS].sort());
  });

  // Every sectioned token: its page eyebrow must equal the section label. The standalone
  // dashboard token is exempt — it renders above the labeled sections with no section of
  // its own — and is asserted separately below.
  const sectioned = FEATURE_TOKENS.filter((token) => token !== DASHBOARD_TOKEN);
  it.each(sectioned)('%s: eyebrow equals its nav section label', (token) => {
    const expected = sectionLabelOf.get(token);
    expect(expected).toBeDefined();
    expect(eyebrowOf(token)).toBe(expected);
  });

  it('the standalone dashboard page names its own eyebrow, not a section', () => {
    // The dashboard is the lead nav row with no section header; its eyebrow is its own
    // and must not accidentally read as one of the section labels.
    const eyebrow = eyebrowOf(DASHBOARD_TOKEN);
    expect(sectionLabelOf.has(DASHBOARD_TOKEN)).toBe(false);
    expect([...sectionLabelOf.values()]).not.toContain(eyebrow);
  });
});
