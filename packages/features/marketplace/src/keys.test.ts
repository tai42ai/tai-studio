/**
 * The query-key factory pins the exact tuples the queries and the post-mutation
 * invalidations share, so a drift between a producer and a consumer is a test
 * failure rather than a silent cache miss.
 */
import { describe, expect, it } from 'vitest';

import {
  marketplaceAdvisoriesKey,
  marketplaceCategoriesKey,
  marketplaceInstalledKey,
  marketplaceKindsKey,
  marketplacePluginKey,
  marketplacePreviewKey,
  marketplaceSearchKey,
} from './keys';

describe('marketplace query keys', () => {
  it('keys a search set on its full filter params', () => {
    const params = { q: 'uuid', kind: 'tool' };
    expect(marketplaceSearchKey(params)).toEqual(['marketplace', 'search', params]);
  });

  it('keys a plugin detail on its ref', () => {
    expect(marketplacePluginKey('tai42/toolbox')).toEqual([
      'marketplace',
      'plugin',
      'tai42/toolbox',
    ]);
  });

  it('keys an install preview on its ref, version, and serialized mount map', () => {
    expect(marketplacePreviewKey('tai42/toolbox', '1.2.0', '{"web":"channels/web"}')).toEqual([
      'marketplace',
      'preview',
      'tai42/toolbox',
      '1.2.0',
      '{"web":"channels/web"}',
    ]);
    // A null target version is a distinct entry, never coalesced to a string.
    expect(marketplacePreviewKey('tai42/toolbox', null, '{}')).toEqual([
      'marketplace',
      'preview',
      'tai42/toolbox',
      null,
      '{}',
    ]);
  });

  it('exposes the singleton keys', () => {
    expect(marketplaceInstalledKey).toEqual(['marketplace', 'installed']);
    expect(marketplaceCategoriesKey).toEqual(['marketplace', 'categories']);
    expect(marketplaceKindsKey).toEqual(['marketplace', 'kinds']);
    expect(marketplaceAdvisoriesKey).toEqual(['marketplace', 'advisories']);
  });
});
