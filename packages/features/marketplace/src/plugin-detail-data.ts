/** Pure derivations for the plugin detail: delivery, version-status tiers, and the
 * env picture a listing's items declare. */
import type {
  MarketplaceDelivery,
  MarketplaceInstallBody,
  MarketplaceInstallResult,
  MarketplacePluginDetail,
  MarketplaceUninstallResult,
} from '@tai42/api-client';
import type { UseMutationResult } from '@tanstack/react-query';

/** Which mutation dialog is open (each is mounted only while active). */
export type ActiveAction = 'install' | 'update' | 'uninstall';

/** The install/update mutation: the ref is supplied by the mutation, the body is the rest. */
export type InstallMutation = UseMutationResult<
  MarketplaceInstallResult,
  Error,
  Omit<MarketplaceInstallBody, 'ref'>
>;

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
}

/**
 * How the listing's latest version is delivered, derived exactly the way the server
 * derives it — from whether the spec names a package. The registry's plugin-detail
 * body carries no `delivery` field (that is server-computed and rides the installed
 * rows and the install preview), so the detail surface reads it off the listing's
 * `package`: `null` (a descriptor listing that names none) ⇒ `descriptor`, else
 * `package`.
 */
export function deliveryOf(detail: MarketplacePluginDetail): MarketplaceDelivery {
  return detail.package === null ? 'descriptor' : 'package';
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

/**
 * The env picture a listing's items declare, folded across the detail: each
 * required var's derived `secret`-ness and the item(s) that need it. This is a
 * SUPPLEMENTARY fallback only — the registry's plugin-detail body carries no per-item
 * required_env, so in production this is empty; the install PREVIEW is the authority.
 */
interface RequiredEnvEntry {
  readonly secret: boolean;
  readonly items: string[];
}

function requiredEnvIndex(detail: MarketplacePluginDetail): Map<string, RequiredEnvEntry> {
  const index = new Map<string, RequiredEnvEntry>();
  for (const item of detail.latest?.items ?? []) {
    // The registry omits per-item required_env (undefined); only a fixture/preview
    // that declares it drives these pre-dialog hints.
    for (const req of item.required_env ?? []) {
      const entry = index.get(req.name);
      if (entry === undefined) {
        index.set(req.name, { secret: req.secret, items: [item.name] });
      } else {
        index.set(req.name, {
          secret: entry.secret || req.secret,
          items: [...entry.items, item.name],
        });
      }
    }
  }
  return index;
}

export interface RequiredEnvHints {
  readonly requiredEnvSecret: Record<string, boolean>;
  readonly requiredEnvHints: Record<string, string>;
}

/** The detail's declared env folded into the secret band and per-var hint the dialogs seed from. */
export function requiredEnvFromDetail(detail: MarketplacePluginDetail): RequiredEnvHints {
  const requiredEnvSecret: Record<string, boolean> = {};
  const requiredEnvHints: Record<string, string> = {};
  for (const [envName, entry] of requiredEnvIndex(detail)) {
    requiredEnvSecret[envName] = entry.secret;
    requiredEnvHints[envName] = entry.items.join(', ');
  }
  return { requiredEnvSecret, requiredEnvHints };
}
