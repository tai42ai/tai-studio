import type { MarketplaceRoutesDecl } from '@tai42/api-client';

/** A route-carrying item as the install form drives it: its name, kind, and declaration. */
export interface RouteItem {
  readonly name: string;
  readonly kind: string;
  readonly routes: MarketplaceRoutesDecl;
}

/** The route-carrying items of a published version, in declaration order. */
export function routeItemsOf(
  items: readonly { kind: string; name: string; routes?: MarketplaceRoutesDecl | null }[],
): RouteItem[] {
  const out: RouteItem[] = [];
  for (const item of items) {
    if (item.routes === null || item.routes === undefined) continue;
    out.push({ name: item.name, kind: item.kind, routes: item.routes });
  }
  return out;
}
