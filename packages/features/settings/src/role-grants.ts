/**
 * The pure role model behind the Roles tab: the feature-group derivation from the
 * route catalog, the effective per-tag levels, and the tier/dirty helpers.
 */
import type { AuthRoute, GrantLevel, RoleBody, RoleGrants } from '@tai42/api-client';

/** The reserved permanent role; its grant map is un-editable and it is undeletable. */
export const RESERVED_ADMIN_ROLE = 'admin';

/** The tri-state grant levels, low→high — the selector options and the display order. */
export const GRANT_LEVELS: readonly GrantLevel[] = ['none', 'read', 'write'];

/** Whether a route's action class is GRANTABLE (a per-tag level opens it). */
export function isGrantableAction(action: AuthRoute['action']): boolean {
  return action === 'read' || action === 'write';
}

/** Whether a route's action class is ADMIN-ONLY (fenced/secret; never grantable). */
export function isFencedAction(action: AuthRoute['action']): boolean {
  return action === 'fenced' || action === 'secret';
}

/** One feature group: a tag, the routes that carry it, and its grantability. */
export interface FeatureGroup {
  readonly tag: string;
  readonly routes: readonly AuthRoute[];
  /** At least one route under the tag is `read`/`write` — the tag gets a tri-state. */
  readonly grantable: boolean;
  /** At least one route under the tag is `fenced`/`secret` — those are admin-only. */
  readonly hasFenced: boolean;
}

/**
 * Group the route catalog into feature groups keyed by `tags`. A route joins every
 * one of its tags' groups; a route carrying no tags (an unregistered/ungated path)
 * contributes nothing. Groups are sorted by tag; each group's routes keep a stable
 * (method, path) order so the read-only route detail renders deterministically.
 */
export function featureGroupsOf(routes: readonly AuthRoute[]): FeatureGroup[] {
  const byTag = new Map<string, AuthRoute[]>();
  for (const route of routes) {
    for (const tag of route.tags) {
      const list = byTag.get(tag) ?? [];
      list.push(route);
      byTag.set(tag, list);
    }
  }
  return [...byTag.entries()]
    .map(([tag, groupRoutes]): FeatureGroup => {
      const sorted = [...groupRoutes].sort(
        (a, b) => a.path.localeCompare(b.path) || a.methods.join().localeCompare(b.methods.join()),
      );
      return {
        tag,
        routes: sorted,
        grantable: sorted.some((route) => isGrantableAction(route.action)),
        hasFenced: sorted.some((route) => isFencedAction(route.action)),
      };
    })
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

/**
 * The role's effective level on each grantable feature group — the SAME per-tag
 * answer the gate reads: a granted level, or `none` when the role names no level
 * for the group (fail-closed; a brand-new group defaults here). An `allow_all`
 * (admin) role is not level-governed — it reaches everything — so this is not
 * meaningful for it (the caller shows a full-access note instead).
 */
export function effectiveLevelsOf(
  grants: RoleGrants,
  grantableTags: readonly string[],
): Record<string, GrantLevel> {
  const levels: Record<string, GrantLevel> = {};
  for (const tag of grantableTags) levels[tag] = grants[tag] ?? 'none';
  return levels;
}

/** The security-tier badge text for a role's read-only base-tier ceiling. */
export function baseTierLabel(role: Pick<RoleBody, 'allow_all' | 'base_tier'>): string {
  if (role.allow_all) return 'admin — full';
  if (role.base_tier === 'editor') return 'editor base';
  if (role.base_tier === 'viewer') return 'viewer base';
  return role.base_tier === null ? 'custom base' : `${role.base_tier} base`;
}

/** Whether two grant maps are equal over the given tags (the save dirty check). */
export function grantsEqual(a: RoleGrants, b: RoleGrants, tags: readonly string[]): boolean {
  return tags.every((tag) => (a[tag] ?? 'none') === (b[tag] ?? 'none'));
}

/**
 * A stable signature of a role's persisted grant map — it changes whenever the stored
 * grants change (a save, or an external rollback that re-points the role under the same
 * name). The grant editor re-seeds its draft from the new baseline whenever it moves,
 * so a rollback is never silently re-PUT away with a pre-rollback draft.
 */
export function grantsSignature(grants: RoleGrants): string {
  return Object.entries(grants)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tag, level]) => `${tag}=${level}`)
    .join('&');
}
