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
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
  isFeatureDisabled,
  isFullProjection,
  useApi,
  useAppNavigate,
  useBreakpoint,
  useCanWrite,
  useCapabilities,
  useReloadToolDisplayNames,
  useSearchCommit,
  type CapabilityState,
  type ExplorerColumn,
  type ExplorerEmptyStates,
  type Folder,
  type PageProps,
  type RouteSearch,
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

/** The search box's accessible name; the commit listener keys the search input on it. */
const SEARCH_LABEL = 'Filter tools';

/** Case-insensitive substring over a tool's real name and display label. */
function toolMatches(view: ToolView, query: string): boolean {
  const needle = query.toLowerCase();
  return (
    view.name.toLowerCase().includes(needle) || view.displayName.toLowerCase().includes(needle)
  );
}

/** The tools table's single column; folder rows span it. */
const COLUMNS: ExplorerColumn[] = [{ key: 'name', header: 'Name' }];

/** The overlay-write door the edit affordance is gated on (merge-patch a tool's row). */
const TOOL_META_WRITE_ROUTE = '/api/tool-meta/tools';

/** Push a following flex item to the far edge of its `.tai-row`. */
const spacerStyle = { marginLeft: 'auto' };

/** One tool row: its display label as an `AppLink` setting `?tool=` (preserving the
 * active `?tags=` and `?q=`), the real name shown secondary+mono when a display name
 * overrides it, and — for writers — an edit affordance opening the overlay dialog. */
function ToolItem({
  view,
  selected,
  preserveTags,
  preserveQuery,
  canWrite,
  onEdit,
}: {
  readonly view: ToolView;
  readonly selected: boolean;
  readonly preserveTags: readonly string[];
  readonly preserveQuery: string | undefined;
  readonly canWrite: boolean;
  readonly onEdit: (view: ToolView) => void;
}): ReactNode {
  return (
    <div className="tai-row">
      <AppLink
        to="tools"
        search={{
          tool: view.name,
          tags: preserveTags.length > 0 ? [...preserveTags] : undefined,
          q: preserveQuery,
        }}
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
  const api = useApi();
  const navigate = useAppNavigate();
  // The projection door AND the store must both be live: an unconfigured tool_meta
  // store answers the overlay write with a 501 `tool-meta-not-configured`, so once a
  // write has revealed the store off, the per-row edit affordance is withdrawn — a
  // write it can only refuse is never offered.
  const canWrite = useCanWrite(TOOL_META_WRITE_ROUTE, 'PATCH') && !metaWriteDisabled;
  const { state } = useCapabilities();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

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

  const toolsQuery = useQuery({ queryKey: toolsListKey, queryFn: () => api.listTools() });
  const tagsQuery = useQuery({ queryKey: toolTagsKey, queryFn: () => api.listToolTags() });
  const metaQuery = useQuery({ queryKey: toolMetaKey, queryFn: () => api.listToolMeta() });

  // Compose the full `tools` search from the next query, preserving the active tool +
  // tags.
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
  if (toolsQuery.isPending) {
    body = (
      <div className="tai-stack tai-stack-2">
        <Skeleton height={32} />
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  } else if (toolsQuery.isError) {
    body = (
      <ErrorState
        message={errorMessage(toolsQuery.error)}
        onRetry={() => void toolsQuery.refetch()}
      />
    );
  } else {
    const overlayRows = metaQuery.data?.meta ?? [];
    const folders: Folder[] = toFolders(metaQuery.data?.folders ?? []);
    const allViews = projectedTools(
      buildToolViews(toolsQuery.data, tagsQuery.data ?? [], overlayRows),
      state,
    );
    if (allViews.length === 0) {
      body = (
        <EmptyState
          title="No tools available"
          description="Tools arrive as marketplace plugins — install one to run it here."
          action={
            <AppLink
              to="marketplace"
              search={{ kind: 'tool' }}
              className="tai-btn tai-btn-secondary"
            >
              Browse marketplace
            </AppLink>
          }
        />
      );
    } else {
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
      // non-empty catalog (the truly-empty catalog is handled above), that means every
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
          description: 'No tool matches the search or the selected tags.',
        },
      };

      const renderTool = (view: ToolView): ReactNode => (
        <ToolItem
          view={view}
          selected={view.name === selected}
          preserveTags={selectedTags}
          preserveQuery={preserveQuery}
          canWrite={canWrite}
          onEdit={(edited) => {
            onEdit(edited, folders);
          }}
        />
      );

      body = (
        <>
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
                q: preserveQuery,
              });
            }}
            search={{
              value: query,
              onChange: setQuery,
              matches: toolMatches,
              label: SEARCH_LABEL,
              placeholder: 'Filter by name',
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
                        q: preserveQuery,
                      });
                    },
                    untaggedLabel: UNTAGGED_LABEL,
                    filterLabel: 'Filter tools by tag',
                    maxVisibleTags: MAX_VISIBLE_TAG_CHIPS,
                  }
            }
            emptyStates={emptyStates}
          />
        </>
      );
    }
  }

  return (
    <div className="tai-stack" ref={containerRef}>
      {body}
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
          writeError={upsert.error}
        />
      ) : null}
    </Stack>
  );
}
