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
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Over,
} from '@dnd-kit/core';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Spinner,
  TextInput,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { AddUrlToScopeBody, AuthRoute } from '@tai42/api-client';

import { authRoutesKey, publicRoutesKey, scopesKey, subMcpKey, tokensPayloadKey } from './keys';
import { ScopeZone } from './ScopeZone';
import { type ChipData, type ZoneRef } from './ScopeItemChip';

// -- pure helpers (unit-tested directly) -------------------------------------

/** Group the `{ url: scope_id }` map into `scope_id → sorted url[]`. */
export function scopeGroupsOf(scopes: Record<string, string>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const [url, scopeId] of Object.entries(scopes)) {
    const list = groups.get(scopeId) ?? [];
    list.push(url);
    groups.set(scopeId, list);
  }
  for (const list of groups.values()) list.sort();
  return groups;
}

/** The sub-MCP slug a url names (`/app/<slug>`) when it is a live slug, else `null`. */
export function slugForUrl(url: string, slugs: ReadonlySet<string>): string | null {
  const match = /^\/app\/([^/]+)$/.exec(url);
  const slug = match?.[1];
  return slug !== undefined && slugs.has(slug) ? slug : null;
}

/** The dynamic-pattern regex that maps every sub-path of a mount to the mount's url key. */
export function subMcpPattern(slug: string): string {
  return `^/app/${slug}/.*$`;
}

/** The action a drop resolves to. `noop` = same-zone or onto-unassigned drop. */
export type DropAction =
  | { readonly kind: 'noop' }
  | { readonly kind: 'assign'; readonly body: AddUrlToScopeBody }
  | { readonly kind: 'pin'; readonly url: string; readonly pattern?: string };

/**
 * Decide what a chip dropped over a zone does. Pure — the component turns an
 * `assign` into `addUrlToScope` and a `pin` into the confirm dialog. A drop onto
 * the chip's own scope, onto the Unassigned bucket, onto the chip's own Public
 * origin, or off any zone is a no-op.
 */
export function resolveDrop(active: ChipData, over: { zone: ZoneRef } | null): DropAction {
  if (over === null) return { kind: 'noop' };
  const target = over.zone;
  if (target.kind === 'unassigned') return { kind: 'noop' };
  const pattern =
    active.itemType === 'sub-mcp' && active.slug !== null ? subMcpPattern(active.slug) : undefined;
  if (target.kind === 'public') {
    if (active.origin.kind === 'public') return { kind: 'noop' };
    return pattern === undefined
      ? { kind: 'pin', url: active.url }
      : { kind: 'pin', url: active.url, pattern };
  }
  if (active.origin.kind === 'scope' && active.origin.scopeId === target.scopeId) {
    return { kind: 'noop' };
  }
  const body: AddUrlToScopeBody =
    pattern === undefined
      ? { scope_id: target.scopeId, url: active.url }
      : { scope_id: target.scopeId, url: active.url, pattern };
  return { kind: 'assign', body };
}

/**
 * The drop a `DragEndEvent` resolves to. Reads the dragged chip and the zone it
 * was released over off dnd-kit's untyped `data.current` payloads and delegates to
 * the pure `resolveDrop`. Exported so the map/pin dispatch is unit-testable without
 * simulating pointer or keyboard events.
 */
export function dropFromDragEvent(event: DragEndEvent): DropAction {
  const active = event.active.data.current as ChipData | undefined;
  if (active === undefined) return { kind: 'noop' };
  const overZone = (event.over?.data.current as { zone?: ZoneRef } | undefined)?.zone;
  return resolveDrop(active, overZone === undefined ? null : { zone: overZone });
}

/**
 * Run a resolved drop: `assign` maps the url (`addUrlToScope`), `pin` opens the
 * public-pin confirm — a pin NEVER de-authenticates a route directly, it only
 * arms the confirm dialog. `noop` does nothing. Exported so the assign-vs-pin
 * dispatch is unit-testable in isolation from the mutation/state wiring.
 */
export function dispatchDrop(
  action: DropAction,
  handlers: {
    readonly assign: (body: AddUrlToScopeBody) => void;
    readonly pin: (url: string, pattern?: string) => void;
  },
): void {
  if (action.kind === 'assign') handlers.assign(action.body);
  else if (action.kind === 'pin') handlers.pin(action.url, action.pattern);
}

/** Build a chip payload for a url living in the given origin zone. */
function chipFor(
  url: string,
  origin: ZoneRef,
  slugs: ReadonlySet<string>,
  methods: readonly string[] = [],
): ChipData {
  const slug = slugForUrl(url, slugs);
  return { url, itemType: slug === null ? 'route' : 'sub-mcp', slug, origin, methods };
}

/** Invalidate the mapper's coherent source surface after a successful mutation. */
function invalidateMapperKeys(queryClient: QueryClient, policyCascade: boolean): void {
  void queryClient.invalidateQueries({ queryKey: scopesKey });
  void queryClient.invalidateQueries({ queryKey: authRoutesKey });
  void queryClient.invalidateQueries({ queryKey: publicRoutesKey });
  if (policyCascade) void queryClient.invalidateQueries({ queryKey: tokensPayloadKey });
}

// -- styles ------------------------------------------------------------------

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

const inlineFormStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
  alignItems: 'flex-end',
  marginTop: 'var(--tai-space-3)',
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

const publicNoteStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

// -- confirm dialogs ---------------------------------------------------------

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

// -- create-scope row --------------------------------------------------------

const SCOPE_ID_RE = /^[a-zA-Z0-9_\- ]+$/;

/**
 * The reserved access-control marker. It is never a scope — public urls live in
 * the distinguished Public zone — so it is excluded from the scope zones and
 * rejected as a new scope name.
 */
const PUBLIC_MARKER = 'public';

function CreateScopeRow({
  existingIds,
  onCreate,
}: {
  readonly existingIds: ReadonlySet<string>;
  readonly onCreate: (scopeId: string) => void;
}): ReactNode {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError('Enter a scope name.');
      return;
    }
    if (!SCOPE_ID_RE.test(trimmed)) {
      setError('Scope names may contain only letters, numbers, spaces, hyphens and underscores.');
      return;
    }
    if (trimmed === PUBLIC_MARKER) {
      setError('“public” is the reserved public marker, not a scope. Use the Public zone.');
      return;
    }
    if (existingIds.has(trimmed)) {
      setError('A scope with that name already exists.');
      return;
    }
    onCreate(trimmed);
    setValue('');
    setError(null);
  };

  return (
    <div style={inlineFormStyle}>
      <Field label="New scope" error={error ?? undefined} style={{ flex: 1 }}>
        <TextInput
          aria-label="New scope name"
          value={value}
          autoComplete="off"
          onChange={(event) => {
            setValue(event.target.value);
            if (error !== null) setError(null);
          }}
        />
      </Field>
      <Button type="button" variant="primary" onClick={submit}>
        Add scope
      </Button>
    </div>
  );
}

// -- add-route row (per real scope) ------------------------------------------

function AddRouteRow({
  scopeId,
  disabled,
  onAdd,
}: {
  readonly scopeId: string;
  readonly disabled: boolean;
  readonly onAdd: (body: AddUrlToScopeBody) => void;
}): ReactNode {
  const [url, setUrl] = useState('');
  const [usePattern, setUsePattern] = useState(false);
  const [pattern, setPattern] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const trimmed = url.trim();
    if (!trimmed.startsWith('/')) {
      setError('A route path must start with "/".');
      return;
    }
    const body: AddUrlToScopeBody =
      usePattern && pattern.trim().length > 0
        ? { scope_id: scopeId, url: trimmed, pattern: pattern.trim() }
        : { scope_id: scopeId, url: trimmed };
    onAdd(body);
    setUrl('');
    setPattern('');
    setUsePattern(false);
    setError(null);
  };

  return (
    <div style={inlineFormStyle}>
      <Field label="Add route" error={error ?? undefined} style={{ flex: 1 }}>
        <TextInput
          aria-label={`Add route to ${scopeId}`}
          value={url}
          autoComplete="off"
          placeholder="/some/path"
          disabled={disabled}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error !== null) setError(null);
          }}
        />
      </Field>
      <Checkbox
        label="Dynamic pattern"
        checked={usePattern}
        onCheckedChange={setUsePattern}
        disabled={disabled}
      />
      {usePattern ? (
        <Field label="Pattern (regex)" style={{ flex: 1 }}>
          <TextInput
            aria-label={`Pattern (regex) for route added to ${scopeId}`}
            value={pattern}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => {
              setPattern(event.target.value);
            }}
          />
        </Field>
      ) : null}
      <Button type="button" variant="primary" disabled={disabled} onClick={submit}>
        Add route
      </Button>
    </div>
  );
}

// -- announcements -----------------------------------------------------------

export function describeZone(zone: ZoneRef): string {
  switch (zone.kind) {
    case 'scope':
      return `scope ${zone.scopeId}`;
    case 'unassigned':
      return 'the Unassigned bucket';
    case 'public':
      return 'the Public zone';
  }
}

function describeOver(over: Over): string {
  const zone = (over.data.current as { zone?: ZoneRef } | undefined)?.zone;
  return zone === undefined ? String(over.id) : describeZone(zone);
}

const announcements: Announcements = {
  onDragStart: ({ active }) =>
    `Picked up ${String(active.id)}. Use the arrow keys to move it over a scope, the Public zone, or the Unassigned bucket, then press space to drop.`,
  onDragOver: ({ active, over }) =>
    over === null
      ? `${String(active.id)} is no longer over a drop zone.`
      : `${String(active.id)} is over ${describeOver(over)}.`,
  onDragEnd: ({ active, over }) =>
    over === null
      ? `Dropped ${String(active.id)}. It was not over a drop zone, so nothing changed.`
      : `Dropped ${String(active.id)} on ${describeOver(over)}.`,
  onDragCancel: ({ active }) => `Cancelled dragging ${String(active.id)}.`,
};

// -- main --------------------------------------------------------------------

export function ScopesMapper({
  scopes,
  readOnly,
}: {
  readonly scopes: Record<string, string>;
  readonly readOnly: boolean;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

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

  const assignMutation = useMutation({
    mutationFn: (body: AddUrlToScopeBody) => api.addUrlToScope(body),
    onSuccess: (_data, body) => {
      setPendingScopes((current) => current.filter((id) => id !== body.scope_id));
      invalidateMapperKeys(queryClient, false);
    },
  });
  const removeUrlMutation = useMutation({
    mutationFn: (url: string) => api.removeUrlFromScope({ url }),
    onSuccess: () => {
      invalidateMapperKeys(queryClient, true);
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

  const routes: AuthRoute[] = routesQuery.data;
  const publicUrls = publicQuery.data;
  const slugs = new Set(Object.keys(subMcpQuery.data));
  const publicSet = new Set(publicUrls);

  const groups = scopeGroupsOf(scopes);
  // The public marker is its own Public surface, never a scope zone (the plan
  // forbids a reserved public scope row); a well-behaved backend never lists it
  // as a scope, but exclude it here so a stray entry can never render one.
  groups.delete(PUBLIC_MARKER);
  const realScopeIds = [...groups.keys()].sort();
  const allScopeIds = new Set([...realScopeIds, ...pendingScopes]);

  // `scopes` is the source of truth for "assigned": a route the catalog still
  // reports as `mapped: null` (a stale read during the parallel refetch of the
  // scopes and routes queries after an assign) is excluded the moment it appears
  // in `scopes`, so a url never surfaces in both a scope zone and Unassigned at
  // once (which would register two dnd-kit draggables with the same id).
  const unassignedChips: ChipData[] = [
    ...routes
      .filter(
        (route) => route.mapped === null && !(route.path in scopes) && !publicSet.has(route.path),
      )
      .map((route) => chipFor(route.path, { kind: 'unassigned' }, slugs, route.methods)),
    ...[...slugs]
      .filter((slug) => !(`/app/${slug}` in scopes) && !publicSet.has(`/app/${slug}`))
      .map((slug) => chipFor(`/app/${slug}`, { kind: 'unassigned' }, slugs)),
  ].sort((a, b) => a.url.localeCompare(b.url));

  const publicChips: ChipData[] = [...publicUrls]
    .map((url) => chipFor(url, { kind: 'public' }, slugs))
    .sort((a, b) => a.url.localeCompare(b.url));

  const anyPending = assignMutation.isPending || removeUrlMutation.isPending;
  const interactive = !readOnly && !anyPending;

  const onDragEnd = (event: DragEndEvent): void => {
    dispatchDrop(dropFromDragEvent(event), {
      assign: (body) => {
        assignMutation.mutate(body);
      },
      pin: (url, pattern) => {
        setPinTarget({ url, pattern });
      },
    });
  };

  const removeScopeChip = (data: ChipData): void => {
    if (data.origin.kind !== 'scope') return;
    // Count only the urls the zone actually shows (a url the server has re-pointed
    // public is displayed in the Public zone, not here), so the last-url confirm
    // matches what the operator sees and the delete-scope item count.
    const urls = (groups.get(data.origin.scopeId) ?? []).filter((url) => !publicSet.has(url));
    if (urls.length <= 1) {
      setLastUrlTarget({ scopeId: data.origin.scopeId, url: data.url });
    } else {
      removeUrlMutation.mutate(data.url);
    }
  };

  const mutationError = assignMutation.isError
    ? assignMutation.error
    : removeUrlMutation.isError
      ? removeUrlMutation.error
      : null;

  return (
    <Card>
      <div style={cardHeaderStyle}>
        <h3 style={headingStyle}>Access control</h3>
      </div>

      {mutationError !== null ? (
        <div style={{ marginBottom: 'var(--tai-space-3)' }}>
          <ErrorState message={errorMessage(mutationError)} />
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
        {anyPending ? (
          <div style={overlayStyle}>
            <Spinner label="Saving" />
          </div>
        ) : null}

        <DndContext sensors={sensors} accessibility={{ announcements }} onDragEnd={onDragEnd}>
          {realScopeIds.length === 0 && pendingScopes.length === 0 ? (
            <EmptyState
              title="No scopes"
              description="Create a scope, then drag routes onto it to map them."
            />
          ) : null}

          {realScopeIds.map((scopeId) => {
            // A url the server has re-pointed public belongs to the Public zone
            // only; excluding it here keeps a stale `scopes` read (during the pin
            // refetch) from rendering the same url as a second draggable.
            const urls = (groups.get(scopeId) ?? []).filter((url) => !publicSet.has(url));
            const chips = urls.map((url) => chipFor(url, { kind: 'scope', scopeId }, slugs));
            return (
              <ScopeZone
                key={scopeId}
                zone={{ kind: 'scope', scopeId }}
                title={<Badge variant="primary">{scopeId}</Badge>}
                count={chips.length}
                chips={chips}
                interactive={interactive}
                emptyNote="Drag a route here to map it."
                onRemoveChip={removeScopeChip}
                removeLabelOf={(data) => `Remove URL ${data.url}`}
                headerAction={
                  readOnly ? null : (
                    <Button
                      type="button"
                      variant="danger"
                      aria-label={`Delete scope ${scopeId}`}
                      onClick={() => {
                        setDeleteTarget({ scopeId, itemCount: chips.length });
                      }}
                    >
                      Delete scope
                    </Button>
                  )
                }
                footer={
                  readOnly ? null : (
                    <AddRouteRow
                      scopeId={scopeId}
                      disabled={!interactive}
                      onAdd={(body) => {
                        assignMutation.mutate(body);
                      }}
                    />
                  )
                }
              />
            );
          })}

          {pendingScopes
            .filter((scopeId) => !groups.has(scopeId))
            .map((scopeId) => (
              <ScopeZone
                key={`pending-${scopeId}`}
                zone={{ kind: 'scope', scopeId }}
                title={<Badge variant="neutral">{scopeId}</Badge>}
                headerBadge={<Badge variant="warning">pending</Badge>}
                count={0}
                chips={[]}
                interactive={interactive}
                emptyNote="Saved when the first item is assigned."
                headerAction={
                  readOnly ? null : (
                    <Button
                      type="button"
                      aria-label={`Discard pending scope ${scopeId}`}
                      onClick={() => {
                        setPendingScopes((current) => current.filter((id) => id !== scopeId));
                      }}
                    >
                      Discard
                    </Button>
                  )
                }
                footer={
                  readOnly ? null : (
                    <AddRouteRow
                      scopeId={scopeId}
                      disabled={!interactive}
                      onAdd={(body) => {
                        assignMutation.mutate(body);
                      }}
                    />
                  )
                }
              />
            ))}

          <ScopeZone
            zone={{ kind: 'unassigned' }}
            title={<strong>Unassigned</strong>}
            count={unassignedChips.length}
            chips={unassignedChips}
            interactive={interactive}
            emptyNote="Every route and sub-MCP mount is mapped."
          />

          <ScopeZone
            zone={{ kind: 'public' }}
            title={<strong>Public</strong>}
            headerBadge={<Badge variant="warning">no auth</Badge>}
            count={publicChips.length}
            chips={publicChips}
            interactive={interactive}
            emptyNote="No routes are pinned public."
            footer={
              <p style={publicNoteStyle}>
                Public routes are served without API-key authentication or any scope check. This is
                not a scope.{readOnly ? '' : ' Drop a route here to pin it public.'}
              </p>
            }
            onRemoveChip={
              readOnly
                ? undefined
                : (data) => {
                    setUnpinTarget(data.url);
                  }
            }
            removeLabelOf={(data) => `Unpin ${data.url}`}
          />
        </DndContext>
      </div>

      {pinTarget !== null ? (
        <PinPublicDialog
          url={pinTarget.url}
          pattern={pinTarget.pattern}
          onClose={() => {
            setPinTarget(null);
          }}
        />
      ) : null}
      {unpinTarget !== null ? (
        <UnpinPublicDialog
          url={unpinTarget}
          onClose={() => {
            setUnpinTarget(null);
          }}
        />
      ) : null}
      {lastUrlTarget !== null ? (
        <RemoveLastUrlDialog
          scopeId={lastUrlTarget.scopeId}
          url={lastUrlTarget.url}
          onClose={() => {
            setLastUrlTarget(null);
          }}
        />
      ) : null}
      {deleteTarget !== null ? (
        <DeleteScopeDialog
          scopeId={deleteTarget.scopeId}
          itemCount={deleteTarget.itemCount}
          onClose={() => {
            setDeleteTarget(null);
          }}
        />
      ) : null}
    </Card>
  );
}
