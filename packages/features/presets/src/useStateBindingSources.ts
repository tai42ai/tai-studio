/**
 * The state-binding editor's data sources: the states + templates catalogs, the
 * stored-template list (gated on a storage backend), and the base tool's declared
 * input/output field paths. Backs the `StateBindingSection` on both the create form
 * and the save-version dialog, so its wiring lives in one place.
 */
import { useQuery } from '@tanstack/react-query';

import {
  errorMessage,
  fieldPathsFromSchema,
  statesCatalogFromList,
  templatesCatalogFromList,
  statesListKey,
  stateTemplatesKey,
  templatedTextCatalog,
  useApi,
  type BindingSourceSchemas,
  type JsonSchema,
} from '@tai42/studio-sdk';

/** The prop bundle a `StateBindingSection` consumes (minus `value`/`onChange`). */
export type StateBindingSources = ReturnType<typeof useStateBindingSources>;

export function useStateBindingSources(base: string | null, outputSchema: JsonSchema | null) {
  const api = useApi();

  const statesQuery = useQuery({
    queryKey: statesListKey,
    queryFn: ({ signal }) => api.listStates(signal),
  });
  const templatesQuery = useQuery({
    queryKey: stateTemplatesKey,
    queryFn: ({ signal }) => api.listStateTemplates(signal),
  });
  // The stored templates a binding's templated-text jq slots may reference by id —
  // gated on a storage backend being present (the list door 500s without one; a
  // storage-free deployment is supported). Presence is the shared `['storage', 'info']`
  // query the templates/storage screens read, so React Query serves it once.
  const storageQuery = useQuery({
    queryKey: ['storage', 'info'],
    queryFn: ({ signal }) => api.getStorageInfo(signal),
  });
  const authoredTemplatesQuery = useQuery({
    queryKey: ['templates', 'names'],
    queryFn: ({ signal }) => api.listTemplates(signal),
    enabled: storageQuery.data?.present === true,
  });
  // The base tool's declared input/output schema feeds the binding editor's field
  // pickers (the run input/output roots). The preset's own output_schema, when set,
  // narrows the output root.
  const baseSchemaQuery = useQuery({
    queryKey: ['state-binding', 'tool-schema', base],
    queryFn: ({ signal }) => api.getToolSchema(base ?? '', signal),
    enabled: base !== null && base !== '',
  });

  const sources: BindingSourceSchemas = {
    input: fieldPathsFromSchema(baseSchemaQuery.data?.input),
    output: fieldPathsFromSchema(outputSchema ?? baseSchemaQuery.data?.output),
    loading: base !== null && base !== '' && baseSchemaQuery.isPending,
    error: baseSchemaQuery.isError ? "Couldn't load the tool's fields." : undefined,
  };

  return {
    statesCatalog: statesCatalogFromList(statesQuery.data ?? []),
    templatesCatalog: templatesCatalogFromList(templatesQuery.data ?? []),
    templatedTextTemplates: templatedTextCatalog(storageQuery, authoredTemplatesQuery),
    sources,
    loading: statesQuery.isPending || templatesQuery.isPending,
    error:
      statesQuery.isError || templatesQuery.isError
        ? errorMessage(statesQuery.error ?? templatesQuery.error)
        : undefined,
  };
}
