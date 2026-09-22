/**
 * The server data the register form reads: the api-key list it runs as, the full
 * hooks list (overwrite detection), the templated-text template catalog, the
 * conversation targets a subject may point at, and the state-binding editor's
 * catalogs, inherited binding and tool-schema field sources. Every fetch is a
 * shared React Query so the page serves each once.
 */
import type { HookList, TokensPayload } from '@tai42/api-client';
import {
  errorMessage,
  fieldPathsFromSchema,
  type StateBindingEditorProps,
  statesCatalogFromList,
  statesListKey,
  stateTemplatesKey,
  templatedTextCatalog,
  templatesCatalogFromList,
  useApi,
} from '@tai42/studio-sdk';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';

import { hooksListKey } from './keys';
import { useExecutionKeys } from './use-execution-keys';

type TemplatedTextTemplates = ReturnType<typeof templatedTextCatalog>;
type StateBindingProps = Omit<StateBindingEditorProps, 'value' | 'onChange'>;

export interface HookFormData {
  readonly hooksQuery: UseQueryResult<HookList>;
  readonly keysQuery: UseQueryResult<TokensPayload>;
  readonly existingNames: ReadonlySet<string>;
  readonly templatedTextTemplates: TemplatedTextTemplates;
  readonly targetOptions: readonly { readonly value: string; readonly label: string }[];
  readonly stateBinding: StateBindingProps;
}

/** The stored templates the condition/expr id pickers offer — gated on a storage
 * backend being present (the list door 500s without one). */
function useTemplatedTextTemplates(): TemplatedTextTemplates {
  const api = useApi();
  const storageQuery = useQuery({
    queryKey: ['storage', 'info'],
    queryFn: ({ signal }) => api.getStorageInfo(signal),
  });
  const templatesQuery = useQuery({
    queryKey: ['templates', 'names'],
    queryFn: ({ signal }) => api.listTemplates(signal),
    enabled: storageQuery.data?.present === true,
  });
  return templatedTextCatalog(storageQuery, templatesQuery);
}

type QueryLike<T> = Pick<UseQueryResult<T>, 'data' | 'isPending' | 'isError' | 'error'>;

/** The tool-schema field sources a binding picker offers when a schema is known. */
function bindingSources(
  schemaQuery: QueryLike<{ input?: unknown; output?: unknown }>,
  trimmedTool: string,
): NonNullable<StateBindingProps['sources']> {
  return {
    input: fieldPathsFromSchema(schemaQuery.data?.input),
    output: fieldPathsFromSchema(schemaQuery.data?.output),
    loading: trimmedTool !== '' && schemaQuery.isPending,
    error: schemaQuery.isError ? "Couldn't load the tool's fields." : undefined,
  };
}

/** The catalog fetch's error message, or `undefined` when both catalogs are fine. */
function catalogError(
  states: QueryLike<unknown>,
  templates: QueryLike<unknown>,
): string | undefined {
  if (!states.isError && !templates.isError) return undefined;
  return errorMessage(states.error ?? templates.error);
}

/** The state-binding editor's catalogs, inherited binding and tool-schema sources. */
function useStateBindingProps(
  tool: string,
  templatedTextTemplates: TemplatedTextTemplates,
): StateBindingProps {
  const api = useApi();
  const trimmedTool = tool.trim();
  const statesQuery = useQuery({
    queryKey: statesListKey,
    queryFn: ({ signal }) => api.listStates(signal),
  });
  const templatesQuery = useQuery({
    queryKey: stateTemplatesKey,
    queryFn: ({ signal }) => api.listStateTemplates(signal),
  });
  const schemaQuery = useQuery({
    queryKey: ['state-binding', 'tool-schema', tool],
    queryFn: ({ signal }) => api.getToolSchema(trimmedTool, signal),
    enabled: trimmedTool !== '',
  });
  const presetsQuery = useQuery({
    queryKey: ['state-binding', 'presets'],
    queryFn: ({ signal }) => api.listPresets(signal),
  });
  const toolIsPreset = presetsQuery.data?.some((p) => p.name === trimmedTool) ?? false;
  const versionsQuery = useQuery({
    queryKey: ['state-binding', 'preset-versions', trimmedTool],
    queryFn: ({ signal }) => api.listPresetVersions(trimmedTool, signal),
    enabled: toolIsPreset && trimmedTool !== '',
  });

  return {
    statesCatalog: statesCatalogFromList(statesQuery.data ?? []),
    templatesCatalog: templatesCatalogFromList(templatesQuery.data ?? []),
    templatedTextTemplates,
    inherited: versionsQuery.data?.find((v) => v.is_current)?.body.state_binding ?? null,
    sources: bindingSources(schemaQuery, trimmedTool),
    loading: statesQuery.isPending || templatesQuery.isPending,
    error: catalogError(statesQuery, templatesQuery),
  };
}

/** The conversation targets a subject may point at; fetched only while the group is open. */
function useConversationTargets(
  subjectOpen: boolean,
): readonly { readonly value: string; readonly label: string }[] {
  const api = useApi();
  const targetsQuery = useQuery({
    queryKey: ['hooks', 'conversation-targets'],
    queryFn: ({ signal }) => api.listConversationRoutes(signal),
    enabled: subjectOpen,
  });
  return (targetsQuery.data?.items ?? []).map((route) => ({
    value: `${route.target_kind}:${route.target_name}`,
    label: `${route.target_kind} · ${route.target_name}`,
  }));
}

export function useHookFormData({
  tool,
  subjectOpen,
}: {
  readonly tool: string;
  readonly subjectOpen: boolean;
}): HookFormData {
  const api = useApi();
  const templatedTextTemplates = useTemplatedTextTemplates();
  const stateBinding = useStateBindingProps(tool, templatedTextTemplates);
  const targetOptions = useConversationTargets(subjectOpen);
  const keysQuery = useExecutionKeys();
  const hooksQuery = useQuery({
    queryKey: hooksListKey(''),
    queryFn: ({ signal }) => api.listHooks(undefined, signal),
  });
  const existingNames = useMemo(
    () => new Set((hooksQuery.data?.items ?? []).map((h) => h.name)),
    [hooksQuery.data],
  );

  return {
    hooksQuery,
    keysQuery,
    existingNames,
    templatedTextTemplates,
    targetOptions,
    stateBinding,
  };
}
