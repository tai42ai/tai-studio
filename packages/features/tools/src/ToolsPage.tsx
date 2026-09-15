/**
 * Tools page — the flagship surface. The master list comes from `api.listTools`,
 * merged with each tool's native tags + plugin-declared visibility
 * (`api.listToolTags`) and the tool_meta overlay (`api.listToolMeta`, the folder
 * tree + per-tool display name / user tags / folder / tri-state visibility). Every
 * tool renders its `display_name ?? name`, keeps its real name visible (monospace,
 * secondary) so it stays identifiable, and is OR-filtered by its MERGED tags
 * (native ∪ overlay). Selecting a name sets the `tool` search param (shell-owned
 * routing via `AppLink`), which drives the run panel and the extension-combo editor.
 *
 * FOLDERS: the list is a `ExplorerView` current-directory explorer — a breadcrumb,
 * the current folder's subfolders as first-class rows/cards above the tools filed
 * there (unfiled tools live at the root), tag chips, and a list/card toggle. The
 * current folder is local view state; the tree is entity-backed by the overlay; the
 * tag selection lives in the `?tags=` search param.
 *
 * HIDDEN: a tool whose EFFECTIVE visibility is hidden (`overlay.hidden ?? plugin
 * declaration`) is excluded from the list outright — there is no screen affordance
 * to reveal it. Unhiding is a CLI/API operation (`tai tool-meta … --visibility
 * shown`, which writes `overlay.hidden = false`); once shown, the tool appears and
 * writers edit its overlay through the per-tool edit dialog. Hiding is a visibility
 * choice, never a security boundary — a hidden tool stays callable on the server.
 *
 * Server state flows through TanStack Query: loading → `Skeleton`, empty →
 * `EmptyState`, error → a loud `ErrorState`. A tags OR overlay read failure never
 * takes down browsing — the flat list survives under a loud notice.
 *
 * LAYOUT is a design-system master/detail split. Below 1024
 * (`useBreakpoint().isSinglePane`) exactly one pane shows, driven by `data-pane`.
 * Selecting a tool moves focus to the detail heading; Back returns focus to the list.
 */
import type { ToolMetaPatch } from '@tai42/api-client';
import {
  ArrowLeftIcon,
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  type Folder,
  isFeatureDisabled,
  isFullProjection,
  PageHeader,
  type PageProps,
  type RouteSearch,
  Skeleton,
  Stack,
  useApi,
  useAppNavigate,
  useBreakpoint,
  useCanWrite,
  useCapabilities,
  useReloadToolDisplayNames,
  useSearchCommit,
} from '@tai42/studio-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react';

import { FolderActionsMenu } from './FolderActions';
import { toolMetaKey } from './keys';
import { RunPanel } from './RunPanel';
import { ToolAdminCard } from './ToolAdminCard';
import { SEARCH_LABEL, ToolExplorer } from './ToolExplorer';
import { ToolExtensionsCard } from './ToolExtensionsCard';
import { ToolMetaEditDialog } from './ToolMetaEditDialog';
import type { ToolView } from './toolView';
import { useToolCatalog } from './useToolCatalog';

/** The overlay-write door the edit affordance is gated on (merge-patch a tool's row). */
const TOOL_META_WRITE_ROUTE = '/api/tool-meta/tools';

function ToolList({
  selected,
  selectedTags,
  committedQuery,
  metaWriteDisabled,
  onEdit,
}: {
  readonly selected: string | undefined;
  readonly selectedTags: readonly string[];
  /** The committed `?q=` value from the URL (`''` when the param is absent). */
  readonly committedQuery: string;
  readonly metaWriteDisabled: boolean;
  readonly onEdit: (view: ToolView, folders: readonly Folder[]) => void;
}): ReactNode {
  // The projection door AND the store must both be live: an unconfigured tool_meta
  // store answers the overlay write with a 501 `tool-meta-not-configured`, so once a
  // write has revealed the store off, the per-row edit affordance is withdrawn — a
  // write it can only refuse is never offered.
  const canWrite = useCanWrite(TOOL_META_WRITE_ROUTE, 'PATCH') && !metaWriteDisabled;
  const { state } = useCapabilities();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const catalog = useToolCatalog(state);

  // The live search box holds a local draft; the committed `?q=` is written only on an
  // explicit commit (Enter / an edited blur), never per keystroke. Re-seed the draft
  // from the committed value DURING RENDER (React's adjust-state-on-prop-change pattern)
  // so a query arriving from the URL (deep-link, back/forward) overwrites the box.
  const [query, setQuery] = useState(committedQuery);
  const [seed, setSeed] = useState(committedQuery);
  if (seed !== committedQuery) {
    setSeed(committedQuery);
    setQuery(committedQuery);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const buildSearch = useCallback(
    (q: string | undefined): RouteSearch<'tools'> => ({
      tool: selected,
      tags: selectedTags.length > 0 ? [...selectedTags] : undefined,
      q,
    }),
    [selected, selectedTags],
  );
  useSearchCommit({
    token: 'tools',
    containerRef,
    searchLabel: SEARCH_LABEL,
    committedValue: committedQuery,
    draft: query,
    buildSearch,
    containerMissingError: 'Tools list container ref did not attach.',
  });

  // The live trimmed draft carried into every intra-page navigation (undefined when
  // empty): a click during an uncommitted edit cannot drop the filter, since the draft
  // re-renders each keystroke so this value and the click's navigation always agree.
  const preserveQuery = query.trim() === '' ? undefined : query.trim();

  let body: ReactNode;
  if (catalog.toolsPending) {
    body = (
      <div className="tai-stack tai-stack-2">
        <Skeleton height={32} />
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  } else if (catalog.toolsError !== null) {
    body = <ErrorState message={errorMessage(catalog.toolsError)} onRetry={catalog.onRetryTools} />;
  } else {
    body = (
      <ToolExplorer
        allViews={catalog.allViews}
        folders={catalog.folders}
        sideReadError={catalog.sideReadError}
        onRetrySideRead={catalog.onRetrySideRead}
        selected={selected}
        selectedTags={selectedTags}
        preserveQuery={preserveQuery}
        canWrite={canWrite}
        currentFolderId={currentFolderId}
        onNavigateFolder={setCurrentFolderId}
        query={query}
        onQueryChange={setQuery}
        onEdit={onEdit}
        // Writers get per-folder Rename + Move (the overlay folder doors); a reader
        // session never sees an action it can only be refused.
        renderFolderActions={
          canWrite
            ? (folder) => <FolderActionsMenu folder={folder} folders={catalog.folders} />
            : undefined
        }
      />
    );
  }

  return (
    <div className="tai-stack" ref={containerRef}>
      {body}
    </div>
  );
}

/** The detail pane: a Back control on a single pane, then the run panel + extensions
 * card for the selected tool, or the "no tool" / "not available" empty states. */
function ToolDetailPane({
  selected,
  selectionAvailable,
  showBack,
  onBack,
  detailHeadingRef,
}: {
  readonly selected: string | undefined;
  readonly selectionAvailable: boolean;
  readonly showBack: boolean;
  readonly onBack: () => void;
  readonly detailHeadingRef: RefObject<HTMLHeadingElement | null>;
}): ReactNode {
  return (
    <Stack gap={6} className="tai-split-detail">
      {showBack ? (
        <div>
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeftIcon />
            Back
          </Button>
        </div>
      ) : null}

      {selected === undefined ? (
        <Card>
          <EmptyState
            title="No tool selected"
            description="Choose a tool from the list to configure and run it."
          />
        </Card>
      ) : !selectionAvailable ? (
        <Card>
          <EmptyState
            title="Tool not available"
            description="This tool is outside your access. Choose a tool from the list to configure and run it."
          />
        </Card>
      ) : (
        <>
          <Card>
            <Stack>
              <h2 className="tai-section-title tai-mono" tabIndex={-1} ref={detailHeadingRef}>
                {selected}
              </h2>
              <RunPanel key={selected} toolName={selected} />
            </Stack>
          </Card>
          <Card>
            <ToolExtensionsCard key={selected} tool={selected} />
          </Card>
        </>
      )}
    </Stack>
  );
}

export function ToolsPage({ search }: PageProps<'tools'>): ReactNode {
  const selected = search.tool;
  const selectedTags = search.tags ?? [];
  const api = useApi();
  const queryClient = useQueryClient();
  const { state } = useCapabilities();
  const navigate = useAppNavigate();
  const { isSinglePane } = useBreakpoint();
  const reloadDisplayNames = useReloadToolDisplayNames();

  // The tool being edited, plus the folder tree snapshot the dialog opened with.
  const [editing, setEditing] = useState<{ view: ToolView; folders: readonly Folder[] } | null>(
    null,
  );

  const upsert = useMutation({
    mutationFn: ({ name, patch }: { name: string; patch: ToolMetaPatch }) =>
      api.upsertToolMeta(name, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: toolMetaKey });
      // The edit may have changed a display name; refresh the SDK-level overlay so
      // every tool picker across the app re-labels alongside this list.
      reloadDisplayNames();
      setEditing(null);
    },
  });

  // The overlay write revealed the tool_meta store off (501 `tool-meta-not-configured`):
  // withdraw the list edit affordances and show the muted OFF note in the dialog.
  const metaWriteDisabled = isFeatureDisabled(upsert.error);

  const createFolder = async (name: string, parentId: string | null): Promise<string> => {
    const folder = await api.createFolder(name, parentId);
    await queryClient.invalidateQueries({ queryKey: toolMetaKey });
    return folder.id;
  };

  const listRef = useRef<HTMLDivElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const prevSelected = useRef<string | undefined>(selected);

  useEffect(() => {
    if (selected === prevSelected.current) return;
    const previous = prevSelected.current;
    prevSelected.current = selected;
    if (selected !== undefined) {
      detailHeadingRef.current?.focus();
    } else if (previous !== undefined) {
      listRef.current?.querySelector<HTMLElement>(`[aria-label="Open tool ${previous}"]`)?.focus();
    }
  }, [selected]);

  const selectionAvailable =
    selected === undefined ||
    state.status !== 'ready' ||
    isFullProjection(state.projection) ||
    state.projection.tools.includes(selected);

  const pane = selected !== undefined ? 'detail' : 'list';
  const showBack = isSinglePane && selected !== undefined;

  const clearSelection = (): void => {
    navigate('tools', {
      tool: undefined,
      tags: selectedTags.length > 0 ? [...selectedTags] : undefined,
      q: search.q?.trim() ? search.q.trim() : undefined,
    });
  };

  return (
    <Stack gap={6}>
      <PageHeader eyebrow="Capabilities" title="Tools" />

      <div className="tai-split" data-pane={pane}>
        <Card className="tai-split-list" ref={listRef}>
          <Stack>
            <h2 className="tai-card-title">All tools</h2>
            <ToolList
              selected={selected}
              selectedTags={selectedTags}
              committedQuery={search.q ?? ''}
              metaWriteDisabled={metaWriteDisabled}
              onEdit={(view, folders) => {
                setEditing({ view, folders });
              }}
            />
          </Stack>
        </Card>

        <ToolDetailPane
          selected={selected}
          selectionAvailable={selectionAvailable}
          showBack={showBack}
          onBack={clearSelection}
          detailHeadingRef={detailHeadingRef}
        />
      </div>

      <ToolAdminCard />

      {editing !== null ? (
        <ToolMetaEditDialog
          tool={editing.view}
          folders={editing.folders}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onCreateFolder={createFolder}
          onSubmit={(patch) => {
            upsert.mutate({ name: editing.view.name, patch });
          }}
          saving={upsert.isPending}
          writeError={upsert.error}
        />
      ) : null}
    </Stack>
  );
}
