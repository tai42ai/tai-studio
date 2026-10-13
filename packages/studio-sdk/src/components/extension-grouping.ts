/**
 * Pure catalog-shaping helpers for the extensions surface — the SHARED grouping
 * source for both the read-only extensions catalog (`features/extensions`) and the
 * `ExtensionPicker`. Kept free of React so the grouping logic is unit-tested
 * directly.
 *
 * The `/api/extensions` catalog is a flat list of `{ name, kind, multiple }` entries. Two
 * independent groupings live here:
 *  - `groupIntoFamilies` groups a tool's composed branch VARIANTS (which share a
 *    base tool name and append underscore suffixes — `tool`, `tool_a`, `tool_a_b`)
 *    back into one FAMILY keyed by that base name (the catalog view);
 *  - `groupByKind` groups the catalog by extension KIND (the picker view), each
 *    group carrying the served `multiple` flag of its kind.
 * `kindVariant` maps each serialized `kind` value to a design-system Badge variant.
 */
import type { Extension } from '@tai42/api-client';

import type { BadgeProps } from './badge';

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
  /** Whether a combo may carry several extensions of this kind; `false` is single-select
   *  in the picker. Served per kind by the catalog. */
  readonly multiple: boolean;
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
 * of the server's list order. Each group carries its kind's served `multiple`; a kind
 * whose entries disagree is a catalog fault and throws.
 */
export function groupByKind(extensions: readonly Extension[]): ExtensionKindGroup[] {
  const byKind = new Map<string, { multiple: boolean; members: Extension[] }>();
  for (const extension of extensions) {
    const group = byKind.get(extension.kind);
    if (group === undefined) {
      byKind.set(extension.kind, { multiple: extension.multiple, members: [extension] });
      continue;
    }
    if (group.multiple !== extension.multiple) {
      throw new Error(
        `extension kind ${extension.kind} is served as both single- and multi-select`,
      );
    }
    group.members.push(extension);
  }
  return [...byKind.entries()]
    .map(([kind, group]) => ({
      kind,
      multiple: group.multiple,
      members: [...group.members].sort((a, b) => a.name.localeCompare(b.name)),
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
