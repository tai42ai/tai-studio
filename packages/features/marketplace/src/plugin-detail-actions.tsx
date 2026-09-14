import type { ReactNode } from 'react';
import type { useQuery } from '@tanstack/react-query';

import {
  Badge,
  Button,
  Card,
  ErrorState,
  FeatureDisabled,
  Skeleton,
  errorMessage,
} from '@tai42/studio-sdk';
import type { MarketplaceInstalled, MarketplacePluginDetail } from '@tai42/api-client';

import type { ActiveAction } from './plugin-detail-data';

/** The install-state badges + action buttons, from the installed query. */
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
  const storeDisabled = storeRefusalMessage !== null;
  const ref = `${detail.namespace}/${detail.name}`;

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

  const installed = installedQuery.data.installed.find((row) => row.ref === ref);

  return (
    <Card>
      <div className="tai-row">
        {installed === undefined ? (
          <Button
            variant="primary"
            disabled={storeDisabled}
            onClick={() => {
              onOpen('install');
            }}
          >
            Install
          </Button>
        ) : (
          <>
            <Badge variant="success">Installed v{installed.version}</Badge>
            {installed.missing_upstream ? (
              <Badge>Not in the registry</Badge>
            ) : installed.update_available && installed.latest !== null ? (
              <>
                <Badge variant="warning">Update available: v{installed.latest}</Badge>
                <Button
                  variant="primary"
                  disabled={storeDisabled}
                  onClick={() => {
                    onOpen('update');
                  }}
                >
                  Update
                </Button>
              </>
            ) : null}
            <Button
              variant="danger"
              onClick={() => {
                onOpen('uninstall');
              }}
            >
              Uninstall
            </Button>
          </>
        )}
      </div>
      {storeRefusalMessage !== null ? (
        <FeatureDisabled feature="Marketplace installs" message={storeRefusalMessage} />
      ) : null}
    </Card>
  );
}
