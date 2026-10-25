/** The plugin detail's action state and its pure version-status tiers. */
import type { MarketplaceInstallResult, MarketplaceUninstallResult } from '@tai42/api-client';
import type { UseMutationResult } from '@tanstack/react-query';

/** Which mutation dialog is open (each is mounted only while active). */
export type ActiveAction = 'install' | 'update' | 'uninstall';

/** The uninstall mutation: no variables (the ref is closed over). */
export type UninstallMutation = UseMutationResult<MarketplaceUninstallResult, Error, void>;

/** The last completed action's receipt, rendered as an inline success line. */
export interface ActionResult {
  readonly verb: string;
  readonly ref: string;
  readonly version: string | null;
  readonly notes: readonly string[];
  readonly advisories: MarketplaceInstallResult['advisories'];
  // The routes the install/update mounted — what was opened where. Empty for an
  // uninstall and for a plugin that registers none.
  readonly routes: MarketplaceInstallResult['routes'];
  // The config reload the action ran; `null` for an uninstall that removed no
  // manifest entry.
  readonly reload: MarketplaceInstallResult['reload'] | null;
}

/**
 * Map a version's lifecycle status to a badge tier: published is a success,
 * scan_failed / killed are terminal failures (danger), and pending / validating
 * are in-progress states (warning, not a failure). Any unknown status falls back
 * to neutral.
 */
export function versionStatusVariant(status: string): string {
  switch (status) {
    case 'published':
      return 'success';
    case 'scan_failed':
    case 'killed':
      return 'danger';
    case 'pending':
    case 'validating':
      return 'warning';
    default:
      return 'neutral';
  }
}
