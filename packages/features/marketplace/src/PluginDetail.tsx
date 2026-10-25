/**
 * A marketplace plugin's detail view, reached by drilling in on a `namespace/name`
 * ref: the listing info (readme, license, links, categories, tags), its contained
 * items, its version history, the advisories that currently apply, and the
 * install / update / uninstall actions. The detail query gates the page; the
 * installed and advisory queries never blank it — their failures surface as loud
 * inline strips in their own sections.
 */
import {
  Card,
  CopyField,
  errorMessage,
  ErrorState,
  routeItemsOf,
  Skeleton,
  Stack,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { AdvisoriesStrip } from './advisories';
import { ActionsCard } from './plugin-detail-actions';
import {
  ActionResultCard,
  BackButton,
  InfoCard,
  ItemsCard,
  RoutesCard,
  VersionsCard,
} from './plugin-detail-cards';
import { PluginDetailDialogs } from './plugin-detail-dialogs';
import { usePluginDetail } from './use-plugin-detail';

export function PluginDetail({
  refValue,
  onBack,
}: {
  readonly refValue: string;
  readonly onBack: () => void;
}): ReactNode {
  const detail = usePluginDetail(refValue);
  const { detailQuery, installedQuery, advisoriesQuery } = detail;

  if (detail.slash < 0) {
    return (
      <Stack>
        <BackButton onBack={onBack} />
        <ErrorState
          message={`Malformed plugin reference "${refValue}" (expected "namespace/name").`}
        />
      </Stack>
    );
  }
  if (detailQuery.isPending) {
    return (
      <Stack>
        <BackButton onBack={onBack} />
        <Skeleton height={48} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </Stack>
    );
  }
  if (detailQuery.isError) {
    return (
      <Stack>
        <BackButton onBack={onBack} />
        <ErrorState
          message={errorMessage(detailQuery.error)}
          onRetry={() => void detailQuery.refetch()}
        />
      </Stack>
    );
  }

  const plugin = detailQuery.data;
  // The route-carrying items of the latest version — a channel or router that
  // declares HTTP routes. When present, an update runs through the mount dialog.
  const routeItems = routeItemsOf(plugin.latest?.items ?? []);
  const version = plugin.latest?.version ?? null;
  // The stored `{item_name: base}` mounts of this plugin's installed row (absent until
  // the installed query lands, or when not installed): the routes card renders at the
  // ACTUAL base and the update dialog seeds from the CURRENT mount.
  const installedMounts = installedQuery.data?.installed.find(
    (row) => row.ref === refValue,
  )?.route_mounts;

  return (
    <Stack>
      <div className="tai-row">
        <BackButton onBack={onBack} />
        <h1 className="tai-page-title" style={{ wordBreak: 'break-word' }}>
          {refValue}
        </h1>
      </div>

      <InfoCard detail={plugin} />

      <ActionsCard
        detail={plugin}
        installedQuery={installedQuery}
        storeRefusalMessage={detail.storeRefusalMessage}
        onOpen={detail.openAction}
      />

      {/* A descriptor listing names no package, so there is nothing to copy. */}
      {plugin.package !== null ? (
        <Card>
          <CopyField label="Package" value={plugin.package} idPrefix="install-package" />
        </Card>
      ) : null}

      {detail.result !== null ? <ActionResultCard result={detail.result} /> : null}

      <AdvisoriesStrip
        isError={advisoriesQuery.isError}
        error={advisoriesQuery.error}
        onRetry={() => void advisoriesQuery.refetch()}
        advisories={advisoriesQuery.data?.advisories}
        refValue={refValue}
      />

      <ItemsCard detail={plugin} />
      <RoutesCard routeItems={routeItems} mounts={installedMounts} />
      <VersionsCard versions={plugin.versions} />

      <PluginDetailDialogs
        activeAction={detail.activeAction}
        refValue={refValue}
        detail={plugin}
        routeItems={routeItems}
        version={version}
        installedMounts={installedMounts}
        callbacks={detail.actions}
        uninstallMutation={detail.actions.uninstallMutation}
        onClose={detail.closeAction}
      />
    </Stack>
  );
}
