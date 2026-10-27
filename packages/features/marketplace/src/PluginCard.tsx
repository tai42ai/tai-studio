import type { MarketplaceSearchRow } from '@tai42/api-client';
import { AppLink, Badge, Card } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { listingBadges } from './badges';
import { formatUpdatedAt, ListingIcon, listingTitle } from './display';
import { type MarketplaceSearch, mergeSearch } from './filters';

/**
 * One listing card: name, reference, description, badges, downloads, and a
 * content-summary badge row. The badges are the catalog policy over the row's
 * groups and ungrouped kinds — see `listingBadges`. The card is `interactive`: the
 * grid entry it sits in opens the plugin detail on a click anywhere on it, and the
 * title link is the keyboard path to the same detail.
 */
export function PluginCard({
  row,
  search,
}: {
  readonly row: MarketplaceSearchRow;
  readonly search: MarketplaceSearch;
}): ReactNode {
  const title = listingTitle(row.display_name, row.name);
  const detailSearch = mergeSearch(search, { plugin: row.ref });
  const badges = listingBadges(row);
  return (
    <Card interactive>
      <div style={{ display: 'flex', gap: 'var(--tai-space-3)', alignItems: 'flex-start' }}>
        <ListingIcon iconUrl={row.icon_url} title={title} />
        <div className="tai-stack tai-stack-2" style={{ minWidth: 0, flex: '1 1 auto' }}>
          {/* Content order: the name, the machine reference in mono, the human
              description, the tier/price badges, then the download count. */}
          <AppLink to="marketplace" search={detailSearch}>
            <strong>{title}</strong>
          </AppLink>
          <code className="tai-mono tai-muted">{row.ref}</code>
          <p style={{ margin: 0 }}>{row.description}</p>
          <div className="tai-row">
            <Badge>{row.trust_tier}</Badge>
            <Badge>{row.pricing}</Badge>
            {/* A display-only premium mark — a badge, never a payment surface. */}
            {row.premium ? <Badge variant="primary">Premium</Badge> : null}
            {/* The latest published version, when the listing has one. It is nullable
                defensively though the search relation only emits published listings. */}
            {row.latest_version !== null ? <Badge>{row.latest_version}</Badge> : null}
          </div>
          {/* Downloads and recency on one muted line — the "Recently updated" sort
              orders by exactly this timestamp, so it must be visible on the card. */}
          <span className="tai-muted">
            {row.downloads} downloads · Updated {formatUpdatedAt(row.updated_at)}
          </span>
          {badges.length > 0 ? (
            <div role="group" aria-label="Capabilities" className="tai-row">
              {badges.map((label, index) => (
                <Badge key={`${String(index)}-${label}`}>{label}</Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
