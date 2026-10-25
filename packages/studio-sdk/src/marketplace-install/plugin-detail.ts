/** Pure readings of a marketplace plugin's detail that the install forms seed from. */
import type { MarketplaceDelivery, MarketplacePluginDetail } from '@tai42/api-client';

/**
 * How the listing's latest version is delivered, derived exactly the way the server
 * derives it — from whether the spec names a package. The registry's plugin-detail
 * body carries no `delivery` field (that is server-computed and rides the installed
 * rows and the install preview), so the detail is read off the listing's `package`:
 * `null` (a descriptor listing that names none) ⇒ `descriptor`, else `package`.
 */
export function deliveryOf(detail: MarketplacePluginDetail): MarketplaceDelivery {
  return detail.package === null ? 'descriptor' : 'package';
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

/** The detail's declared env folded into the secret band and per-var hint the forms seed from. */
export function requiredEnvFromDetail(detail: MarketplacePluginDetail): RequiredEnvHints {
  const requiredEnvSecret: Record<string, boolean> = {};
  const requiredEnvHints: Record<string, string> = {};
  for (const [envName, entry] of requiredEnvIndex(detail)) {
    requiredEnvSecret[envName] = entry.secret;
    requiredEnvHints[envName] = entry.items.join(', ');
  }
  return { requiredEnvSecret, requiredEnvHints };
}
