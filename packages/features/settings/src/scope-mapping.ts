/**
 * The pure scope ↔ URL mapping logic behind the access-control mapper: grouping the
 * scope map, resolving what a drag-drop does, and invalidating the source surface
 * after a mutation.
 */
import type { DragEndEvent } from '@dnd-kit/core';
import type { AddUrlToScopeBody, AuthRoute, SubMcpMount } from '@tai42/api-client';
import type { QueryClient } from '@tanstack/react-query';

import { authRoutesKey, publicRoutesKey, scopesKey, tokensPayloadKey } from './keys';
import type { ChipData, ZoneRef } from './ScopeItemChip';

/**
 * The registered sub-MCP mounts keyed by slug, each with the served `mount_url` and
 * `access_pattern` the mapper maps it by (the `listSubMcp` read).
 */
export type SubMcpMounts = Readonly<Record<string, SubMcpMount>>;

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

/** The live sub-MCP mount served at `url` (its served `mount_url`), else `null`. */
export function mountForUrl(url: string, mounts: SubMcpMounts): SubMcpMount | null {
  return Object.values(mounts).find((mount) => mount.mount_url === url) ?? null;
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
  const pattern = active.accessPattern ?? undefined;
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

/**
 * Build a chip payload for a url living in the given origin zone. A url a live sub-MCP
 * is served at is a `sub-mcp` chip carrying the mount's served access pattern.
 */
export function chipFor(
  url: string,
  origin: ZoneRef,
  mounts: SubMcpMounts,
  methods: readonly string[] = [],
): ChipData {
  const mount = mountForUrl(url, mounts);
  return mount === null
    ? { url, itemType: 'route', accessPattern: null, origin, methods }
    : { url, itemType: 'sub-mcp', accessPattern: mount.access_pattern, origin, methods };
}

/** The urls a real scope zone actually shows — its group urls minus any pinned public. */
export function scopeUrls(
  groups: Map<string, string[]>,
  scopeId: string,
  publicSet: ReadonlySet<string>,
): string[] {
  return (groups.get(scopeId) ?? []).filter((url) => !publicSet.has(url));
}

/** The derived chip surface the mapper renders: the real scope groups and each bucket. */
export interface MapperChips {
  readonly groups: Map<string, string[]>;
  readonly publicSet: Set<string>;
  readonly realScopeIds: string[];
  readonly unassignedChips: ChipData[];
  readonly publicChips: ChipData[];
}

/**
 * Derive the mapper's chip surface from the source reads. `scopes` is the source of
 * truth for "assigned": a route the catalog still reports `mapped: null` (a stale
 * read during the parallel refetch after an assign) is excluded the moment it
 * appears in `scopes`, so a url never surfaces in both a scope zone and Unassigned
 * at once (which would register two dnd-kit draggables with the same id). A url the
 * server has re-pointed public belongs to the Public zone only. `publicId` is the
 * served public marker, never a scope.
 */
export function deriveMapperChips(
  scopes: Record<string, string>,
  routes: readonly AuthRoute[],
  publicUrls: readonly string[],
  mounts: SubMcpMounts,
  publicId: string,
): MapperChips {
  const groups = scopeGroupsOf(scopes);
  // The public marker is its own Public surface, never a scope zone; a well-behaved
  // backend never lists it as a scope, but exclude a stray entry here.
  groups.delete(publicId);
  const realScopeIds = [...groups.keys()].sort();
  const publicSet = new Set(publicUrls);

  const unassignedChips: ChipData[] = [
    ...routes
      .filter(
        (route) => route.mapped === null && !(route.path in scopes) && !publicSet.has(route.path),
      )
      .map((route) => chipFor(route.path, { kind: 'unassigned' }, mounts, route.methods)),
    ...Object.values(mounts)
      .filter((mount) => !(mount.mount_url in scopes) && !publicSet.has(mount.mount_url))
      .map((mount) => chipFor(mount.mount_url, { kind: 'unassigned' }, mounts)),
  ].sort((a, b) => a.url.localeCompare(b.url));

  const publicChips: ChipData[] = [...publicUrls]
    .map((url) => chipFor(url, { kind: 'public' }, mounts))
    .sort((a, b) => a.url.localeCompare(b.url));

  return { groups, publicSet, realScopeIds, unassignedChips, publicChips };
}

/** Invalidate the mapper's coherent source surface after a successful mutation. */
export function invalidateMapperKeys(queryClient: QueryClient, policyCascade: boolean): void {
  void queryClient.invalidateQueries({ queryKey: scopesKey });
  void queryClient.invalidateQueries({ queryKey: authRoutesKey });
  void queryClient.invalidateQueries({ queryKey: publicRoutesKey });
  if (policyCascade) void queryClient.invalidateQueries({ queryKey: tokensPayloadKey });
}
