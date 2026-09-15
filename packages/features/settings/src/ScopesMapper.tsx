/**
 * The access-control mapper: the scope ↔ URL surface the policy enforcer reads.
 *
 * Every non-public url→scope mapping (`listScopes`) is inverted into per-scope
 * drop zones; the app's unmapped HTTP routes (`listAuthRoutes` entries whose
 * `mapped` is `null`) and undiscovered sub-MCP mounts (`listSubMcp`) fill one
 * Unassigned bucket; publicly-pinned urls (`listPublicRoutes`) fill a distinguished
 * Public zone. Dragging a chip onto a scope maps it (`addUrlToScope`); dropping on
 * the Public zone pins it (`pinRoutePublic`, behind a confirm). The `DndContext`
 * runs a `PointerSensor` and a `KeyboardSensor` so every assignment is fully
 * keyboard-operable, with screen-reader announcements on drag start/over/end/cancel.
 *
 * Every mutation error renders VERBATIM in the error strip (drag/add-row/remove) or
 * inside its confirm dialog (delete-scope/last-url/pin/unpin) — never swallowed.
 * Every server-supplied string renders as escaped text through the design system.
 */
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { AddUrlToScopeBody } from '@tai42/api-client';
import { Card, errorMessage, ErrorState, Spinner, useApi } from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useState } from 'react';

import { CreateScopeRow } from './CreateScopeRow';
import { authRoutesKey, publicRoutesKey, subMcpKey } from './keys';
import { MapperZones } from './MapperZones';
import { announcements } from './scope-announcements';
import { MapperConfirmDialogs } from './scope-confirm-dialogs';
import {
  deriveMapperChips,
  dispatchDrop,
  dropFromDragEvent,
  invalidateMapperKeys,
  PUBLIC_MARKER,
} from './scope-mapping';
import type { ChipData } from './ScopeItemChip';

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  marginBottom: 'var(--tai-space-4)',
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-lg)',
  color: 'var(--tai-color-text)',
};

const mapperBodyStyle: CSSProperties = { position: 'relative' };

const overlayStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'color-mix(in srgb, var(--tai-color-surface) 60%, transparent)',
  zIndex: 1,
};

/** The assign/remove mutations and the drag/remove handlers, bound to the confirm setters. */
function useMapperActions(setters: {
  readonly onPin: (target: { url: string; pattern?: string }) => void;
  readonly onLastUrl: (target: { scopeId: string; url: string }) => void;
  readonly onScopePersisted: (scopeId: string) => void;
}): {
  readonly anyPending: boolean;
  readonly mutationError: Error | null;
  readonly assign: (body: AddUrlToScopeBody) => void;
  readonly onDragEnd: (event: DragEndEvent) => void;
  readonly onRemoveScopeChip: (data: ChipData, isLastUrl: boolean) => void;
} {
  const api = useApi();
  const queryClient = useQueryClient();

  const assignMutation = useMutation({
    mutationFn: (body: AddUrlToScopeBody) => api.addUrlToScope(body),
    onSuccess: (_data, body) => {
      // A first assignment persists a pending scope — drop it from the pending set.
      setters.onScopePersisted(body.scope_id);
      invalidateMapperKeys(queryClient, false);
    },
  });
  const removeUrlMutation = useMutation({
    mutationFn: (url: string) => api.removeUrlFromScope({ url }),
    onSuccess: () => {
      invalidateMapperKeys(queryClient, true);
    },
  });

  const onDragEnd = (event: DragEndEvent): void => {
    dispatchDrop(dropFromDragEvent(event), {
      assign: (body) => {
        assignMutation.mutate(body);
      },
      pin: (url, pattern) => {
        setters.onPin({ url, pattern });
      },
    });
  };

  const onRemoveScopeChip = (data: ChipData, isLastUrl: boolean): void => {
    if (data.origin.kind !== 'scope') return;
    if (isLastUrl) setters.onLastUrl({ scopeId: data.origin.scopeId, url: data.url });
    else removeUrlMutation.mutate(data.url);
  };

  const anyPending = assignMutation.isPending || removeUrlMutation.isPending;
  const mutationError = assignMutation.error ?? removeUrlMutation.error ?? null;
  const assign = (body: AddUrlToScopeBody): void => {
    assignMutation.mutate(body);
  };

  return { anyPending, mutationError, assign, onDragEnd, onRemoveScopeChip };
}

export function ScopesMapper({
  scopes,
  readOnly,
}: {
  readonly scopes: Record<string, string>;
  readonly readOnly: boolean;
}): ReactNode {
  const api = useApi();

  const routesQuery = useQuery({
    queryKey: authRoutesKey,
    queryFn: ({ signal }) => api.listAuthRoutes(signal),
  });
  const publicQuery = useQuery({
    queryKey: publicRoutesKey,
    queryFn: ({ signal }) => api.listPublicRoutes(signal),
  });
  const subMcpQuery = useQuery({
    queryKey: subMcpKey,
    queryFn: ({ signal }) => api.listSubMcp(signal),
  });

  const [pendingScopes, setPendingScopes] = useState<string[]>([]);
  const [pinTarget, setPinTarget] = useState<{ url: string; pattern?: string } | null>(null);
  const [unpinTarget, setUnpinTarget] = useState<string | null>(null);
  const [lastUrlTarget, setLastUrlTarget] = useState<{ scopeId: string; url: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ scopeId: string; itemCount: number } | null>(
    null,
  );

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));
  const actions = useMapperActions({
    onPin: setPinTarget,
    onLastUrl: setLastUrlTarget,
    onScopePersisted: (scopeId) => {
      setPendingScopes((current) => current.filter((id) => id !== scopeId));
    },
  });

  if (routesQuery.isError || publicQuery.isError || subMcpQuery.isError) {
    const error = routesQuery.error ?? publicQuery.error ?? subMcpQuery.error;
    return (
      <Card>
        <div style={cardHeaderStyle}>
          <h3 style={headingStyle}>Access control</h3>
        </div>
        <ErrorState
          message={errorMessage(error)}
          onRetry={() => {
            void routesQuery.refetch();
            void publicQuery.refetch();
            void subMcpQuery.refetch();
          }}
        />
      </Card>
    );
  }
  if (routesQuery.isPending || publicQuery.isPending || subMcpQuery.isPending) {
    return (
      <Card>
        <Spinner label="Loading access control" />
      </Card>
    );
  }

  const slugs = new Set(Object.keys(subMcpQuery.data));
  const chips = deriveMapperChips(scopes, routesQuery.data, publicQuery.data, slugs);
  const allScopeIds = new Set([...chips.realScopeIds, ...pendingScopes]);
  allScopeIds.delete(PUBLIC_MARKER);

  const interactive = !readOnly && !actions.anyPending;

  const closeConfirm = (): void => {
    setPinTarget(null);
    setUnpinTarget(null);
    setLastUrlTarget(null);
    setDeleteTarget(null);
  };

  return (
    <Card>
      <div style={cardHeaderStyle}>
        <h3 style={headingStyle}>Access control</h3>
      </div>

      {actions.mutationError !== null ? (
        <div style={{ marginBottom: 'var(--tai-space-3)' }}>
          <ErrorState message={errorMessage(actions.mutationError)} />
        </div>
      ) : null}

      {readOnly ? null : (
        <CreateScopeRow
          existingIds={allScopeIds}
          onCreate={(scopeId) => {
            setPendingScopes((current) => [...current, scopeId]);
          }}
        />
      )}

      <div style={mapperBodyStyle}>
        {actions.anyPending ? (
          <div style={overlayStyle}>
            <Spinner label="Saving" />
          </div>
        ) : null}

        <DndContext
          sensors={sensors}
          accessibility={{ announcements }}
          onDragEnd={actions.onDragEnd}
        >
          <MapperZones
            chips={chips}
            slugs={slugs}
            pendingScopes={pendingScopes}
            interactive={interactive}
            readOnly={readOnly}
            onAssign={actions.assign}
            onRemoveScopeChip={actions.onRemoveScopeChip}
            onDeleteScope={(scopeId, itemCount) => {
              setDeleteTarget({ scopeId, itemCount });
            }}
            onDiscardPending={(scopeId) => {
              setPendingScopes((current) => current.filter((id) => id !== scopeId));
            }}
            onUnpin={setUnpinTarget}
          />
        </DndContext>
      </div>

      <MapperConfirmDialogs
        targets={{
          pin: pinTarget,
          unpin: unpinTarget,
          lastUrl: lastUrlTarget,
          delete: deleteTarget,
        }}
        onClose={closeConfirm}
      />
    </Card>
  );
}
