/**
 * Map the api-client's list shapes into the editor's catalogs, so every door screen
 * feeds `StateBindingEditor` the same way. Pure data transforms; the api-client types
 * are imported type-only (this package keeps no runtime edge to the client).
 */
import type { StateListItem, StateTemplateListItem } from '@tai42/api-client';

import type {
  BindingStateOption,
  BindingTemplateJqOption,
  BindingTemplateOption,
  SchemaFieldPath,
} from './types';

/** The template catalog (with each template's template jq) from `listStateTemplates()`. */
export function templatesCatalogFromList(
  items: readonly StateTemplateListItem[],
): BindingTemplateOption[] {
  return items.map((item) => {
    const templateJq: BindingTemplateJqOption[] =
      item.template_jq === null
        ? []
        : Object.entries(item.template_jq).map(([name, jq]) => ({
            name,
            purpose: jq.purpose,
            description: jq.description,
            params: jq.params,
            writes: jq.writes,
          }));
    return { name: item.name, description: item.description, templateJq };
  });
}

/** The states catalog from `listStates()`; per-state attachments are resolved lazily elsewhere. */
export function statesCatalogFromList(states: readonly StateListItem[]): BindingStateOption[] {
  return states.map((state) => ({ name: state.name }));
}

/**
 * Flatten a JSON schema's `properties` into selectable field paths (top-level and
 * every nested object level), each labelled with its dotted path — the picker source
 * for the adapter's `output`/`input` roots. A non-object or property-less schema
 * yields no fields (the field control then falls back to a free path input).
 */
export function fieldPathsFromSchema(schema: unknown): SchemaFieldPath[] {
  const out: SchemaFieldPath[] = [];
  const walk = (node: unknown, prefix: readonly string[]): void => {
    if (typeof node !== 'object' || node === null) return;
    const props = (node as { properties?: unknown }).properties;
    if (typeof props !== 'object' || props === null) return;
    for (const [key, child] of Object.entries(props as Record<string, unknown>)) {
      const path = [...prefix, key];
      out.push({ path, label: path.join('.') });
      walk(child, path);
    }
  };
  walk(schema, []);
  return out;
}
