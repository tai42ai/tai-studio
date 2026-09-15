/**
 * The create-preset base-picker's enrichment layer: the tool / preset / tag / overlay
 * / agent / base-schema reads and the memos derived from them (grouping tags, the
 * "(agent)" label set, declared badges, the base-exclusion list, the kwargs hint).
 * None is load-bearing, so a failure surfaces loudly (`enrichmentFailed`) but keeps
 * the form usable — never a silently ungrouped, unlabelled picker.
 */
import { hiddenToolNames, toolBadgesByName, useApi, useToolDisplayNames } from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  presetAgentsKey,
  presetSchemaKey,
  presetsListKey,
  presetToolMetaKey,
  presetToolsKey,
  presetToolTagsKey,
} from './keys';
import { inputFieldNames } from './preset-body';

/** The base-picker's enrichment reads plus their derived maps. */
export type PresetToolCatalog = ReturnType<typeof usePresetToolCatalog>;

export function usePresetToolCatalog(base: string | null) {
  const api = useApi();
  const displayNames = useToolDisplayNames();

  const toolsQuery = useQuery({ queryKey: presetToolsKey, queryFn: () => api.listTools() });
  const presetsQuery = useQuery({ queryKey: presetsListKey, queryFn: () => api.listPresets() });
  const tagsQuery = useQuery({ queryKey: presetToolTagsKey, queryFn: () => api.listToolTags() });
  const toolMetaQuery = useQuery({
    queryKey: presetToolMetaKey,
    queryFn: () => api.listToolMeta(),
  });
  // ALL agents (not just spec-runnable) — the picker labels any agent run tool so an
  // author knows a base is an agent. An agent run tool is still a legal base.
  const agentsQuery = useQuery({ queryKey: presetAgentsKey, queryFn: () => api.listAgents() });
  const schemaQuery = useQuery({
    queryKey: presetSchemaKey(base ?? ''),
    queryFn: () => api.getToolSchema(base ?? ''),
    enabled: base !== null && base !== '',
  });

  // Agent run tools among the base options — their picker labels get a " (agent)"
  // suffix. Read from ALL agents (each summary carries its `tool_name`).
  const agentToolNames = useMemo(
    () => new Set((agentsQuery.data?.items ?? []).map((agent) => agent.tool_name)),
    [agentsQuery.data],
  );

  // Tools whose EFFECTIVE visibility is hidden (`overlay.hidden ?? plugin declaration`)
  // are excluded from the picker exactly as they are from the tools screen.
  const hiddenNames = useMemo(
    () => hiddenToolNames(tagsQuery.data ?? [], toolMetaQuery.data?.meta ?? []),
    [tagsQuery.data, toolMetaQuery.data],
  );

  // A preset cannot be another preset's base: exclude every NON-conflicted preset name
  // (a conflicted row is never among the base options anyway). Effective-hidden tools
  // are excluded alongside them.
  const excludeNames = useMemo(
    () => [
      ...(presetsQuery.data ?? []).filter((row) => !row.conflicted).map((row) => row.name),
      ...hiddenNames,
    ],
    [presetsQuery.data, hiddenNames],
  );

  // The grouping map the picker reads: each tool's NATIVE tags unioned with its overlay
  // tags, de-duplicated so a tag in both sets is not shown twice.
  const tagsByTool = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const entry of tagsQuery.data ?? []) map[entry.name] = [...entry.tags];
    for (const entry of toolMetaQuery.data?.meta ?? []) {
      const merged = new Set([...(map[entry.tool_name] ?? []), ...entry.tags]);
      map[entry.tool_name] = [...merged];
    }
    return map;
  }, [tagsQuery.data, toolMetaQuery.data]);

  // The declared badges shown beneath the SELECTED base — native ∪ overlay. A failed
  // tags/meta read leaves the map empty (no chips shown).
  const badgesByTool = useMemo(
    () => toolBadgesByName(tagsQuery.data ?? [], toolMetaQuery.data?.meta ?? []),
    [tagsQuery.data, toolMetaQuery.data],
  );

  const enrichmentFailed =
    tagsQuery.isError || toolMetaQuery.isError || agentsQuery.isError || schemaQuery.isError;
  const retryEnrichment = (): void => {
    if (tagsQuery.isError) void tagsQuery.refetch();
    if (toolMetaQuery.isError) void toolMetaQuery.refetch();
    if (agentsQuery.isError) void agentsQuery.refetch();
    if (schemaQuery.isError) void schemaQuery.refetch();
  };

  return {
    toolsQuery,
    presetsQuery,
    tagsQuery,
    toolMetaQuery,
    agentsQuery,
    schemaQuery,
    displayNames,
    agentToolNames,
    excludeNames,
    tagsByTool,
    badgesByTool,
    enrichmentFailed,
    retryEnrichment,
    hints: inputFieldNames(schemaQuery.data?.input),
  };
}
