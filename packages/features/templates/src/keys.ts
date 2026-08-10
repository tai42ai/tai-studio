/**
 * TanStack Query key factory for the templates surface. The master list is
 * keyed `['templates']`; a single template's detail is keyed `['template', id]`.
 * Centralising the keys keeps the query definitions and the post-mutation
 * invalidations referring to the exact same tuples.
 */

/** Key for the master template-name list. */
export const templatesListKey = ['templates'] as const;

/** Key for a single template's detail, by its id/path. */
export function templateDetailKey(templateId: string): readonly ['template', string] {
  return ['template', templateId];
}

/** Key for the storage-provider presence gate (templates are stored through it).
 *  Same tuple the storage page uses, so both share one request. */
export const storageInfoKey = ['storage', 'info'] as const;
