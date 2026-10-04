/**
 * Pure join helpers over the member-action catalog. The catalog lists every
 * provider's declared actions as opaque descriptors; a directory row carries the
 * opaque keys of the actions applicable to it. Studio joins the two by key equality
 * and places each by `scope` — it never parses a key or names a provider.
 */
import type {
  MemberActionCatalog,
  MemberActionDescriptor,
  MemberActionScope,
} from '@tai42/api-client';
import type { JsonSchema } from '@tai42/studio-sdk';

/** The declared actions that render as page-level buttons. */
export function pageActions(catalog: MemberActionCatalog): MemberActionDescriptor[] {
  return catalog.actions.filter((action) => action.scope === 'page');
}

/** A `key → descriptor` index for the opaque row-to-action join. */
export function catalogByKey(catalog: MemberActionCatalog): Map<string, MemberActionDescriptor> {
  return new Map(catalog.actions.map((action) => [action.key, action]));
}

/**
 * The descriptors a row offers: each of the row's `action_keys` resolved against the
 * catalog, kept only when the descriptor exists and its `scope` matches the row kind.
 * Row order is preserved; an unknown key (a catalog/directory mismatch) renders
 * nothing rather than a broken control.
 */
export function rowActions(
  byKey: ReadonlyMap<string, MemberActionDescriptor>,
  actionKeys: readonly string[],
  scope: MemberActionScope,
): MemberActionDescriptor[] {
  const actions: MemberActionDescriptor[] = [];
  for (const key of actionKeys) {
    const descriptor = byKey.get(key);
    if (descriptor?.scope === scope) actions.push(descriptor);
  }
  return actions;
}

/** Whether an action declares any input field (so the invoke needs an input form). */
export function schemaHasFields(schema: JsonSchema): boolean {
  const { properties } = schema;
  if (properties === undefined) return false;
  return Object.keys(properties).length > 0;
}
