/**
 * Helpers for a preset/tool's list of extension combos, whose elements may carry
 * author `config` (`{ name, config }`) alongside bare-name elements. The editors
 * hold the full config-bearing elements as their value, so config rides through an
 * edit directly; these helpers project a combo to its bare extension names where a
 * name-only view is needed (a picker's selection, a branch-tool name, a badge row)
 * and compare or check combos by those names.
 */
import type { PresetExtensionElement } from '@tai42/api-client';

/** The bare extension name of one combo element (drops any `config`). */
export function extensionElementName(element: PresetExtensionElement): string {
  return typeof element === 'string' ? element : element.name;
}

/** Project a combo's elements to their bare extension names (drops any `config`). */
export function comboElementNames(combo: readonly PresetExtensionElement[]): string[] {
  return combo.map(extensionElementName);
}

/** Two combos are equal when their NAME sequences match (config is not part of identity). */
export function sameNames(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((name, index) => name === b[index]);
}

/** The element names in a combo that are absent from the known catalog. */
export function unknownNames(
  combo: readonly PresetExtensionElement[],
  availableNames: ReadonlySet<string>,
): string[] {
  return comboElementNames(combo).filter((name) => !availableNames.has(name));
}
