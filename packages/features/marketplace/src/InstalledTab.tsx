/**
 * The installed-plugins view: what the running app has installed from the
 * marketplace, as a table or a card grid by the shared list/card switch (the
 * choice persists), each entry opening its detail and carrying an update /
 * up-to-date / not-in-registry status badge. The "Upgrade all" action moves every
 * installed plugin to its newest compatible version, rendering the per-plugin
 * outcome readout. A loud advisories banner sits above the list when any
 * non-withdrawn advisory matches an installed plugin.
 * Per-plugin install / update / uninstall actions live on the detail view.
 */
import {
  apiRoutes,
  type MarketplaceAdvisory,
  type MarketplaceUpgradeAllRow,
} from '@tai42/api-client';
import {
  AppLink,
  Badge,
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  FeatureDisabled,
  featureDisabledMessage,
  installedMarketplacePluginsKey,
  isFeatureDisabled,
  Skeleton,
  useApi,
  useCanWrite,
  useViewMode,
  ViewToggle,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { severityVariant, WarningBlock } from './advisories';
import { type MarketplaceSearch, mergeSearch } from './filters';
import { INSTALLED_VIEW_SURFACE, InstalledPlugins } from './installed-views';
import { marketplaceAdvisoriesKey } from './keys';

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

const UPGRADE_ALL_NO_GRANT =
  'This session cannot upgrade plugins. Upgrading all needs administrator access to POST /api/marketplace/upgrade-all; ask an administrator to upgrade them.';

export function InstalledTab({ search }: { readonly search: MarketplaceSearch }): ReactNode {
  const api = useApi();
  const canUpgradeAll = useCanWrite(apiRoutes.post_api_marketplace_upgrade_all.path);
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useViewMode(INSTALLED_VIEW_SURFACE);
  const installedQuery = useQuery({
    queryKey: installedMarketplacePluginsKey,
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

  const { installed } = installedQuery.data;
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
    <div className="tai-stack">
      {advisoriesQuery.isError ? (
        <ErrorState
          message={errorMessage(advisoriesQuery.error)}
          onRetry={() => void advisoriesQuery.refetch()}
        />
      ) : matchingAdvisories.length > 0 ? (
        <AdvisoriesBanner advisories={matchingAdvisories} search={search} />
      ) : null}

      <div className="tai-row">
        {canUpgradeAll ? (
          <Button
            onClick={() => {
              upgradeAllMutation.mutate();
            }}
            disabled={upgradeAllMutation.isPending || storeDisabled}
          >
            {upgradeAllMutation.isPending ? 'Upgrading…' : 'Upgrade all'}
          </Button>
        ) : (
          <p role="status" className="tai-status" style={{ margin: 0 }}>
            {UPGRADE_ALL_NO_GRANT}
          </p>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <ViewToggle
            value={viewMode}
            onValueChange={setViewMode}
            aria-label="Installed plugins view"
          />
        </div>
      </div>

      {upgradeAllMutation.isError ? (
        storeDisabled ? (
          <FeatureDisabled
            feature="Marketplace installs"
            message={featureDisabledMessage(upgradeAllMutation.error)}
          />
        ) : (
          <ErrorState message={errorMessage(upgradeAllMutation.error)} />
        )
      ) : null}
      {upgradeAllMutation.data !== undefined ? (
        <UpgradeAllReadout results={upgradeAllMutation.data.results} />
      ) : null}

      <InstalledPlugins installed={installed} search={search} mode={viewMode} />
    </div>
  );
}
