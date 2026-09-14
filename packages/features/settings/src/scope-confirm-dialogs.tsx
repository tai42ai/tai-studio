/**
 * The four access-control mapper confirm dialogs — delete scope, remove last URL,
 * pin public, unpin public — and the host that renders whichever the mapper has
 * armed. Each names the cascade its mutation triggers and surfaces its error inline.
 */
import type { ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, useApi } from '@tai42/studio-sdk';

import { invalidateMapperKeys } from './scope-mapping';

export function DeleteScopeDialog({
  scopeId,
  itemCount,
  onClose,
}: {
  readonly scopeId: string;
  readonly itemCount: number;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.removeScope(scopeId),
    onSuccess: () => {
      invalidateMapperKeys(queryClient, true);
      onClose();
    },
  });
  return (
    <ConfirmDialog
      title="Delete scope"
      confirmLabel="Delete scope"
      pendingLabel="Deleting"
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={() => {
        mutation.mutate();
      }}
      onClose={onClose}
    >
      <p style={{ margin: 0 }}>
        Delete the scope <strong>{scopeId}</strong>? This unassigns {itemCount}{' '}
        {itemCount === 1 ? 'item' : 'items'} and removes the scope from every API key that
        references it, rewriting each of those keys&rsquo; stored policy.
      </p>
    </ConfirmDialog>
  );
}

export function RemoveLastUrlDialog({
  scopeId,
  url,
  onClose,
}: {
  readonly scopeId: string;
  readonly url: string;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.removeUrlFromScope({ url }),
    onSuccess: () => {
      invalidateMapperKeys(queryClient, true);
      onClose();
    },
  });
  return (
    <ConfirmDialog
      title="Remove last URL"
      confirmLabel="Remove URL"
      pendingLabel="Removing"
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={() => {
        mutation.mutate();
      }}
      onClose={onClose}
    >
      <p style={{ margin: 0 }}>
        Remove <strong>{url}</strong>, the last URL of scope <strong>{scopeId}</strong>? The scope
        then has no URLs, so it is stripped from every API key that references it, rewriting each of
        those keys&rsquo; stored policy.
      </p>
    </ConfirmDialog>
  );
}

export function PinPublicDialog({
  url,
  pattern,
  onClose,
}: {
  readonly url: string;
  readonly pattern?: string;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.pinRoutePublic(pattern === undefined ? { url } : { url, pattern }),
    onSuccess: () => {
      invalidateMapperKeys(queryClient, false);
      onClose();
    },
  });
  return (
    <ConfirmDialog
      title="Pin route public"
      confirmLabel="Pin public"
      pendingLabel="Pinning"
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={() => {
        mutation.mutate();
      }}
      onClose={onClose}
    >
      <p style={{ margin: 0 }}>
        Pin <strong>{url}</strong> public? At enforcement, every request to it is served WITHOUT
        API-key authentication and without any scope check — anyone who can reach the server can
        call it. This is not a scope; it removes the route from access control entirely.
      </p>
    </ConfirmDialog>
  );
}

export function UnpinPublicDialog({
  url,
  onClose,
}: {
  readonly url: string;
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.unpinPublicRoute(url),
    onSuccess: () => {
      invalidateMapperKeys(queryClient, false);
      onClose();
    },
  });
  return (
    <ConfirmDialog
      title="Unpin public route"
      confirmLabel="Unpin"
      pendingLabel="Unpinning"
      isPending={mutation.isPending}
      error={mutation.error}
      onConfirm={() => {
        mutation.mutate();
      }}
      onClose={onClose}
    >
      <p style={{ margin: 0 }}>
        Unpin <strong>{url}</strong>? It stops being served public and falls back to normal access
        control — a request to it is denied until the route is mapped to a scope.
      </p>
    </ConfirmDialog>
  );
}

/** The confirm-dialog targets the mapper can arm; at most one is open at a time. */
export interface MapperConfirmTargets {
  readonly pin: { url: string; pattern?: string } | null;
  readonly unpin: string | null;
  readonly lastUrl: { scopeId: string; url: string } | null;
  readonly delete: { scopeId: string; itemCount: number } | null;
}

/**
 * Render whichever mapper confirm the caller has armed. At most one target is set at
 * a time; `onClose` clears them all.
 */
export function MapperConfirmDialogs({
  targets,
  onClose,
}: {
  readonly targets: MapperConfirmTargets;
  readonly onClose: () => void;
}): ReactNode {
  return (
    <>
      {targets.pin !== null ? (
        <PinPublicDialog url={targets.pin.url} pattern={targets.pin.pattern} onClose={onClose} />
      ) : null}
      {targets.unpin !== null ? <UnpinPublicDialog url={targets.unpin} onClose={onClose} /> : null}
      {targets.lastUrl !== null ? (
        <RemoveLastUrlDialog
          scopeId={targets.lastUrl.scopeId}
          url={targets.lastUrl.url}
          onClose={onClose}
        />
      ) : null}
      {targets.delete !== null ? (
        <DeleteScopeDialog
          scopeId={targets.delete.scopeId}
          itemCount={targets.delete.itemCount}
          onClose={onClose}
        />
      ) : null}
    </>
  );
}
