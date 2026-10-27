/**
 * The reads behind the agents list (the authoring surface and the explorer) and their
 * memoised derivations.
 *
 * Reads: the registry (`listAgents`, load-bearing), the authorable agents
 * (`listSpecRunnableAgents`, which gates the authored entries), the default preset
 * list (`listPresets`, which the authored entries derive from) and the overlay
 * (`listToolMeta`, the folders). Derives the explorer entries (`agentEntries`, the
 * registry filtered to the caller's projection), the full folder tree, the tree as
 * this screen draws it (`foldersForView`) and each tool's folder — each memoised on
 * its reads, so a re-render costs nothing and a change one linear pass — plus the
 * authored agents' group state the authoring surface reports.
 *
 * Only a SCOPED caller's 403 on the presets read is absence (`presetsFailed` stays
 * false); every other presets failure is reported for the explorer to say loudly.
 */
import {
  type AgentSummary,
  ApiError,
  type PresetRecord,
  type ToolMetaOverlay,
} from '@tai42/api-client';
import {
  type CapabilityState,
  type Folder,
  type FoldersChanged,
  foldersForView,
  isFullProjection,
  toFolders,
  useApi,
  useCapabilities,
  useToolMetaWriteAccess,
} from '@tai42/studio-sdk';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { agentEntries, type AgentEntry } from './agent-entries';
import {
  agentsListKey,
  agentsToolMetaKey,
  authoredPresetsKey,
  specRunnableAgentsKey,
} from './keys';

/**
 * The registered agents visible to the caller. A scoped session sees only the
 * agents its projection lists; a full session — and any not-yet-ready projection
 * — sees the whole registry, with the server the final authority on every run.
 */
function projectedAgents(
  items: readonly AgentSummary[],
  state: CapabilityState,
): readonly AgentSummary[] {
  if (state.status !== 'ready' || isFullProjection(state.projection)) return items;
  const allowed = new Set(state.projection.agents);
  return items.filter((agent) => allowed.has(agent.name));
}

/**
 * The authored agents as a group, for the authoring surface: their reads are still
 * loading, a read failed (the explorer says which), or how many are listed.
 */
export type AuthoredAgentsState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'loaded'; readonly count: number };

export interface AgentCatalog {
  readonly agentsQuery: UseQueryResult<{ items: AgentSummary[]; total: number }>;
  readonly presetsQuery: UseQueryResult<PresetRecord[]>;
  readonly metaQuery: UseQueryResult<ToolMetaOverlay>;
  /** A presets read failure that is NOT a scoped caller's absence. */
  readonly presetsFailed: boolean;
  readonly entries: readonly AgentEntry[];
  readonly authored: AuthoredAgentsState;
  /** The FULL tree — the destinations a move offers. */
  readonly allFolders: readonly Folder[];
  /** The tree as this screen draws it. */
  readonly folders: readonly Folder[];
  readonly folderIdByTool: ReadonlyMap<string, string | null>;
  /** The overlay read succeeded, so the folders and each tool's folder are known. */
  readonly overlayLoaded: boolean;
  /** The caller may file an agent's tool into a folder (its write offered + overlay loaded). */
  readonly canFileTools: boolean;
  readonly onFoldersChanged: FoldersChanged;
}

export function useAgentCatalog(): AgentCatalog {
  const api = useApi();
  const queryClient = useQueryClient();
  const { state } = useCapabilities();

  const agentsQuery = useQuery({ queryKey: agentsListKey, queryFn: () => api.listAgents() });
  const specRunnableQuery = useQuery({
    queryKey: specRunnableAgentsKey,
    queryFn: () => api.listSpecRunnableAgents(),
  });
  const presetsQuery = useQuery({ queryKey: authoredPresetsKey, queryFn: () => api.listPresets() });
  const metaQuery = useQuery({ queryKey: agentsToolMetaKey, queryFn: () => api.listToolMeta() });

  const onFoldersChanged = useCallback(
    () => queryClient.invalidateQueries({ queryKey: agentsToolMetaKey }),
    [queryClient],
  );
  const access = useToolMetaWriteAccess();

  // Authored agents exist only where an authorable agent is installed.
  const authoringEnabled = (specRunnableQuery.data?.items.length ?? 0) > 0;
  const presetsForbidden =
    presetsQuery.error instanceof ApiError && presetsQuery.error.status === 403;

  const entries = useMemo(() => {
    const all = agentsQuery.data?.items ?? [];
    const presets = authoringEnabled ? (presetsQuery.data ?? []) : [];
    return agentEntries(projectedAgents(all, state), all, presets);
  }, [agentsQuery.data, presetsQuery.data, authoringEnabled, state]);

  const authoredCount = useMemo(
    () => entries.filter((entry) => entry.kind === 'authored').length,
    [entries],
  );
  const presetsFailed = authoringEnabled && presetsQuery.isError && !presetsForbidden;
  let authored: AuthoredAgentsState;
  if (agentsQuery.isPending || specRunnableQuery.isPending || presetsQuery.isPending) {
    authored = { status: 'loading' };
  } else if (agentsQuery.isError || presetsFailed) {
    authored = { status: 'failed' };
  } else {
    authored = { status: 'loaded', count: authoredCount };
  }

  const allFolders = useMemo(() => toFolders(metaQuery.data?.folders ?? []), [metaQuery.data]);
  const folders = useMemo(
    () =>
      foldersForView(
        allFolders,
        metaQuery.data?.meta ?? [],
        new Set(entries.map((entry) => entry.toolName)),
      ),
    [allFolders, metaQuery.data, entries],
  );
  const folderIdByTool = useMemo(
    () => new Map((metaQuery.data?.meta ?? []).map((row) => [row.tool_name, row.folder_id])),
    [metaQuery.data],
  );

  return {
    agentsQuery,
    presetsQuery,
    metaQuery,
    presetsFailed,
    entries,
    authored,
    allFolders,
    folders,
    folderIdByTool,
    overlayLoaded: metaQuery.isSuccess,
    canFileTools: access.editTool && metaQuery.isSuccess,
    onFoldersChanged,
  };
}
