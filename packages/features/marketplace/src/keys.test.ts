/**
 * The query-key factory pins the exact tuples the queries and the post-mutation
 * invalidations share, so a drift between a producer and a consumer is a test
 * failure rather than a silent cache miss.
 */
import { describe, expect, it } from 'vitest';

import {
  marketplaceAdvisoriesKey,
  marketplaceCategoriesKey,
  marketplaceKindsKey,
  marketplaceSearchKey,
} from './keys';

describe('marketplace query keys', () => {
  it('keys a search set on its full filter params', () => {
    const params = { q: 'uuid', kind: 'tool' };
    expect(marketplaceSearchKey(params)).toEqual(['marketplace', 'search', params]);
  });

  it('exposes the singleton keys', () => {
    expect(marketplaceCategoriesKey).toEqual(['marketplace', 'categories']);
    expect(marketplaceKindsKey).toEqual(['marketplace', 'kinds']);
    expect(marketplaceAdvisoriesKey).toEqual(['marketplace', 'advisories']);
  });
});
