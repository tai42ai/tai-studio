/**
 * The installed-plugins view: a table of what the running app has installed from
 * the marketplace, each row linking to its detail, with an update / up-to-date /
 * not-in-registry status badge. Every boot-quarantined plugin renders as its own
 * loud error card (name + reason + remedy) above the table, and the "Upgrade
 * all" action moves every installed plugin to its newest compatible version,
 * rendering the per-plugin outcome readout. A loud advisories banner sits above
 * the table when any non-withdrawn advisory matches an installed plugin.
 * Per-plugin install / update / uninstall actions live on the detail view.
 */
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FeatureDisabled,
  ScrollRegion,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  errorMessage,
  isFeatureDisabled,
  useApi,
} from '@tai42/studio-sdk';
import type {
  MarketplaceAdvisory,
  MarketplaceInstalledPlugin,
  MarketplaceQuarantinedPlugin,
  MarketplaceUpgradeAllRow,
} from '@tai42/api-client';

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

/** One loud error card per boot-quarantined plugin: name, reason, remedy. */
function QuarantinedCard({ plugin }: { readonly plugin: MarketplaceQuarantinedPlugin }): ReactNode {
  return (
    <Card>
      <ErrorState
        message={`Plugin ${plugin.name} is quarantined and not loaded: ${plugin.reason}`}
      />
      <p style={{ margin: 'var(--tai-space-2) 0 0' }}>
        Run “Upgrade all” below to move to the newest compatible version, or uninstall the plugin.
      </p>
    </Card>
  );
}

/** Badge tint per upgrade-all outcome. */
const OUTCOME_VARIANT: Record<string, string> = {
  upgraded: 'success',
  'up-to-date': 'neutral',
  'no-compatible-version': 'warning',
  failed: 'danger',
};

/** The per-plugin readout of one completed upgrade-all run. */
function UpgradeAllReadout({
  results,
}: {
  readonly results: readonly MarketplaceUpgradeAllRow[];
}): ReactNode {
  return (
    <Card>
      <div className="tai-stack tai-stack-2">
        <strong>Upgrade results</strong>
        {results.length === 0 ? (
          <span>No installed plugins to upgrade.</span>
        ) : (
          results.map((row) => (
            <div key={row.ref} className="tai-row">
              <span className="tai-mono">{row.ref}</span>
              <Badge variant={OUTCOME_VARIANT[row.outcome]}>{row.outcome}</Badge>
              <span>{row.detail}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
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
      <strong className="tai-status-warn">
        {advisories.length} security{' '}
        {advisories.length === 1 ? 'advisory affects' : 'advisories affect'} installed plugins
      </strong>
      {advisories.map((advisory) => (
        <div key={advisory.id} className="tai-row">
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
  const queryClient = useQueryClient();
  const installedQuery = useQuery({
    queryKey: marketplaceInstalledKey,
    queryFn: ({ signal }) => api.listInstalledMarketplacePlugins(signal),
  });
  const advisoriesQuery = useQuery({
    queryKey: marketplaceAdvisoriesKey,
    queryFn: ({ signal }) => api.getMarketplaceAdvisories(signal),
  });
  const upgradeAllMutation = useMutation({
    mutationFn: () => api.upgradeAllMarketplacePlugins(),
    onSuccess: () => {
      // The app pip-upgraded plugins and reloaded: tools, agents, extensions,
      // the manifest — ANY server-derived cache — may now be stale. Invalidate
      // the whole cache rather than a hand-picked subset.
      void queryClient.invalidateQueries();
    },
  });

  if (installedQuery.isPending) {
    return (
      <div className="tai-stack tai-stack-2">
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

  // The marketplace install store is unconfigured: an "Upgrade all" answered with a
  // 501 `marketplace-not-configured`. Disable the write and show the muted OFF note
  // instead of a red error. The installed/advisories reads stay 200-empty untouched.
  const storeDisabled = isFeatureDisabled(upgradeAllMutation.error);

  const { installed, quarantined } = installedQuery.data;
  if (installed.length === 0 && quarantined.length === 0) {
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
    <div className="tai-stack">
      {quarantined.map((plugin) => (
        <QuarantinedCard key={plugin.name} plugin={plugin} />
      ))}

      {advisoriesQuery.isError ? (
        <ErrorState
          message={errorMessage(advisoriesQuery.error)}
          onRetry={() => void advisoriesQuery.refetch()}
        />
      ) : matchingAdvisories.length > 0 ? (
        <AdvisoriesBanner advisories={matchingAdvisories} search={search} />
      ) : null}

      <div className="tai-row">
        <Button
          onClick={() => {
            upgradeAllMutation.mutate();
          }}
          disabled={upgradeAllMutation.isPending || storeDisabled}
        >
          {upgradeAllMutation.isPending ? 'Upgrading…' : 'Upgrade all'}
        </Button>
      </div>

      {upgradeAllMutation.isError ? (
        storeDisabled ? (
          <FeatureDisabled feature="Marketplace installs" envVar="MARKETPLACE_STORE_PG_PASSWORD" />
        ) : (
          <ErrorState message={errorMessage(upgradeAllMutation.error)} />
        )
      ) : null}
      {upgradeAllMutation.data !== undefined ? (
        <UpgradeAllReadout results={upgradeAllMutation.data.results} />
      ) : null}

      {installed.length > 0 ? (
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
                        <span className="tai-mono">{row.ref}</span>
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
      ) : null}
    </div>
  );
}
