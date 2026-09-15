/**
 * The compose dialog's data layer: the tool/tag/meta/preset reads and the memos
 * derived from them. A failed read the rendered spec fields depend on is surfaced
 * loudly and blocks submit (`readFailed`) — never a silently-empty picker.
 */
import type { AgentSummary } from '@tai42/api-client';
import {
  hiddenToolNames,
  type JsonSchema,
  useApi,
  useFeatureOff,
  useToolDisplayNames,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { hasField } from './authoring-schema';
import {
  authoredPresetsKey,
  authoredToolMetaKey,
  authoredToolsKey,
  authoredToolTagsKey,
} from './keys';

/** The compose dialog's read layer plus the memos derived from it. */
export type ComposeAgentData = ReturnType<typeof useComposeAgentData>;

export function useComposeAgentData(baseAgent: AgentSummary | null, baseSchema: JsonSchema) {
  const api = useApi();

  // The overlay tags input is HIDDEN when the tool_meta store is OFF: an author must
  // not type categorization tags that the OFF overlay would silently drop.
  const toolMetaOff = useFeatureOff('tool_meta');
  const displayNames = useToolDisplayNames();

  const toolsQuery = useQuery({ queryKey: authoredToolsKey, queryFn: () => api.listTools() });
  const tagsQuery = useQuery({ queryKey: authoredToolTagsKey, queryFn: () => api.listToolTags() });
  const metaQuery = useQuery({ queryKey: authoredToolMetaKey, queryFn: () => api.listToolMeta() });
  const presetsQuery = useQuery({ queryKey: authoredPresetsKey, queryFn: () => api.listPresets() });

  // A conflicted/quarantined preset is delete-only — it must NEVER seed a
  // composition — so the inline-preset picker offers only the non-conflicted rows.
  const usablePresets = useMemo(
    () => (presetsQuery.data ?? []).filter((record) => !record.conflicted),
    [presetsQuery.data],
  );

  // A failed read must never render as an enabled EMPTY picker: each failed read
  // replaces its control with a loud `ErrorState`, and a read the rendered spec
  // fields depend on blocks submit until it succeeds.
  const needsTools =
    baseAgent !== null && (hasField(baseSchema, 'tool_names') || hasField(baseSchema, 'subagents'));
  const needsPresets =
    baseAgent !== null && (hasField(baseSchema, 'presets') || hasField(baseSchema, 'subagents'));
  const readFailed = (needsTools && toolsQuery.isError) || (needsPresets && presetsQuery.isError);
  const retryReads = (): void => {
    if (toolsQuery.isError) void toolsQuery.refetch();
    if (presetsQuery.isError) void presetsQuery.refetch();
  };

  // Undefined when there are no native tags, so the ToolPicker stays in its flat
  // (non-grouped) mode rather than forcing a single "Untagged" cluster.
  const tagsByTool = useMemo(() => {
    const map: Record<string, readonly string[]> = {};
    for (const entry of tagsQuery.data ?? []) map[entry.name] = entry.tags;
    return Object.keys(map).length > 0 ? map : undefined;
  }, [tagsQuery.data]);

  // Effective-hidden tools (`overlay.hidden ?? plugin declaration`) are removed from
  // the population the compose pickers offer — the same tri-state rule the tools
  // screen applies. Best-effort: a failed tags/meta read leaves everything visible.
  const visibleToolNames = useMemo(() => {
    const hidden = hiddenToolNames(tagsQuery.data ?? [], metaQuery.data?.meta ?? []);
    return (toolsQuery.data ?? []).filter((name) => !hidden.has(name));
  }, [toolsQuery.data, tagsQuery.data, metaQuery.data]);

  return {
    toolMetaOff,
    displayNames,
    toolsQuery,
    tagsQuery,
    presetsQuery,
    usablePresets,
    tagsByTool,
    visibleToolNames,
    needsTools,
    needsPresets,
    readFailed,
    retryReads,
  };
}
