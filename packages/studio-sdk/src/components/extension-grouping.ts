/**
 * Pure catalog-shaping helpers for the extension catalog: `groupByKind` groups the flat
 * `{ name, kind, multiple }` list by kind, each group carrying its kind's served
 * `multiple` flag. Kept free of React so it is unit-tested directly.
 */
import type { Extension } from '@tai42/api-client';

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
