/**
 * The `/storage` screen: one browse-and-inspect screen over the stored objects,
 * reached through the storage grant or the templates grant. Layers stack:
 *
 *  - the PROVIDER read (`getStorageInfo`): storage is dead by default (the skeleton
 *    ships no provider), so `present: false` renders a calm EmptyState and nothing
 *    else. When present it shows the provider class + module verbatim;
 *  - the DOORS ({@link useStorageDoors}): which API each action goes through, from
 *    the caller's access and the mounted surfaces;
 *  - the LIST ({@link ResourceBrowser}) selects an object (`?id=`), and the DETAIL
 *    ({@link StorageDetail}) shows it and holds every file action.
 *
 * Every server-supplied value renders as ESCAPED React text — never through an HTML
 * sink. Failures surface loudly through `ErrorState`; a server error is shown verbatim.
 */
import type { StorageInfo } from '@tai42/api-client';
import {
  AppLink,
  ArrowLeftIcon,
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  PageHeader,
  type PageProps,
  Skeleton,
  Spinner,
  useApi,
  useBreakpoint,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import { storageEntryRoot, storageInfoKey, templateNamesKey } from './keys';
import { ResourceBrowser } from './ResourceBrowser';
import { monoStyle } from './storage-view';
import { StorageDetail } from './StorageDetail';
import { UploadDialog } from './UploadDialog';
import { useDetailFocus } from './use-detail-focus';
import { type StorageDoors, useStorageDoors } from './use-storage-doors';

/** The page header every Storage state shares. */
function StorageTitle({ actions }: { readonly actions?: ReactNode }): ReactNode {
  return <PageHeader eyebrow="Administration" title="Storage" actions={actions} />;
}

function ProviderCard({ info }: { readonly info: StorageInfo }): ReactNode {
  return (
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
        <dd style={{ margin: 0, ...monoStyle }}>{info.provider}</dd>
        <dt style={{ color: 'var(--tai-color-text-muted)' }}>Module</dt>
        <dd style={{ margin: 0, ...monoStyle }}>{info.module}</dd>
      </dl>
    </Card>
  );
}

function StorageBody({
  info,
  doors,
  search,
  onIdsLoaded,
}: {
  readonly info: StorageInfo;
  readonly doors: StorageDoors;
  readonly search: PageProps<'storage'>['search'];
  readonly onIdsLoaded: (ids: readonly string[]) => void;
}): ReactNode {
  const { isSinglePane } = useBreakpoint();
  const selected = search.id;
  const { listRef, setDetailHeading } = useDetailFocus(selected);
  const list = doors.list;
  if (list === null) {
    return (
      <>
        <ProviderCard info={info} />
        <Card>
          <EmptyState
            title="Storage is not served here"
            description="This deployment mounts neither the storage nor the templates doors, or your access reaches neither list."
          />
        </Card>
      </>
    );
  }
  const filter = search.q?.trim() ? search.q.trim() : undefined;
  return (
    <>
      <ProviderCard info={info} />
      <div className="tai-split" data-pane={selected !== undefined ? 'detail' : 'list'}>
        <div className="tai-split-list" ref={listRef}>
          <ResourceBrowser
            door={list}
            deleteDoor={doors.deleteDoor}
            selected={selected}
            committedQuery={search.q ?? ''}
            onIdsLoaded={onIdsLoaded}
          />
        </div>
        <div className="tai-split-detail">
          {isSinglePane && selected !== undefined ? (
            <AppLink to="storage" search={{ q: filter }} className="tai-btn tai-btn-ghost">
              <ArrowLeftIcon />
              All resources
            </AppLink>
          ) : null}
          {selected !== undefined ? (
            <StorageDetail
              key={selected}
              id={selected}
              doors={doors}
              filter={filter}
              headingRef={setDetailHeading}
            />
          ) : (
            <Card>
              <EmptyState
                title="No resource selected"
                description="Choose a resource from the list to view it."
              />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function StorageHeader({
  doors,
  existingIds,
}: {
  readonly doors: StorageDoors | null;
  readonly existingIds: readonly string[];
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const clearCache = useMutation({
    mutationFn: () => api.clearTemplatesCache(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: templateNamesKey });
      void queryClient.invalidateQueries({ queryKey: storageEntryRoot });
    },
  });
  const upload = doors?.upload ?? null;
  const actions =
    upload !== null || doors?.clearCache === true ? (
      <>
        {doors?.clearCache === true ? (
          <>
            {clearCache.isSuccess ? (
              <span role="status" className="tai-muted">
                Template cache cleared.
              </span>
            ) : null}
            <Button
              onClick={() => {
                clearCache.mutate();
              }}
              disabled={clearCache.isPending}
            >
              {clearCache.isPending ? <Spinner label="Clearing cache" /> : null}
              Clear cache
            </Button>
          </>
        ) : null}
        {upload !== null ? (
          <Button
            variant="primary"
            onClick={() => {
              setUploadOpen(true);
            }}
          >
            Upload
          </Button>
        ) : null}
      </>
    ) : undefined;
  return (
    <>
      <StorageTitle actions={actions} />
      {clearCache.isError ? <ErrorState message={errorMessage(clearCache.error)} /> : null}
      {uploadOpen && upload !== null ? (
        <UploadDialog
          door={upload}
          existingIds={existingIds}
          onClose={() => {
            setUploadOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function PresentStorage({
  info,
  search,
}: {
  readonly info: StorageInfo;
  readonly search: PageProps<'storage'>['search'];
}): ReactNode {
  const doors = useStorageDoors(info.surfaces);
  const [existingIds, setExistingIds] = useState<readonly string[]>([]);
  return (
    <>
      <StorageHeader doors={doors} existingIds={existingIds} />
      <StorageBody info={info} doors={doors} search={search} onIdsLoaded={setExistingIds} />
    </>
  );
}

export function StoragePage({ search }: PageProps<'storage'>): ReactNode {
  const api = useApi();
  const info = useQuery({
    queryKey: storageInfoKey,
    queryFn: ({ signal }) => api.getStorageInfo(signal),
  });

  let body: ReactNode;
  if (info.isPending) {
    body = (
      <>
        <StorageTitle />
        <Skeleton height={96} />
      </>
    );
  } else if (info.isError) {
    body = (
      <>
        <StorageTitle />
        <ErrorState message={errorMessage(info.error)} onRetry={() => void info.refetch()} />
      </>
    );
  } else if (!info.data.present) {
    body = (
      <>
        <StorageTitle />
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
      </>
    );
  } else {
    body = <PresentStorage info={info.data} search={search} />;
  }

  return (
    <div className="tai-stack tai-stack-6" data-testid="storage-page">
      {body}
    </div>
  );
}
