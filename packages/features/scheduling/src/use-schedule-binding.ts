/**
 * The state-binding data source for the add-schedule dialog: the catalog/template
 * queries, the scheduled tool's schema and inherited binding, folded into a
 * ready-to-spread `bindingProps` for `StateBindingSection` (value/onChange stay local).
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
} from '@tai42/studio-sdk';
import type { StateBinding, StateListItem, StateTemplateListItem } from '@tai42/api-client';

/** The minimal list-query shape the props assembly reads. */
interface ListQueryLike<T> {
  readonly data: readonly T[] | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error: unknown;
}

/** The minimal tool-schema-query shape the props assembly reads. */
interface SchemaQueryLike {
  readonly data: { readonly input?: unknown; readonly output?: unknown } | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
}

/** Assemble the `StateBindingSection` props from the resolved binding queries. */
function bindingSectionProps(args: {
  readonly tool: string | null;
  readonly statesQuery: ListQueryLike<StateListItem>;
  readonly templatesQuery: ListQueryLike<StateTemplateListItem>;
  readonly storageQuery: Parameters<typeof templatedTextCatalog>[0];
  readonly authoredTemplatesQuery: Parameters<typeof templatedTextCatalog>[1];
  readonly schemaQuery: SchemaQueryLike;
  readonly inherited: StateBinding | null;
}) {
  const toolReady = args.tool !== null && args.tool !== '';
  return {
    statesCatalog: statesCatalogFromList(args.statesQuery.data ?? []),
    templatesCatalog: templatesCatalogFromList(args.templatesQuery.data ?? []),
    templatedTextTemplates: templatedTextCatalog(args.storageQuery, args.authoredTemplatesQuery),
    inherited: args.inherited,
    sources: {
      input: fieldPathsFromSchema(args.schemaQuery.data?.input),
      output: fieldPathsFromSchema(args.schemaQuery.data?.output),
      loading: toolReady && args.schemaQuery.isPending,
      error: args.schemaQuery.isError ? "Couldn't load the tool's fields." : undefined,
    },
    loading: args.statesQuery.isPending || args.templatesQuery.isPending,
    error:
      args.statesQuery.isError || args.templatesQuery.isError
        ? errorMessage(args.statesQuery.error ?? args.templatesQuery.error)
        : undefined,
  };
}

/** The catalog/schema queries for a scheduled tool's binding, reduced to the props
 *  `StateBindingSection` needs. `value`/`onChange` are owned by the dialog. */
export function useScheduleBinding(tool: string | null) {
  const api = useApi();

  const bindingStatesQuery = useQuery({
    queryKey: statesListKey,
    queryFn: ({ signal }) => api.listStates(signal),
  });
  const bindingTemplatesQuery = useQuery({
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
  // The scheduled tool's schema feeds the binding editor's field pickers.
  const toolSchemaQuery = useQuery({
    queryKey: ['state-binding', 'tool-schema', tool],
    queryFn: ({ signal }) => api.getToolSchema(tool ?? '', signal),
    enabled: tool !== null && tool !== '',
  });
  // When the scheduled tool is a preset, its own binding is inherited (this door's
  // binding overrides it per state).
  const bindingPresetsQuery = useQuery({
    queryKey: ['state-binding', 'presets'],
    queryFn: ({ signal }) => api.listPresets(signal),
  });
  const toolIsPreset = bindingPresetsQuery.data?.some((p) => p.name === tool) ?? false;
  const toolVersionsQuery = useQuery({
    queryKey: ['state-binding', 'preset-versions', tool],
    queryFn: ({ signal }) => api.listPresetVersions(tool ?? '', signal),
    enabled: toolIsPreset && tool !== null && tool !== '',
  });
  const inheritedBinding =
    toolVersionsQuery.data?.find((v) => v.is_current)?.body.state_binding ?? null;

  const bindingProps = bindingSectionProps({
    tool,
    statesQuery: bindingStatesQuery,
    templatesQuery: bindingTemplatesQuery,
    storageQuery,
    authoredTemplatesQuery,
    schemaQuery: toolSchemaQuery,
    inherited: inheritedBinding,
  });

  return { bindingProps };
}
