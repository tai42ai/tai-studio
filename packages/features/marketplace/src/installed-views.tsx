/**
 * The Installed tab's plugins in the two shared entity-screen layouts: a table, one
 * row per installed plugin, or a card grid on the SDK's `EntityCardGrid`. Either
 * way an entry shows the plugin reference (its link to the detail view), the
 * installed version, where it came from, how it was delivered, when it was
 * installed, and its update status; the whole entry opens the detail through the
 * house whole-target pattern, and the reference link stays the keyboard path.
 */
import type { MarketplaceInstalledPlugin } from '@tai42/api-client';
import {
  AppLink,
  Badge,
  Card,
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

import { sourceLabel } from './badges';
import { type MarketplaceSearch, mergeSearch } from './filters';

/** The Installed tab's persisted view-mode key. */
export const INSTALLED_VIEW_SURFACE = 'marketplace-installed';

/** The accessible name both layouts give the installed set. */
const INSTALLED_LABEL = 'Installed plugins';

/** The update status badge for one installed plugin. */
function StatusBadge({ row }: { readonly row: MarketplaceInstalledPlugin }): ReactNode {
  if (row.missing_upstream) return <Badge>Not in the registry</Badge>;
  if (row.update_available && row.latest !== null) {
    return <Badge variant="warning">Update available: v{row.latest}</Badge>;
  }
  return <Badge variant="success">Up to date</Badge>;
}

/** The whole-entry open props and the link target for one installed plugin. */
function useDetailTarget(
  row: MarketplaceInstalledPlugin,
  search: MarketplaceSearch,
): { readonly detailSearch: MarketplaceSearch; readonly open: () => void } {
  const navigate = useAppNavigate();
  const detailSearch = mergeSearch(search, { plugin: row.ref });
  return {
    detailSearch,
    open: () => {
      navigate('marketplace', detailSearch);
    },
  };
}

function InstalledRow({
  row,
  search,
}: {
  readonly row: MarketplaceInstalledPlugin;
  readonly search: MarketplaceSearch;
}): ReactNode {
  const { detailSearch, open } = useDetailTarget(row, search);
  return (
    <TR {...openTargetProps({ onOpen: open })}>
      <TD>
        <AppLink to="marketplace" search={detailSearch}>
          <span className="tai-mono">{row.ref}</span>
        </AppLink>
      </TD>
      <TD>{row.version}</TD>
      {/* `spec` (a descriptor plugin) reads as "descriptor". */}
      <TD>{sourceLabel(row.source)}</TD>
      {/* How it was delivered: a pip `package`, or a `descriptor` whose spec names
          no package. */}
      <TD>{row.delivery}</TD>
      <TD>{row.installed_at}</TD>
      <TD>
        <StatusBadge row={row} />
      </TD>
    </TR>
  );
}

function InstalledCard({
  row,
  search,
}: {
  readonly row: MarketplaceInstalledPlugin;
  readonly search: MarketplaceSearch;
}): ReactNode {
  const { detailSearch, open } = useDetailTarget(row, search);
  return (
    <div role="listitem" {...openTargetProps({ onOpen: open })}>
      <Card interactive>
        <div className="tai-stack tai-stack-2">
          <AppLink to="marketplace" search={detailSearch}>
            <strong className="tai-mono">{row.ref}</strong>
          </AppLink>
          <div className="tai-row">
            <Badge>v{row.version}</Badge>
            <Badge>{sourceLabel(row.source)}</Badge>
            <Badge>{row.delivery}</Badge>
          </div>
          <span className="tai-muted">Installed {row.installed_at}</span>
          <div>
            <StatusBadge row={row} />
          </div>
        </div>
      </Card>
    </div>
  );
}

export function InstalledPlugins({
  installed,
  search,
  mode,
}: {
  readonly installed: readonly MarketplaceInstalledPlugin[];
  readonly search: MarketplaceSearch;
  readonly mode: ViewMode;
}): ReactNode {
  if (mode === 'cards') {
    return (
      <EntityCardGrid aria-label={INSTALLED_LABEL}>
        {installed.map((row) => (
          <InstalledCard key={row.ref} row={row} search={search} />
        ))}
      </EntityCardGrid>
    );
  }
  return (
    <Card>
      <ScrollRegion label={INSTALLED_LABEL}>
        <Table>
          <THead>
            <TR>
              <TH>Plugin</TH>
              <TH>Installed version</TH>
              <TH>Source</TH>
              <TH>Delivery</TH>
              <TH>Installed at</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {installed.map((row) => (
              <InstalledRow key={row.ref} row={row} search={search} />
            ))}
          </TBody>
        </Table>
      </ScrollRegion>
    </Card>
  );
}
