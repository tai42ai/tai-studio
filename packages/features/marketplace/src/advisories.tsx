/**
 * Advisory rendering shared by the plugin detail and the installed tab: the
 * severity → Badge-variant map, the loud warning container (`role="alert"`,
 * warning tokens), and the filter that selects the advisories that currently
 * apply to a listing ref (non-withdrawn, matching `listing`).
 */
import type { ReactNode } from 'react';
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

/**
 * A loud `role="alert"` warning container. `.tai-warn-state` is the design system's
 * published warn surface — one padding, one tint, one border — so the advisory block
 * carries the same weight as every other degraded state instead of a formula of its
 * own. Its body sits at the text tone; the caller's headline carries the warn hue.
 */
export function WarningBlock({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div role="alert" className="tai-warn-state tai-stack tai-stack-3">
      {children}
    </div>
  );
}
