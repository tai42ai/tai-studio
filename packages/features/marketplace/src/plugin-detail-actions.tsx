import {
  apiRoutes,
  type MarketplaceInstalled,
  type MarketplacePluginDetail,
} from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  errorMessage,
  ErrorState,
  FeatureDisabled,
  INSTALL_NO_GRANT,
  Skeleton,
  useCanWrite,
} from '@tai42/studio-sdk';
import type { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import type { ActiveAction } from './plugin-detail-data';

export const UPDATE_NO_GRANT =
  'This session cannot update this plugin. Updating needs administrator access to POST /api/marketplace/update; ask an administrator to update it.';
export const UNINSTALL_NO_GRANT =
  'This session cannot uninstall this plugin. Uninstalling needs administrator access to POST /api/marketplace/uninstall; ask an administrator to uninstall it.';

/** The muted line that stands in for a control this session's grant does not admit. */
function NoGrantLine({ children }: { readonly children: string }): ReactNode {
  return (
    <p role="status" className="tai-status" style={{ margin: 0 }}>
      {children}
    </p>
  );
}

/** The no-grant lines, then the store refusal when any button is drawn. */
function ActionNotes({
  noGrant,
  anyButton,
  storeRefusalMessage,
}: {
  readonly noGrant: readonly string[];
  readonly anyButton: boolean;
  readonly storeRefusalMessage: string | null;
}): ReactNode {
  return (
    <>
      {noGrant.map((line) => (
        <NoGrantLine key={line}>{line}</NoGrantLine>
      ))}
      {storeRefusalMessage !== null && anyButton ? (
        <FeatureDisabled feature="Marketplace installs" message={storeRefusalMessage} />
      ) : null}
    </>
  );
}

/** A plugin that is not installed: the Install button, or its no-grant line. */
function InstallActions({
  storeRefusalMessage,
  onOpen,
}: {
  readonly storeRefusalMessage: string | null;
  readonly onOpen: (action: ActiveAction) => void;
}): ReactNode {
  const canInstall = useCanWrite(apiRoutes.post_api_marketplace_install.path);
  return (
    <Card>
      <div className="tai-row">
        {canInstall ? (
          <Button
            variant="primary"
            disabled={storeRefusalMessage !== null}
            onClick={() => {
              onOpen('install');
            }}
          >
            Install
          </Button>
        ) : null}
      </div>
      <ActionNotes
        noGrant={canInstall ? [] : [INSTALL_NO_GRANT]}
        anyButton={canInstall}
        storeRefusalMessage={storeRefusalMessage}
      />
    </Card>
  );
}

/** An installed plugin: its version and update badges, Update and Uninstall. */
function InstalledActions({
  installed,
  storeRefusalMessage,
  onOpen,
}: {
  readonly installed: MarketplaceInstalled['installed'][number];
  readonly storeRefusalMessage: string | null;
  readonly onOpen: (action: ActiveAction) => void;
}): ReactNode {
  const canUpdate = useCanWrite(apiRoutes.post_api_marketplace_update.path);
  const canUninstall = useCanWrite(apiRoutes.post_api_marketplace_uninstall.path);
  const updateOffered =
    !installed.missing_upstream && installed.update_available && installed.latest !== null;
  const noGrant: string[] = [];
  if (updateOffered && !canUpdate) noGrant.push(UPDATE_NO_GRANT);
  if (!canUninstall) noGrant.push(UNINSTALL_NO_GRANT);

  return (
    <Card>
      <div className="tai-row">
        <Badge variant="success">Installed v{installed.version}</Badge>
        {installed.missing_upstream ? (
          <Badge>Not in the registry</Badge>
        ) : updateOffered ? (
          <>
            <Badge variant="warning">Update available: v{installed.latest}</Badge>
            {canUpdate ? (
              <Button
                variant="primary"
                disabled={storeRefusalMessage !== null}
                onClick={() => {
                  onOpen('update');
                }}
              >
                Update
              </Button>
            ) : null}
          </>
        ) : null}
        {canUninstall ? (
          <Button
            variant="danger"
            onClick={() => {
              onOpen('uninstall');
            }}
          >
            Uninstall
          </Button>
        ) : null}
      </div>
      <ActionNotes
        noGrant={noGrant}
        anyButton={(updateOffered && canUpdate) || canUninstall}
        storeRefusalMessage={storeRefusalMessage}
      />
    </Card>
  );
}

/**
 * The install-state badges + action buttons, from the installed query. Each button is
 * gated on its own route; a button the session cannot use is not drawn and its
 * no-grant line stands in its place.
 */
export function ActionsCard({
  detail,
  installedQuery,
  storeRefusalMessage,
  onOpen,
}: {
  readonly detail: MarketplacePluginDetail;
  readonly installedQuery: ReturnType<typeof useQuery<MarketplaceInstalled, Error>>;
  readonly storeRefusalMessage: string | null;
  readonly onOpen: (action: ActiveAction) => void;
}): ReactNode {
  if (installedQuery.isPending) {
    return (
      <Card>
        <Skeleton height={32} />
      </Card>
    );
  }
  if (installedQuery.isError) {
    return (
      <Card>
        <ErrorState
          message={errorMessage(installedQuery.error)}
          onRetry={() => void installedQuery.refetch()}
        />
      </Card>
    );
  }

  const ref = `${detail.namespace}/${detail.name}`;
  const installed = installedQuery.data.installed.find((row) => row.ref === ref);
  return installed === undefined ? (
    <InstallActions storeRefusalMessage={storeRefusalMessage} onOpen={onOpen} />
  ) : (
    <InstalledActions
      installed={installed}
      storeRefusalMessage={storeRefusalMessage}
      onOpen={onOpen}
    />
  );
}
