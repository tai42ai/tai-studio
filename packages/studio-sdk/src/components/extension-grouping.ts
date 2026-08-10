/**
 * Pure catalog-shaping helpers for the extensions surface — the SHARED grouping
 * source for both the read-only extensions catalog (`features/extensions`) and the
 * `ExtensionPicker`. Kept free of React so the grouping logic is unit-tested
 * directly.
 *
 * The `/api/extensions` catalog is a flat list of `{ name, kind }` entries. Two
 * independent groupings live here:
 *  - `groupIntoFamilies` groups a tool's composed branch VARIANTS (which share a
 *    base tool name and append underscore suffixes — `tool`, `tool_a`, `tool_a_b`)
 *    back into one FAMILY keyed by that base name (the catalog view);
 *  - `groupByKind` groups the catalog by extension KIND (the picker view), where
 *    the `backend` kind is the single non-stackable one.
 * `kindVariant` maps each serialized `kind` value to a design-system Badge variant.
 */
import type { Extension } from '@tai42/api-client';

import type { BadgeProps } from './badge';

/**
 * The single non-stackable extension kind: at most one `backend` extension may
 * appear in a combo (the `backend` kind is declared non-stackable, `multiple=False`).
 * The `ExtensionPicker` enforces single-select for this kind.
 */
export const NON_STACKABLE_KIND = 'backend';

/** One base tool and every extension entry that branches from it. */
export interface ExtensionFamily {
  /** The base tool name (the segment before the first underscore). */
  readonly base: string;
  /** The family's entries, ordered by full name. */
  readonly members: readonly Extension[];
}

/** One extension `kind` and every catalog entry of that kind. */
export interface ExtensionKindGroup {
  /** The serialized kind value (`wrapper` / `transformer` / `backend`). */
  readonly kind: string;
  /** Whether this kind is non-stackable (single-select in the picker). */
  readonly nonStackable: boolean;
  /** The kind's entries, ordered by name. */
  readonly members: readonly Extension[];
}

/**
 * The base tool name a variant belongs to: the substring before the first
 * underscore, or the whole name when it has none. `tool`, `tool_a`, `tool_a_b`
 * all resolve to `tool`; `x_chain` and `x_batch` both resolve to `x`.
 */
export function baseNameOf(name: string): string {
  const separator = name.indexOf('_');
  return separator === -1 ? name : name.slice(0, separator);
}

/**
 * Group a flat extension list into families keyed by base tool name. Families
 * are ordered by base name and each family's members by full name, so the render
 * order is stable regardless of the server's list order.
 */
export function groupIntoFamilies(extensions: readonly Extension[]): ExtensionFamily[] {
  const byBase = new Map<string, Extension[]>();
  for (const extension of extensions) {
    const base = baseNameOf(extension.name);
    const members = byBase.get(base);
    if (members) {
      members.push(extension);
    } else {
      byBase.set(base, [extension]);
    }
  }
  return [...byBase.entries()]
    .map(([base, members]) => ({
      base,
      members: [...members].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.base.localeCompare(b.base));
}

/**
 * Group a flat extension list by `kind`, for the picker. Groups are ordered by
 * kind and each group's members by name, so the render order is stable regardless
 * of the server's list order. The `backend` group is flagged non-stackable.
 */
export function groupByKind(extensions: readonly Extension[]): ExtensionKindGroup[] {
  const byKind = new Map<string, Extension[]>();
  for (const extension of extensions) {
    const members = byKind.get(extension.kind);
    if (members) {
      members.push(extension);
    } else {
      byKind.set(extension.kind, [extension]);
    }
  }
  return [...byKind.entries()]
    .map(([kind, members]) => ({
      kind,
      nonStackable: kind === NON_STACKABLE_KIND,
      members: [...members].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.kind.localeCompare(b.kind));
}

/**
 * Map a serialized extension `kind` to a Badge variant. Known skeleton kinds get
 * a themed color; any unrecognized kind falls back to the neutral variant (the
 * Badge itself also neutral-fallbacks, but choosing here keeps the mapping
 * explicit and testable).
 */
export function kindVariant(kind: string): NonNullable<BadgeProps['variant']> {
  const known: Record<string, NonNullable<BadgeProps['variant']>> = {
    wrapper: 'primary',
    transformer: 'success',
    backend: 'warning',
  };
  return known[kind] ?? 'neutral';
}
