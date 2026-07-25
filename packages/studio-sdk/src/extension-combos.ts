/**
 * Helpers for a preset/tool's list of extension combos, whose elements may carry
 * author `config` (`{ name, config }`) alongside bare-name elements. The editors
 * hold the full config-bearing elements as their value, so config rides through an
 * edit directly; these helpers project a combo to its bare extension names where a
 * name-only view is needed (a picker's selection, a branch-tool name, a badge row).
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
