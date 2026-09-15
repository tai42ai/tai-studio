/**
 * The profile version-history dialog: the metadata list, each version's masked body
 * fetched on its own (secret route) and rendered read-only, and a fenced rollback
 * that re-points the stored profile at a version's body.
 */
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  errorMessage,
  ErrorState,
  Skeleton,
  useApi,
  type VersionHistoryEntry,
  VersionHistoryPanel,
} from '@tai42/studio-sdk';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  settingsProfileKey,
  settingsProfilesKey,
  settingsProfileVersionKey,
  settingsProfileVersionsKey,
} from './keys';
import { maskBody, type ProfileVersion } from './profile-secrets';

export function ProfileVersionsDialog({
  name,
  ownedSecret,
  readOnly,
  onClose,
}: {
  readonly name: string;
  readonly ownedSecret: ReadonlyMap<string, boolean>;
  readonly readOnly: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const versionsQuery = useQuery({
    queryKey: settingsProfileVersionsKey(name),
    queryFn: ({ signal }) => api.listSettingsProfileVersions(name, signal),
  });

  // The list is metadata only; each version's BODY is fetched on its own (secret
  // route) and rendered masked — one query per version, cached by version key.
  const metadata = versionsQuery.data ?? [];
  const bodyQueries = useQueries({
    queries: metadata.map((version) => ({
      queryKey: settingsProfileVersionKey(name, version.version),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.getSettingsProfileVersion(name, version.version, signal),
    })),
  });

  const rollback = useMutation({
    mutationFn: (version: number) => api.rollbackSettingsProfile(name, version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsProfileVersionsKey(name) });
      void queryClient.invalidateQueries({ queryKey: settingsProfileKey(name) });
      void queryClient.invalidateQueries({ queryKey: settingsProfilesKey });
    },
  });

  const bodiesPending = bodyQueries.some((query) => query.isPending);
  const bodyError = bodyQueries.find((query) => query.isError)?.error;

  let body: ReactNode;
  if (
    versionsQuery.isPending ||
    (metadata.length > 0 && bodiesPending && bodyError === undefined)
  ) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  } else if (versionsQuery.isError) {
    body = (
      <ErrorState
        message={errorMessage(versionsQuery.error)}
        onRetry={() => void versionsQuery.refetch()}
      />
    );
  } else if (bodyError !== undefined) {
    body = <ErrorState message={errorMessage(bodyError)} />;
  } else if (metadata.length === 0) {
    body = (
      <Card>
        <EmptyState
          title="No versions recorded"
          description="This profile has no version history yet."
        />
      </Card>
    );
  } else {
    const entries: VersionHistoryEntry[] = bodyQueries
      .map((query) => query.data)
      .filter((data): data is ProfileVersion => data !== undefined)
      .map((version) => ({
        version: version.version,
        tags: version.tags,
        is_current: version.is_current,
        created_at: version.created_at,
        body: maskBody(version.body, ownedSecret),
      }))
      .sort((a, b) => b.version - a.version);
    body = (
      <VersionHistoryPanel
        versions={entries}
        readOnly={readOnly}
        onRollback={(version) => {
          rollback.mutate(version);
        }}
        rollbackPending={rollback.isPending}
        rollbackError={rollback.isError ? errorMessage(rollback.error) : undefined}
        rollbackConfirmDescription="Rollback re-points the stored profile at the version's body; apply it to push the change to the fleet."
      />
    );
  }

  return (
    <Dialog
      title={`Profile versions — ${name}`}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-5)' }}>
        {body}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
