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
  marketplacePluginKey,
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

  it('exposes the singleton keys', () => {
    expect(marketplaceInstalledKey).toEqual(['marketplace', 'installed']);
    expect(marketplaceCategoriesKey).toEqual(['marketplace', 'categories']);
    expect(marketplaceAdvisoriesKey).toEqual(['marketplace', 'advisories']);
  });
});
