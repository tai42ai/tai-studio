/**
 * Advisory rendering shared by the plugin detail and the installed tab: the
 * severity → Badge-variant map, the loud warning container (`role="alert"`,
 * warning tokens), and the filter that selects the advisories that currently
 * apply to a listing ref (non-withdrawn, matching `listing`).
 */
import type { CSSProperties, ReactNode } from 'react';
import type { MarketplaceAdvisory } from '@tai42/api-client';

/** Map an advisory severity to a Badge variant; unknown severities read neutral. */
export function severityVariant(severity: string): string {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  return 'neutral';
}

/** The advisories that currently apply to a listing: matching ref, not withdrawn. */
export function advisoriesForListing(
  advisories: readonly MarketplaceAdvisory[],
  ref: string,
): MarketplaceAdvisory[] {
  return advisories.filter(
    (advisory) => advisory.listing === ref && advisory.withdrawn_at === null,
  );
}

const warningBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
  padding: 'var(--tai-space-4)',
  borderRadius: 'var(--tai-radius-md)',
  border: '1px solid var(--tai-color-warning)',
  color: 'var(--tai-color-warning)',
  background: 'color-mix(in srgb, var(--tai-color-warning) 18%, transparent)',
};

/** A loud `role="alert"` warning container styled with the warning tokens. */
export function WarningBlock({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div role="alert" style={warningBlockStyle}>
      {children}
    </div>
  );
}
