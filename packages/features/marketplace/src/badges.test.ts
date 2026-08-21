/**
 * Unit tests for the listing-card badge policy: groups first, listed kinds as
 * item names, hidden kinds omitted, other kinds as counted kind badges, and the
 * all-hidden fallback. Every policy branch is exercised on its own row.
 */
import { describe, expect, it } from 'vitest';

import type { MarketplaceSearchRow } from '@tai42/api-client';

import { listingBadges, sourceLabel } from './badges';

function row(overrides: Partial<MarketplaceSearchRow> = {}): MarketplaceSearchRow {
  return {
    ref: 'tai42/toolbox',
    namespace: 'tai42',
    name: 'toolbox',
    display_name: 'Toolbox',
    icon_url: null,
    package: 'tai42-toolbox',
    description: 'A box of tools.',
    categories: [],
    tags: [],
    trust_tier: 'official',
    pricing: 'free',
    latest_version: '1.0.0',
    downloads: 0,
    updated_at: '2026-07-01T00:00:00Z',
    kinds: [],
    groups: [],
    ...overrides,
  };
}

describe('sourceLabel', () => {
  it('reads `spec` as "descriptor" and passes every other source through', () => {
    expect(sourceLabel('spec')).toBe('descriptor');
    expect(sourceLabel('pypi')).toBe('pypi');
    expect(sourceLabel('github')).toBe('github');
  });
});

describe('listingBadges', () => {
  it('shows a single-member group as its bare name', () => {
    expect(listingBadges(row({ groups: [{ name: 'setup', count: 1 }] }))).toEqual(['setup']);
  });

  it('shows a cross-kind group with its count suffix, groups first', () => {
    const badges = listingBadges(
      row({
        groups: [{ name: 'onboarding', count: 3 }],
        kinds: [{ kind: 'agent', count: 1, names: ['echo'] }],
      }),
    );
    // The group leads, its count is suffixed above one, then the ungrouped kind.
    expect(badges).toEqual(['onboarding ×3', 'agent']);
  });

  it('names each item of a LISTED kind instead of counting it', () => {
    expect(
      listingBadges(row({ kinds: [{ kind: 'channel', count: 2, names: ['slack', 'telegram'] }] })),
    ).toEqual(['slack', 'telegram']);
  });

  it('omits a HIDDEN kind when other badges exist', () => {
    const badges = listingBadges(
      row({
        kinds: [
          { kind: 'router', count: 4, names: [] },
          { kind: 'tool', count: 2, names: ['a', 'b'] },
        ],
      }),
    );
    // The router contributes nothing; only the counted tool badge shows.
    expect(badges).toEqual(['tool ×2']);
  });

  it('counts any other kind, suffixing above one', () => {
    expect(
      listingBadges(
        row({
          kinds: [
            { kind: 'tool', count: 3, names: ['a', 'b', 'c'] },
            { kind: 'agent', count: 1, names: ['d'] },
          ],
        }),
      ),
    ).toEqual(['tool ×3', 'agent']);
  });

  it('falls back to hidden kinds as counts when the policy would blank a non-empty row', () => {
    // A router-only listing: every kind is hidden and there are no groups, so the
    // fallback surfaces the hidden kinds as counts rather than an empty badge list.
    expect(listingBadges(row({ kinds: [{ kind: 'router', count: 2, names: [] }] }))).toEqual([
      'router ×2',
    ]);
  });

  it('returns an empty list for a row with no groups and no kinds', () => {
    expect(listingBadges(row())).toEqual([]);
  });

  it('renders a mixed row: groups, listed names, counted kinds, hidden omitted', () => {
    const badges = listingBadges(
      row({
        groups: [
          { name: 'core', count: 2 },
          { name: 'extras', count: 1 },
        ],
        kinds: [
          { kind: 'channel', count: 1, names: ['slack'] },
          { kind: 'tool', count: 4, names: ['a', 'b', 'c', 'd'] },
          { kind: 'router', count: 1, names: [] },
        ],
      }),
    );
    expect(badges).toEqual(['core ×2', 'extras', 'slack', 'tool ×4']);
  });
});
