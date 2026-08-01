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
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  ArrowLeftIcon,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ExplorerView,
  PageHeader,
  Skeleton,
  Stack,
  TD,
  errorMessage,
  isFullProjection,
  useApi,
  useAppNavigate,
  useBreakpoint,
  useCanWrite,
  useCapabilities,
  type CapabilityState,
  type ExplorerColumn,
  type ExplorerEmptyStates,
  type Folder,
  type PageProps,
} from '@tai42/studio-sdk';
import type { ToolMetaPatch } from '@tai42/api-client';

import { RunPanel } from './RunPanel';
import { ToolExtensionsCard } from './ToolExtensionsCard';
import { ToolMetaEditDialog } from './ToolMetaEditDialog';
import { buildToolViews, toFolders, type ToolView } from './toolView';
import { toolMetaKey, toolTagsKey, toolsListKey } from './keys';

/** The untagged pseudo-tag's chip label. */
const UNTAGGED_LABEL = 'Untagged';

/** How many tag chips the filter row shows before collapsing the rest into "+N more". */
const MAX_VISIBLE_TAG_CHIPS = 8;

/** The explorer's list/card view-mode persistence key. */
const TOOLS_VIEW_SURFACE = 'tools';

/** The tools table's single column; folder rows span it. */
const COLUMNS: ExplorerColumn[] = [{ key: 'name', header: 'Name' }];

/** The overlay-write door the edit affordance is gated on (merge-patch a tool's row). */
const TOOL_META_WRITE_ROUTE = '/api/tool-meta/tools';

/** Push a following flex item to the far edge of its `.tai-row`. */
const spacerStyle = { marginLeft: 'auto' };

/** One tool row: its display label as an `AppLink` setting `?tool=` (preserving the
 * active `?tags=`), the real name shown secondary+mono when a display name overrides
 * it, and — for writers — an edit affordance opening the overlay dialog. */
function ToolItem({
  view,
  selected,
  preserveTags,
  canWrite,
  onEdit,
}: {
  readonly view: ToolView;
  readonly selected: boolean;
  readonly preserveTags: readonly string[];
  readonly canWrite: boolean;
  readonly onEdit: (view: ToolView) => void;
}): ReactNode {
  return (
    <div className="tai-row">
      <AppLink
        to="tools"
        search={{ tool: view.name, tags: preserveTags.length > 0 ? [...preserveTags] : undefined }}
        aria-label={`Open tool ${view.name}`}
        aria-current={selected ? 'page' : undefined}
        className="tai-nav-item"
      >
        <span className={view.hasCustomName ? undefined : 'tai-mono'}>{view.displayName}</span>
        {view.hasCustomName ? <span className="tai-muted tai-mono">{view.name}</span> : null}
      </AppLink>
      {canWrite ? (
        <>
          <div style={spacerStyle} />
          <Button
            variant="ghost"
            aria-label={`Edit tool ${view.name}`}
            onClick={() => {
              onEdit(view);
            }}
          >
            Edit
          </Button>
        </>
      ) : null}
    </div>
  );
}

/**
 * The tools visible to the caller. A scoped session sees only the tools its
 * projection lists; a full session — and any not-yet-ready projection — sees the
 * whole catalog, with the server the final authority on every run.
 */
function projectedTools(views: readonly ToolView[], state: CapabilityState): ToolView[] {
  if (state.status !== 'ready' || isFullProjection(state.projection)) return [...views];
  const allowed = new Set(state.projection.tools);
  return views.filter((view) => allowed.has(view.name));
}

function ToolList({
  selected,
  selectedTags,
  onEdit,
}: {
  readonly selected: string | undefined;
  readonly selectedTags: readonly string[];
  readonly onEdit: (view: ToolView, folders: readonly Folder[]) => void;
}): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const canWrite = useCanWrite(TOOL_META_WRITE_ROUTE, 'PATCH');
  const { state } = useCapabilities();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  const toolsQuery = useQuery({ queryKey: toolsListKey, queryFn: () => api.listTools() });
  const tagsQuery = useQuery({ queryKey: toolTagsKey, queryFn: () => api.listToolTags() });
  const metaQuery = useQuery({ queryKey: toolMetaKey, queryFn: () => api.listToolMeta() });

  if (toolsQuery.isPending) {
    return (
      <div className="tai-stack tai-stack-2">
        <Skeleton height={32} />
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  }
  if (toolsQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(toolsQuery.error)}
        onRetry={() => void toolsQuery.refetch()}
      />
    );
  }

  const overlayRows = metaQuery.data?.meta ?? [];
  const folders: Folder[] = toFolders(metaQuery.data?.folders ?? []);
  const allViews = projectedTools(
    buildToolViews(toolsQuery.data, tagsQuery.data ?? [], overlayRows),
    state,
  );
  if (allViews.length === 0) {
    return (
      <EmptyState
        title="No tools available"
        description="Tools arrive as marketplace plugins — install one to run it here."
        action={
          <AppLink to="marketplace" search={{ kind: 'tool' }} className="tai-btn tai-btn-secondary">
            Browse marketplace
          </AppLink>
        }
      />
    );
  }

  // A tags OR overlay read failure must not take down browsing: the merged view still
  // renders (from whatever loaded), under a loud notice, with the tag chips suppressed
  // — no filter built from partial data.
  const sideReadError = tagsQuery.isError
    ? tagsQuery.error
    : metaQuery.isError
      ? metaQuery.error
      : null;

  // A tool whose effective visibility is hidden is excluded outright — unhiding is a
  // CLI/API operation (`tai tool-meta … --visibility shown`), never a screen affordance.
  const visibleViews = allViews.filter((view) => !view.hidden);

  // `empty` fires only when nothing is filed AND no folder exists — here, with a
  // non-empty catalog (the truly-empty catalog early-returns above), that means every
  // installed tool is hidden, so the copy names that rather than the install prompt.
  const emptyStates: ExplorerEmptyStates = {
    empty: {
      title: 'No visible tools',
      description: 'Every installed tool is hidden. Unhide one with the tai tool-meta command.',
    },
    emptyFolder: {
      title: 'This folder is empty',
      description: 'No tools or subfolders are filed here.',
    },
    noMatch: {
      title: 'No tools match',
      description: 'No tool carries any of the selected tags.',
    },
  };

  const renderTool = (view: ToolView): ReactNode => (
    <ToolItem
      view={view}
      selected={view.name === selected}
      preserveTags={selectedTags}
      canWrite={canWrite}
      onEdit={(edited) => {
        onEdit(edited, folders);
      }}
    />
  );

  return (
    <div className="tai-stack">
      {sideReadError !== null ? (
        <ErrorState
          message={errorMessage(sideReadError)}
          onRetry={() => {
            if (tagsQuery.isError) void tagsQuery.refetch();
            if (metaQuery.isError) void metaQuery.refetch();
          }}
        />
      ) : null}

      <ExplorerView<ToolView>
        items={visibleViews}
        getItemKey={(view) => view.name}
        getFolderId={(view) => view.folderId}
        folders={folders}
        currentFolderId={currentFolderId}
        onNavigate={setCurrentFolderId}
        rootLabel="All tools"
        viewSurface={TOOLS_VIEW_SURFACE}
        label="Tools"
        columns={COLUMNS}
        renderRow={(view) => <TD>{renderTool(view)}</TD>}
        renderCard={(view) => <Card interactive>{renderTool(view)}</Card>}
        // Open == select in this master/detail; a click anywhere on the row/card
        // selects the tool, mirroring the row's name-link navigation exactly (the SDK
        // yields to that link and the Edit button, so neither double-fires).
        onOpenItem={(view) => {
          navigate('tools', {
            tool: view.name,
            tags: selectedTags.length > 0 ? [...selectedTags] : undefined,
          });
        }}
        tags={
          sideReadError !== null
            ? undefined
            : {
                getTags: (view) => view.tags,
                selected: selectedTags,
                onChange: (next) => {
                  navigate('tools', {
                    tool: selected,
                    tags: next.length > 0 ? [...next] : undefined,
                  });
                },
                untaggedLabel: UNTAGGED_LABEL,
                filterLabel: 'Filter tools by tag',
                maxVisibleTags: MAX_VISIBLE_TAG_CHIPS,
              }
        }
        emptyStates={emptyStates}
      />
    </div>
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

  // The tool being edited, plus the folder tree snapshot the dialog opened with.
  const [editing, setEditing] = useState<{ view: ToolView; folders: readonly Folder[] } | null>(
    null,
  );

  const upsert = useMutation({
    mutationFn: ({ name, patch }: { name: string; patch: ToolMetaPatch }) =>
      api.upsertToolMeta(name, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: toolMetaKey });
      setEditing(null);
    },
  });

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
              onEdit={(view, folders) => {
                setEditing({ view, folders });
              }}
            />
          </Stack>
        </Card>

        <Stack gap={6} className="tai-split-detail">
          {showBack ? (
            <div>
              <Button variant="ghost" onClick={clearSelection}>
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
      </div>

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
        />
      ) : null}
    </Stack>
  );
}
