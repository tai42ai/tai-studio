/**
 * Pure catalog helpers — resolve the template jq an attached state offers, with the
 * name-collision rule shared by every layer: an unqualified name that TWO attached
 * templates declare is ambiguous, so both are offered attachment-qualified as
 * `template.name`; a name only one template declares stays bare.
 */
import { encodeTemplateSegment } from './adapter';
import type { BindingTemplateJqOption, BindingTemplateOption } from './types';

/** One template jq of an attached template, resolved to the reference a binding stores. */
export interface ResolvedTemplateJq extends BindingTemplateJqOption {
  /** The owning template. */
  readonly template: string;
  /** The reference a binding writes: `name`, or `template.name` when ambiguous. */
  readonly ref: string;
}

/**
 * Every template jq the given attached templates offer for a purpose (or all
 * purposes when `purpose` is omitted), each carrying the reference a binding stores.
 */
export function resolveTemplateJq(
  templateNames: readonly string[],
  catalog: readonly BindingTemplateOption[],
  purpose?: 'input' | 'update',
): ResolvedTemplateJq[] {
  const chosen = catalog.filter((template) => templateNames.includes(template.name));
  const counts = new Map<string, number>();
  for (const template of chosen) {
    for (const jq of template.templateJq) {
      if (purpose !== undefined && jq.purpose !== purpose) continue;
      counts.set(jq.name, (counts.get(jq.name) ?? 0) + 1);
    }
  }
  const resolved: ResolvedTemplateJq[] = [];
  for (const template of chosen) {
    for (const jq of template.templateJq) {
      if (purpose !== undefined && jq.purpose !== purpose) continue;
      const ambiguous = (counts.get(jq.name) ?? 0) > 1;
      resolved.push({
        ...jq,
        template: template.name,
        ref: ambiguous ? `${template.name}.${jq.name}` : jq.name,
      });
    }
  }
  return resolved;
}

/** Find one resolved template jq by the reference a binding stores. */
export function findByRef(
  ref: string,
  resolved: readonly ResolvedTemplateJq[],
): ResolvedTemplateJq | undefined {
  return resolved.find((entry) => entry.ref === ref);
}

/**
 * Resolve a jq call name (`enc(template)__name`, or a bare `name`) back to the catalog
 * ref, driven by the catalog — never by string splitting, since a jq name may carry its
 * own `__` past the template boundary and `enc` maps `-`→`_`. Under the template-slug
 * invariant (no consecutive/trailing hyphens ⇒ `enc(template)` has no `__` and no
 * trailing `_`) the FIRST `__` is the one true boundary, so the longest encoded-template
 * prefix whose remainder is a jq the template declares is the unique qualified match;
 * failing that, a bare name a single template declares. `null` when nothing claims it.
 */
export function resolveCallName(
  callName: string,
  catalog: readonly BindingTemplateOption[],
): string | null {
  let bestRef: string | null = null;
  let bestPrefixLength = -1;
  for (const template of catalog) {
    const prefix = `${encodeTemplateSegment(template.name)}__`;
    if (!callName.startsWith(prefix)) continue;
    const jqName = callName.slice(prefix.length);
    if (template.templateJq.some((jq) => jq.name === jqName) && prefix.length > bestPrefixLength) {
      bestRef = `${template.name}.${jqName}`;
      bestPrefixLength = prefix.length;
    }
  }
  if (bestRef !== null) return bestRef;
  for (const template of catalog) {
    if (template.templateJq.some((jq) => jq.name === callName)) return callName;
  }
  return null;
}
