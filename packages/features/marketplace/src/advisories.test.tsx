/**
 * The shared advisory helpers: the severity → Badge-variant map, the listing
 * filter (matching ref, non-withdrawn), and the loud warning container.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { MarketplaceAdvisory } from '@tai42/api-client';

import { advisoriesForListing, severityVariant, WarningBlock } from './advisories';

function advisory(overrides: Partial<MarketplaceAdvisory>): MarketplaceAdvisory {
  return {
    id: 1,
    listing: 'tai42/toolbox',
    affected_versions: '<1.0.0',
    severity: 'high',
    summary: 'A summary.',
    created_at: '2026-07-01T00:00:00Z',
    withdrawn_at: null,
    ...overrides,
  };
}

describe('severityVariant', () => {
  it('maps critical and high to danger', () => {
    expect(severityVariant('critical')).toBe('danger');
    expect(severityVariant('high')).toBe('danger');
  });

  it('maps medium to warning', () => {
    expect(severityVariant('medium')).toBe('warning');
  });

  it('maps anything else to neutral', () => {
    expect(severityVariant('low')).toBe('neutral');
    expect(severityVariant('informational')).toBe('neutral');
  });
});

describe('advisoriesForListing', () => {
  it('keeps non-withdrawn advisories that match the ref', () => {
    const list = [
      advisory({ id: 1, listing: 'tai42/toolbox' }),
      advisory({ id: 2, listing: 'other/thing' }),
      advisory({ id: 3, listing: 'tai42/toolbox', withdrawn_at: '2026-07-05T00:00:00Z' }),
    ];
    const result = advisoriesForListing(list, 'tai42/toolbox');
    expect(result.map((a) => a.id)).toEqual([1]);
  });
});

describe('WarningBlock', () => {
  it('renders a role=alert container', () => {
    render(<WarningBlock>heads up</WarningBlock>);
    expect(screen.getByRole('alert')).toHaveTextContent('heads up');
  });
});
