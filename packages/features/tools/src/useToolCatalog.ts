/**
 * The tools master list's three reads merged into the per-tool view model: the flat
 * tool names, each tool's native tags + declared visibility, and the tool_meta overlay
 * (folder tree + per-tool display name / tags / folder / visibility). A tags OR overlay
 * read failure never takes down browsing — the merged view still renders from whatever
 * loaded, under a loud notice surfaced through `sideReadError`.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi, type CapabilityState, type Folder } from '@tai42/studio-sdk';

import { buildToolViews, toFolders, type ToolView } from './toolView';
import { projectedTools } from './toolProjection';
import { toolMetaKey, toolTagsKey, toolsListKey } from './keys';

export interface ToolCatalog {
  readonly toolsPending: boolean;
  readonly toolsError: unknown;
  readonly onRetryTools: () => void;
  readonly folders: Folder[];
  readonly allViews: ToolView[];
  /** A tags/overlay side-read failure, or `null` — browsing survives it. */
  readonly sideReadError: unknown;
  readonly onRetrySideRead: () => void;
}

export function useToolCatalog(state: CapabilityState): ToolCatalog {
  const api = useApi();
  const toolsQuery = useQuery({ queryKey: toolsListKey, queryFn: () => api.listTools() });
  const tagsQuery = useQuery({ queryKey: toolTagsKey, queryFn: () => api.listToolTags() });
  const metaQuery = useQuery({ queryKey: toolMetaKey, queryFn: () => api.listToolMeta() });

  const overlayRows = metaQuery.data?.meta ?? [];
  const folders = toFolders(metaQuery.data?.folders ?? []);
  const allViews = projectedTools(
    buildToolViews(toolsQuery.data ?? [], tagsQuery.data ?? [], overlayRows),
    state,
  );
  const sideReadError = tagsQuery.isError
    ? tagsQuery.error
    : metaQuery.isError
      ? metaQuery.error
      : null;

  return {
    toolsPending: toolsQuery.isPending,
    toolsError: toolsQuery.isError ? toolsQuery.error : null,
    onRetryTools: () => void toolsQuery.refetch(),
    folders,
    allViews,
    sideReadError,
    onRetrySideRead: () => {
      if (tagsQuery.isError) void tagsQuery.refetch();
      if (metaQuery.isError) void metaQuery.refetch();
    },
  };
}
