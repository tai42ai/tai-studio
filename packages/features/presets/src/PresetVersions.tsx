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
 */
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  VersionHistoryPanel,
  errorMessage,
  toolsListKey,
  useApi,
  type VersionHistoryEntry,
} from '@tai42/studio-sdk';

import { presetDetailKey, presetVersionsKey, presetsListKey } from './keys';

export function PresetVersions({ name }: { readonly name: string }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

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

  return (
    <VersionHistoryPanel
      versions={entries}
      onRollback={(version) => {
        rollback.mutate(version);
      }}
      rollbackPending={rollback.isPending}
      rollbackError={rollback.isError ? errorMessage(rollback.error) : undefined}
      rollbackConfirmDescription="The live preset tool rebinds to this version immediately."
      onEditTags={async (version, tags) => {
        await editTags.mutateAsync({ version, tags });
      }}
    />
  );
}
