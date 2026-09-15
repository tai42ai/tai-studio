/**
 * The per-target conversation-config admin surface: every stored
 * `TargetConversationConfig` is a row — its target (kind + name), whether the target
 * opts into person linking (`multichannel`), and its first-contact greeting. A
 * "Create config" button opens the {@link ConfigFormDialog}; each row carries an Edit
 * door (the same dialog, prefilled) and a Delete door behind the house
 * `ConfirmDialog`.
 *
 * A config is inert operator presentation state (no key bound, no authority
 * delegated), so a delete is not authority-changing — but it IS a config the target
 * loses, so the confirm copy says so plainly.
 *
 * Every server-supplied value renders as escaped React text; no config field is ever
 * interpreted as markup.
 */
import type { TargetConversationConfig } from '@tai42/api-client';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  errorMessage,
  ScrollRegion,
  Skeleton,
  Table,
  TBody,
  TH,
  THead,
  TR,
  useApi,
  useCanWrite,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useState } from 'react';

import { ConfigFormDialog } from './ConfigFormDialog';
import { ConfigRow, configRowKey } from './ConfigRow';
import { conversationConfigsKey } from './keys';
import { ReadFailure } from './read-states';

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  marginBottom: 'var(--tai-space-4)',
};

export function ConfigsTable(): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const configs = useQuery({
    queryKey: conversationConfigsKey,
    queryFn: ({ signal }) => api.listConversationConfigs(signal),
  });

  // Create and edit ride the one UPSERT door
  // (`PUT /api/conversation-configs/{target_kind}/{target_name}`); delete rides the
  // `DELETE` on the same path. Both are DYNAMIC (templated) write routes, so — following
  // the house static-placeholder idiom — the interpolated path resolves to a
  // full-projection gate: a scoped projection can never method-express a templated
  // route, so its write affordances stay withdrawn (projection ⊆ gate). The read table
  // below is unaffected; only the write controls gate.
  const canWrite = useCanWrite('/api/conversation-configs/{target_kind}/{target_name}', 'PUT');
  const canDelete = useCanWrite('/api/conversation-configs/{target_kind}/{target_name}', 'DELETE');

  // `creating` opens the blank form; `editing` opens it prefilled from a row;
  // `pendingDelete` names the row awaiting a destructive-delete confirm.
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TargetConversationConfig | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TargetConversationConfig | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (config: TargetConversationConfig) =>
      api.deleteConversationConfig(config.target_kind, config.target_name),
    onSuccess: () => {
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: conversationConfigsKey });
    },
  });

  let body: ReactNode;
  if (configs.isPending) {
    body = <Skeleton height={160} />;
  } else if (configs.isError) {
    body = (
      <ReadFailure
        error={configs.error}
        onRetry={() => void configs.refetch()}
        forbiddenDescription="Reading the per-target conversation configs needs authority over them."
        notFoundDescription="Per-target conversation configs are not reachable on this deployment."
      />
    );
  } else if (configs.data.items.length === 0) {
    body = (
      <EmptyState
        title="No per-target configs"
        description="A config sets a target's first-contact greeting and whether it links a participant across channels. Create one to override the defaults for an agent or tool."
      />
    );
  } else {
    body = (
      <ScrollRegion label="Conversation configs">
        <Table data-testid="conversation-configs-table">
          <THead>
            <TR>
              <TH>Target</TH>
              <TH>Multichannel</TH>
              <TH>Greeting</TH>
              <TH aria-label="Actions" />
            </TR>
          </THead>
          <TBody>
            {configs.data.items.map((config) => (
              <ConfigRow
                key={configRowKey(config)}
                config={config}
                canWrite={canWrite}
                canDelete={canDelete}
                onEdit={() => {
                  setEditing(config);
                }}
                onDelete={() => {
                  // Clear any prior delete failure so this confirm opens clean, never
                  // carrying a stale error from a different config's attempt.
                  deleteMutation.reset();
                  setPendingDelete(config);
                }}
              />
            ))}
          </TBody>
        </Table>
      </ScrollRegion>
    );
  }

  return (
    <div data-testid="conversation-configs">
      <Card>
        <div style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: 'var(--tai-text-lg)' }}>Per-target configs</h2>
          {canWrite ? (
            <Button
              variant="primary"
              onClick={() => {
                setCreating(true);
              }}
            >
              Create config
            </Button>
          ) : null}
        </div>
        {body}
      </Card>
      {creating ? (
        <ConfigFormDialog
          onClose={() => {
            setCreating(false);
          }}
        />
      ) : null}
      {editing !== null ? (
        <ConfigFormDialog
          initial={editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      {pendingDelete !== null ? (
        <ConfirmDialog
          title="Delete config"
          confirmLabel="Delete config"
          pendingLabel="Deleting"
          isPending={deleteMutation.isPending}
          error={deleteMutation.isError ? errorMessage(deleteMutation.error) : null}
          onConfirm={() => {
            deleteMutation.mutate(pendingDelete);
          }}
          onClose={() => {
            setPendingDelete(null);
          }}
        >
          <p style={{ margin: 0 }}>
            Delete the config for{' '}
            <strong>{`${pendingDelete.target_kind}: ${pendingDelete.target_name}`}</strong>? The
            target falls back to the default greeting and linking behaviour. It cannot be undone.
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
