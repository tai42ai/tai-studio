/**
 * A preset's version history. Feeds the shared, kind-agnostic
 * `VersionHistoryPanel` (`GET /api/presets/{name}/versions`, newest-first, an
 * `is_current` badge, a `JsonTree` of the selected version's body) and wires its
 * per-row Rollback to `POST /api/presets/{name}/rollback` behind a confirm.
 *
 * A successful rollback invalidates the list, this preset's detail + versions, and
 * the tools master list (rollback rebinds the live tool). The confirm copy states
 * the live tool rebinds immediately.
 *
 * Per-version tags are threaded into the panel (a Tags column) and editable: the
 * panel's `onEditTags` callback runs `setPresetVersionTags` and invalidates this
 * preset's versions. Editing a tag annotation rebinds nothing (labels on an
 * immutable body), so only the versions query is invalidated — not the tool list.
 *
 * Rollback and Edit tags are offered only when the caller's access projection admits
 * their routes. A deep link's `version` marks that row; a version the history does not
 * hold is said above the table.
 */
import { apiRoutes } from '@tai42/api-client';
import {
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  Skeleton,
  toolsListKey,
  useApi,
  useCanWrite,
  type VersionHistoryEntry,
  VersionHistoryPanel,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { presetDetailKey, presetsListKey, presetVersionsKey } from './keys';

export function PresetVersions({
  name,
  version,
}: {
  readonly name: string;
  /** The version a deep link points at, if any. */
  readonly version?: number;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const canRollback = useCanWrite(apiRoutes.post_api_presets_name_rollback.path);
  const canEditTags = useCanWrite(apiRoutes.put_api_presets_name_versions_version_tags.path, 'PUT');

  const versionsQuery = useQuery({
    queryKey: presetVersionsKey(name),
    queryFn: ({ signal }) => api.listPresetVersions(name, signal),
  });

  const rollback = useMutation({
    mutationFn: (version: number) => api.rollbackPreset(name, version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: presetsListKey });
      void queryClient.invalidateQueries({ queryKey: presetDetailKey(name) });
      void queryClient.invalidateQueries({ queryKey: presetVersionsKey(name) });
      void queryClient.invalidateQueries({ queryKey: toolsListKey });
    },
  });

  // No proactive versioning-OFF guard here (unlike the create/tags-input paths): a clean OFF
  // deploy has an empty `listPresets`, so this panel never mounts — only a mid-session store-disable with it already open reaches the 501.
  const editTags = useMutation({
    mutationFn: ({ version, tags }: { version: number; tags: string[] }) =>
      api.setPresetVersionTags(name, version, tags),
    onSuccess: () => {
      // Tags are an annotation on an immutable body — no rebind — so only this
      // preset's version history goes stale.
      void queryClient.invalidateQueries({ queryKey: presetVersionsKey(name) });
    },
  });

  if (versionsQuery.isPending) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  }
  if (versionsQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(versionsQuery.error)}
        onRetry={() => void versionsQuery.refetch()}
      />
    );
  }
  if (versionsQuery.data.length === 0) {
    return (
      <Card>
        <EmptyState title="No versions" description="This preset has no version history." />
      </Card>
    );
  }

  // Newest-first, regardless of the server's list order.
  const entries: VersionHistoryEntry[] = [...versionsQuery.data]
    .sort((a, b) => b.version - a.version)
    .map((version) => ({
      version: version.version,
      body: version.body,
      is_current: version.is_current,
      created_at: version.created_at,
      tags: version.tags,
    }));

  const versionMissing =
    version !== undefined && !entries.some((entry) => entry.version === version);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      {versionMissing ? (
        <p role="status" style={{ margin: 0 }}>
          {`Version ${String(version)} is not in this preset's history.`}
        </p>
      ) : null}
      <VersionHistoryPanel
        versions={entries}
        onRollback={(target) => {
          rollback.mutate(target);
        }}
        // The panel's read-only mode withholds every row mutation; Edit tags is
        // additionally offered only with its own grant.
        readOnly={!canRollback}
        rollbackPending={rollback.isPending}
        rollbackError={rollback.isError ? errorMessage(rollback.error) : undefined}
        rollbackConfirmDescription="The live preset tool rebinds to this version immediately."
        onEditTags={
          canEditTags
            ? async (target, tags) => {
                await editTags.mutateAsync({ version: target, tags });
              }
            : undefined
        }
        highlightVersion={version}
      />
    </div>
  );
}
