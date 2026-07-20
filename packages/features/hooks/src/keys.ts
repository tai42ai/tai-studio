/**
 * TanStack Query key factory for the hooks surface. The hook list is keyed
 * `['hooks', topic]` so changing the topic filter is a distinct key that
 * refetches; an empty topic string is the "list all" variant. Post-mutation
 * invalidation targets every variant by matching the `'hooks'` root, so a
 * register or unregister refreshes the list regardless of the active filter.
 */

/** The shared root segment every hooks-list key starts with. */
export const HOOKS_KEY_ROOT = 'hooks' as const;

/** Key for the hook list under a given topic filter (empty string = list all). */
export function hooksListKey(topic: string): readonly [typeof HOOKS_KEY_ROOT, string] {
  return [HOOKS_KEY_ROOT, topic];
}

/**
 * Key for the registered webhook-verifier catalog (the bind picker's source). It
 * sits under its OWN root, distinct from {@link HOOKS_KEY_ROOT}: the catalog is a
 * server-fixed registry that a bind/unbind never changes, so the list-invalidation
 * a bind fires must not needlessly refetch it.
 */
export const hookVerifiersKey = ['hook-verifiers'] as const;
