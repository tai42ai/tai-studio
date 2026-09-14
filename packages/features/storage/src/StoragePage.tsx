/**
 * The `/storage` feature page: the content store a storage-provider plugin exposes.
 * Two honesty layers stack:
 *
 *  - the PROVIDER card (`getStorageInfo`) — storage is dead by default (the skeleton
 *    ships no provider), so `present: false` renders a calm EmptyState and nothing
 *    else. When present it shows the provider class + module verbatim.
 *  - the RESOURCE browser (only when a provider is present) — see {@link ResourceBrowser}.
 *
 * Every server-supplied value renders as ESCAPED React text — never through an HTML
 * sink. Failures surface loudly through `ErrorState`; a server error is shown verbatim.
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AppLink,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  errorMessage,
  useApi,
  type PageProps,
} from '@tai42/studio-sdk';

import { storageInfoKey } from './keys';
import { ResourceBrowser } from './ResourceBrowser';
import { monoStyle } from './storage-view';

export function StoragePage({ search }: PageProps<'storage'>): ReactNode {
  const api = useApi();
  const info = useQuery({
    queryKey: storageInfoKey,
    queryFn: ({ signal }) => api.getStorageInfo(signal),
  });

  let body: ReactNode;
  if (info.isPending) {
    body = <Skeleton height={96} />;
  } else if (info.isError) {
    body = <ErrorState message={errorMessage(info.error)} onRetry={() => void info.refetch()} />;
  } else if (!info.data.present) {
    body = (
      <Card>
        <EmptyState
          title="Storage needs a storage-provider plugin"
          description="No installed plugin exposes a storage provider. Install one to browse, upload, and manage stored objects."
          action={
            <AppLink
              to="marketplace"
              search={{ kind: 'storage' }}
              className="tai-btn tai-btn-secondary"
            >
              Browse marketplace
            </AppLink>
          }
        />
      </Card>
    );
  } else {
    body = (
      <>
        <Card>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 'var(--tai-space-2) var(--tai-space-4)',
              margin: 0,
            }}
          >
            <dt style={{ color: 'var(--tai-color-text-muted)' }}>Provider</dt>
            <dd style={{ margin: 0, ...monoStyle }}>{info.data.provider}</dd>
            <dt style={{ color: 'var(--tai-color-text-muted)' }}>Module</dt>
            <dd style={{ margin: 0, ...monoStyle }}>{info.data.module}</dd>
          </dl>
        </Card>
        <ResourceBrowser initialFilter={search.q ?? ''} />
      </>
    );
  }

  return (
    <div className="tai-stack tai-stack-6" data-testid="storage-page">
      <PageHeader eyebrow="Administration" title="Storage" />
      {body}
    </div>
  );
}
