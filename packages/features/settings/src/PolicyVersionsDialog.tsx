/**
 * The policy VERSION-HISTORY dialog for one API key (keyed by `user_id`). It wires
 * the shared, kind-agnostic `VersionHistoryPanel` from `@tai42/studio-sdk` to the
 * access-control policy routes:
 *  - `GET /api/auth/api-keys/{user_id}/policy/versions` feeds the panel (each row's
 *    `is_current` drives the "Current" badge);
 *  - the panel's Rollback confirm calls
 *    `POST /api/auth/api-keys/{user_id}/policy/rollback`.
 *
 * Rollback invalidates BOTH this user's policy-versions key AND the tokens-payload
 * query, so the list's active version and the key table stay in sync. Rollback
 * errors surface loudly inside the panel's confirm dialog — never swallowed.
 *
 * History is a READ surface, reachable in `readOnly` config mode too; only the
 * per-row Rollback (the mutation) is hidden then. A 404 (the user has no policy
 * history) is the honest EMPTY state, distinguished from a real load failure by
 * `ApiError.status === 404`; any other error stays a loud `ErrorState`.
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
import { ApiError } from '@tai42/api-client';

import { policyVersionsKey, tokensPayloadKey } from './keys';

export function PolicyVersionsDialog({
  userId,
  readOnly = false,
  onClose,
}: {
  readonly userId: string;
  readonly readOnly?: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const versionsQuery = useQuery({
    queryKey: policyVersionsKey(userId),
    queryFn: ({ signal }) => api.listPolicyVersions(userId, signal),
  });

  const rollback = useMutation({
    mutationFn: (version: number) => api.rollbackPolicy(userId, version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: policyVersionsKey(userId) });
      void queryClient.invalidateQueries({ queryKey: tokensPayloadKey });
    },
  });

  // Newest version first — the row shape the operator reads top-down.
  const entries: VersionHistoryEntry[] = (versionsQuery.data ?? [])
    .map((version) => ({
      version: version.version,
      body: version.body,
      is_current: version.is_current,
      created_at: version.created_at,
    }))
    .sort((a, b) => b.version - a.version);

  const error = versionsQuery.error;
  const noHistory = versionsQuery.isError && error instanceof ApiError && error.status === 404;

  let body: ReactNode;
  if (versionsQuery.isPending) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  } else if (noHistory) {
    // A 404 is the honest empty state — this key simply has no policy history yet.
    body = (
      <Card>
        <EmptyState
          title="No policy versions recorded"
          description="This key has no policy history yet."
        />
      </Card>
    );
  } else if (versionsQuery.isError) {
    body = (
      <ErrorState message={errorMessage(error)} onRetry={() => void versionsQuery.refetch()} />
    );
  } else if (entries.length === 0) {
    body = (
      <Card>
        <EmptyState
          title="No policy versions recorded"
          description="This key has no policy history yet."
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
        rollbackConfirmDescription="Rollback re-points access-control enforcement immediately — the selected version is live on the very next request."
      />
    );
  }

  return (
    <Dialog
      title={`Policy versions — ${userId}`}
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
