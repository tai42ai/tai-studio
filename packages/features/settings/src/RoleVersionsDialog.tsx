/**
 * The role VERSION-HISTORY dialog (keyed by role `name`). It wires the shared,
 * kind-agnostic `VersionHistoryPanel` to the role versioning routes:
 *  - `GET /api/auth/roles/{name}/versions` feeds the panel (each row's `is_current`
 *    drives the "Current" badge; the body is the role's grant map + base tier);
 *  - the panel's Rollback confirm calls `POST /api/auth/roles/{name}/rollback`.
 *
 * Rollback invalidates BOTH this role's versions key AND the role list, so the
 * active version and the grant editor stay in sync. Rollback errors surface loudly
 * inside the panel's confirm dialog — never swallowed.
 *
 * History is a READ surface; `readOnly` hides the per-row Rollback (the reserved
 * admin role has no editable history, so it is opened read-only).
 */
import { type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorState,
  Skeleton,
  VersionHistoryPanel,
  errorMessage,
  useApi,
  type VersionHistoryEntry,
} from '@tai42/studio-sdk';

import { rolesKey, roleVersionsKey } from './keys';

export function RoleVersionsDialog({
  name,
  readOnly = false,
  onClose,
}: {
  readonly name: string;
  readonly readOnly?: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const versionsQuery = useQuery({
    queryKey: roleVersionsKey(name),
    queryFn: ({ signal }) => api.listRoleVersions(name, signal),
  });

  const rollback = useMutation({
    mutationFn: (version: number) => api.rollbackRole(name, version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: roleVersionsKey(name) });
      void queryClient.invalidateQueries({ queryKey: rolesKey });
    },
  });

  // Newest version first — the row shape the operator reads top-down.
  const entries: VersionHistoryEntry[] = (versionsQuery.data?.versions ?? [])
    .map((version) => ({
      version: version.version,
      body: version.body,
      is_current: version.is_current,
      created_at: version.created_at,
    }))
    .sort((a, b) => b.version - a.version);

  let body: ReactNode;
  if (versionsQuery.isPending) {
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
  } else if (entries.length === 0) {
    body = (
      <Card>
        <EmptyState
          title="No role versions recorded"
          description="This role has no version history yet."
        />
      </Card>
    );
  } else {
    body = (
      <VersionHistoryPanel
        versions={entries}
        readOnly={readOnly}
        onRollback={(version) => {
          rollback.mutate(version);
        }}
        rollbackPending={rollback.isPending}
        rollbackError={rollback.isError ? errorMessage(rollback.error) : undefined}
        rollbackConfirmDescription="Rollback re-points this role immediately — every holder follows on their very next request."
      />
    );
  }

  return (
    <Dialog
      title={`Role versions — ${name}`}
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
