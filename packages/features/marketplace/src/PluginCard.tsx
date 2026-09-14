import type { MouseEvent, ReactNode } from 'react';

import { AppLink, Badge, Card, useAppNavigate } from '@tai42/studio-sdk';
import type { MarketplaceSearchRow } from '@tai42/api-client';

import { listingBadges } from './badges';
import { ListingIcon, listingTitle } from './display';
import { mergeSearch, type MarketplaceSearch } from './filters';

/**
 * An ISO-8601 `updated_at` rendered as a plain date for the card's recency line.
 * An unparseable value is shown verbatim rather than swallowed.
 */
function formatUpdatedAt(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

/**
 * One listing card: name, reference, description, badges, downloads, and a
 * content-summary badge row. The badges are the catalog policy over the row's
 * groups and ungrouped kinds — see `listingBadges`.
 */
export function PluginCard({
  row,
  search,
}: {
  readonly row: MarketplaceSearchRow;
  readonly search: MarketplaceSearch;
}): ReactNode {
  const navigate = useAppNavigate();
  const title = listingTitle(row.display_name, row.name);
  const detailSearch = mergeSearch(search, { plugin: row.ref });
  const badges = listingBadges(row);
  // The whole card opens the plugin detail — the same destination the title link
  // opens — so the lift `Card interactive` promises is honoured across the icon,
  // description, badges, and download line, not just the title. This mirrors the
  // house whole-target precedent (studio-sdk ExplorerView's `openProps`), down to
  // spreading the pointer-open props onto the container: the handler YIELDS to any
  // nested interactive element the click landed on (the title link, a future
  // button/menu) so it never double-navigates, and to an active text selection so
  // a press-drag that selects text is not read as an open intent. Keyboard access
  // stays on the nested title `AppLink` (a real anchor), exactly as the precedent
  // leaves it on the item's name link.
  const openProps: {
    onClick: (event: MouseEvent<HTMLDivElement>) => void;
    style: { cursor: 'pointer' };
  } = {
    onClick: (event) => {
      if (window.getSelection()?.isCollapsed === false) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('button, a, [role="menu"], [role="menuitem"]') !== null
      ) {
        return;
      }
      navigate('marketplace', detailSearch);
    },
    style: { cursor: 'pointer' },
  };
  return (
    <div {...openProps}>
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
              {row.premium === true ? <Badge variant="primary">Premium</Badge> : null}
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
    </div>
  );
}
