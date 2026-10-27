/**
 * The Browse tab's result set in the two shared entity-screen layouts: a card grid
 * (one {@link PluginCard} per listing on the SDK's `EntityCardGrid`) or a table, one
 * row per listing. Either way the whole entry opens the plugin detail through the
 * house whole-target pattern, and the name link stays the keyboard path. The rows
 * are the server-paged listings already loaded, so the view never re-filters or
 * re-pages them.
 */
import type { MarketplaceSearchRow } from '@tai42/api-client';
import {
  AppLink,
  Badge,
  EntityCardGrid,
  openTargetProps,
  ScrollRegion,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useAppNavigate,
  type ViewMode,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { formatUpdatedAt, listingTitle } from './display';
import { type MarketplaceSearch, mergeSearch } from './filters';
import { PluginCard } from './PluginCard';

/** The Browse tab's persisted view-mode key. */
export const BROWSE_VIEW_SURFACE = 'marketplace-browse';

/** The accessible name both layouts give the result set. */
const RESULTS_LABEL = 'Plugins';

/** One listing row of the table layout. */
function ListingRow({
  row,
  search,
}: {
  readonly row: MarketplaceSearchRow;
  readonly search: MarketplaceSearch;
}): ReactNode {
  const navigate = useAppNavigate();
  const detailSearch = mergeSearch(search, { plugin: row.ref });
  return (
    <TR
      {...openTargetProps({
        onOpen: () => {
          navigate('marketplace', detailSearch);
        },
      })}
    >
      <TD>
        <div className="tai-stack tai-stack-1">
          <AppLink to="marketplace" search={detailSearch}>
            <strong>{listingTitle(row.display_name, row.name)}</strong>
          </AppLink>
          <code className="tai-mono tai-muted">{row.ref}</code>
        </div>
      </TD>
      <TD>{row.description}</TD>
      <TD>
        <div className="tai-row">
          <Badge>{row.trust_tier}</Badge>
          <Badge>{row.pricing}</Badge>
          {row.premium ? <Badge variant="primary">Premium</Badge> : null}
        </div>
      </TD>
      <TD>{row.latest_version ?? '—'}</TD>
      <TD numeric>{row.downloads}</TD>
      <TD>{formatUpdatedAt(row.updated_at)}</TD>
    </TR>
  );
}

/** One listing card of the grid layout. */
function ListingCardEntry({
  row,
  search,
}: {
  readonly row: MarketplaceSearchRow;
  readonly search: MarketplaceSearch;
}): ReactNode {
  const navigate = useAppNavigate();
  return (
    <div
      role="listitem"
      {...openTargetProps({
        onOpen: () => {
          navigate('marketplace', mergeSearch(search, { plugin: row.ref }));
        },
      })}
    >
      <PluginCard row={row} search={search} />
    </div>
  );
}

export function ListingResults({
  rows,
  search,
  mode,
}: {
  readonly rows: readonly MarketplaceSearchRow[];
  readonly search: MarketplaceSearch;
  readonly mode: ViewMode;
}): ReactNode {
  if (mode === 'cards') {
    return (
      <EntityCardGrid aria-label={RESULTS_LABEL}>
        {rows.map((row) => (
          <ListingCardEntry key={row.ref} row={row} search={search} />
        ))}
      </EntityCardGrid>
    );
  }
  return (
    <ScrollRegion label={RESULTS_LABEL}>
      <Table>
        <THead>
          <TR>
            <TH>Plugin</TH>
            <TH>Description</TH>
            <TH>Tier</TH>
            <TH>Latest version</TH>
            <TH numeric>Downloads</TH>
            <TH>Updated</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((row) => (
            <ListingRow key={row.ref} row={row} search={search} />
          ))}
        </TBody>
      </Table>
    </ScrollRegion>
  );
}
