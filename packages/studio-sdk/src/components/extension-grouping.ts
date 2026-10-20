/**
 * Pure catalog-shaping helpers for the extensions surface. Kept free of React so
 * the grouping logic is unit-tested directly.
 *
 * The `/api/extensions` catalog is a flat list of `{ name, kind, multiple }` entries,
 * one per registered extension. `groupByKind` groups the catalog by extension KIND,
 * each group carrying the served `multiple` flag of its kind — the grouping the
 * `ExtensionPicker` and the read-only extensions catalog (`features/extensions`)
 * both render.
 * `kindVariant` maps each serialized `kind` value to a design-system Badge variant.
 */
import type { Extension } from '@tai42/api-client';

import type { BadgeProps } from './badge';

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
 * Group a flat extension list by `kind`. Groups are ordered by
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
