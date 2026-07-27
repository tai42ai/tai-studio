/**
 * The installed-plugins view: a table of what the running app has installed from
 * the marketplace, each row linking to its detail, with an update / up-to-date /
 * not-in-registry status badge. A loud advisories banner sits above the table
 * when any non-withdrawn advisory matches an installed plugin. Install / update /
 * uninstall actions live on the detail view only, so this tab is read-only.
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AppLink,
  Badge,
  Card,
  EmptyState,
  ErrorState,
  ScrollRegion,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { MarketplaceAdvisory, MarketplaceInstalledPlugin } from '@tai42/api-client';

import { severityVariant, WarningBlock } from './advisories';
import { mergeSearch, type MarketplaceSearch } from './filters';
import { marketplaceAdvisoriesKey, marketplaceInstalledKey } from './keys';

/** The advisory status badge for one installed row. */
function StatusBadge({ row }: { readonly row: MarketplaceInstalledPlugin }): ReactNode {
  if (row.missing_upstream) return <Badge>Not in the registry</Badge>;
  if (row.update_available && row.latest !== null) {
    return <Badge variant="warning">Update available: v{row.latest}</Badge>;
  }
  return <Badge variant="success">Up to date</Badge>;
}

function AdvisoriesBanner({
  advisories,
  search,
}: {
  readonly advisories: readonly MarketplaceAdvisory[];
  readonly search: MarketplaceSearch;
}): ReactNode {
  return (
    <WarningBlock>
      <strong>
        {advisories.length} security{' '}
        {advisories.length === 1 ? 'advisory affects' : 'advisories affect'} installed plugins
      </strong>
      {advisories.map((advisory) => (
        <div
          key={advisory.id}
          style={{
            display: 'flex',
            gap: 'var(--tai-space-2)',
            alignItems: 'baseline',
            flexWrap: 'wrap',
          }}
        >
          <Badge variant={severityVariant(advisory.severity)}>{advisory.severity}</Badge>
          <AppLink to="marketplace" search={mergeSearch(search, { plugin: advisory.listing })}>
            {advisory.listing}
          </AppLink>
          <span>{advisory.summary}</span>
        </div>
      ))}
    </WarningBlock>
  );
}

export function InstalledTab({ search }: { readonly search: MarketplaceSearch }): ReactNode {
  const api = useApi();
  const installedQuery = useQuery({
    queryKey: marketplaceInstalledKey,
    queryFn: ({ signal }) => api.listInstalledMarketplacePlugins(signal),
  });
  const advisoriesQuery = useQuery({
    queryKey: marketplaceAdvisoriesKey,
    queryFn: ({ signal }) => api.getMarketplaceAdvisories(signal),
  });

  if (installedQuery.isPending) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={32} />
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  }
  if (installedQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(installedQuery.error)}
        onRetry={() => void installedQuery.refetch()}
      />
    );
  }

  const installed = installedQuery.data;
  if (installed.length === 0) {
    return (
      <EmptyState
        title="No marketplace plugins installed"
        description="Browse the marketplace to find and install plugins."
      />
    );
  }

  const installedRefs = new Set(installed.map((row) => row.ref));
  const matchingAdvisories =
    advisoriesQuery.data !== undefined
      ? advisoriesQuery.data.advisories.filter(
          (advisory) => advisory.withdrawn_at === null && installedRefs.has(advisory.listing),
        )
      : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      {advisoriesQuery.isError ? (
        <ErrorState
          message={errorMessage(advisoriesQuery.error)}
          onRetry={() => void advisoriesQuery.refetch()}
        />
      ) : matchingAdvisories.length > 0 ? (
        <AdvisoriesBanner advisories={matchingAdvisories} search={search} />
      ) : null}

      <Card>
        <ScrollRegion label="Installed plugins">
          <Table>
            <THead>
              <TR>
                <TH>Plugin</TH>
                <TH>Installed version</TH>
                <TH>Source</TH>
                <TH>Installed at</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {installed.map((row) => (
                <TR key={row.ref}>
                  <TD>
                    <AppLink to="marketplace" search={mergeSearch(search, { plugin: row.ref })}>
                      {row.ref}
                    </AppLink>
                  </TD>
                  <TD>{row.version}</TD>
                  <TD>{row.source}</TD>
                  <TD>{row.installed_at}</TD>
                  <TD>
                    <StatusBadge row={row} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </ScrollRegion>
      </Card>
    </div>
  );
}
