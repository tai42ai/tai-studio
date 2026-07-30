/**
 * Tools page — the flagship surface. The master list comes from `api.listTools`,
 * merged with each tool's native tags + plugin-declared visibility
 * (`api.listToolTags`) and the tool_meta overlay (`api.listToolMeta`, the folder
 * tree + per-tool display name / user tags / folder / tri-state visibility). Every
 * tool renders its `display_name ?? name`, keeps its real name visible (monospace,
 * secondary) so it stays identifiable, and is grouped/filtered by its MERGED tags
 * (native ∪ overlay). Selecting a name sets the `tool` search param (shell-owned
 * routing via `AppLink`), which drives the run panel and the extension-combo editor.
 *
 * FOLDERS: the list is a current-directory explorer — a breadcrumb plus the current
 * folder's subfolders, then the tools filed there (unfiled tools live at the root).
 * The current folder is local view state; the tree is entity-backed by the overlay.
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
  FolderBreadcrumb,
  FolderRow,
  PageHeader,
  Skeleton,
  Stack,
  childFolders,
  errorMessage,
  isFullProjection,
  useApi,
  useAppNavigate,
  useBreakpoint,
  useCanWrite,
  useCapabilities,
  type CapabilityState,
  type Folder,
  type PageProps,
} from '@tai42/studio-sdk';
import type { ToolMetaPatch } from '@tai42/api-client';

import { RunPanel } from './RunPanel';
import { ToolExtensionsCard } from './ToolExtensionsCard';
import { ToolMetaEditDialog } from './ToolMetaEditDialog';
import { buildToolViews, toFolders, type ToolView } from './toolView';
import { toolMetaKey, toolTagsKey, toolsListKey } from './keys';

/** The reserved token selecting tools that carry NO tag (a namespaced sentinel). */
const UNTAGGED_TOKEN = '__untagged__';
const UNTAGGED_LABEL = 'Untagged';

/** How many tag chips the filter row shows before collapsing the rest into "+N more". */
const MAX_VISIBLE_TAG_CHIPS = 8;

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

/** A flat, ungrouped list of tools — the view when no tags are available. */
function FlatToolList({
  views,
  selected,
  preserveTags,
  canWrite,
  onEdit,
}: {
  readonly views: readonly ToolView[];
  readonly selected: string | undefined;
  readonly preserveTags: readonly string[];
  readonly canWrite: boolean;
  readonly onEdit: (view: ToolView) => void;
}): ReactNode {
  return (
    <div className="tai-stack tai-stack-2">
      {views.map((view) => (
        <ToolItem
          key={view.name}
          view={view}
          selected={view.name === selected}
          preserveTags={preserveTags}
          canWrite={canWrite}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

/** A group of tools sharing one tag, rendered under a titled, counted header. */
function TagGroup({
  label,
  views,
  selected,
  preserveTags,
  canWrite,
  onEdit,
}: {
  readonly label: string;
  readonly views: readonly ToolView[];
  readonly selected: string | undefined;
  readonly preserveTags: readonly string[];
  readonly canWrite: boolean;
  readonly onEdit: (view: ToolView) => void;
}): ReactNode {
  return (
    <section className="tai-stack tai-stack-2">
      <h3 className="tai-label">
        {label} <span className="tai-muted">{views.length}</span>
      </h3>
      {views.map((view) => (
        <ToolItem
          key={view.name}
          view={view}
          selected={view.name === selected}
          preserveTags={preserveTags}
          canWrite={canWrite}
          onEdit={onEdit}
        />
      ))}
    </section>
  );
}

interface TagVocabularyEntry {
  readonly token: string;
  readonly label: string;
  readonly count: number;
}

/** A togglable tag chip; `aria-pressed` reflects whether the tag filters the list. */
function TagChip({
  entry,
  active,
  onToggle,
}: {
  readonly entry: TagVocabularyEntry;
  readonly active: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      className="tai-chip"
      aria-pressed={active}
      aria-label={`${entry.label} (${String(entry.count)})`}
      onClick={onToggle}
    >
      <span>{entry.label}</span>
      <span>{entry.count}</span>
    </button>
  );
}

/** The filter row: every selected chip plus as many unselected chips as fit under the
 * cap, with the remainder collapsed into a STATIC "+N more" count. */
function TagFilterRow({
  vocabulary,
  selectedSet,
  onToggle,
}: {
  readonly vocabulary: readonly TagVocabularyEntry[];
  readonly selectedSet: ReadonlySet<string>;
  readonly onToggle: (token: string) => void;
}): ReactNode {
  const visible: TagVocabularyEntry[] = [];
  let hidden = 0;
  let unselectedShown = 0;
  for (const entry of vocabulary) {
    if (selectedSet.has(entry.token)) {
      visible.push(entry);
    } else if (unselectedShown < MAX_VISIBLE_TAG_CHIPS) {
      visible.push(entry);
      unselectedShown += 1;
    } else {
      hidden += 1;
    }
  }

  return (
    <div role="group" aria-label="Filter tools by tag" className="tai-row">
      {visible.map((entry) => (
        <TagChip
          key={entry.token}
          entry={entry}
          active={selectedSet.has(entry.token)}
          onToggle={() => {
            onToggle(entry.token);
          }}
        />
      ))}
      {hidden > 0 ? (
        <span className="tai-chip tai-chip-static">{`+${String(hidden)} more`}</span>
      ) : null}
    </div>
  );
}

/** The tag vocabulary over a set of tools (merged tags), sorted, plus an "Untagged"
 * pseudo-tag; a selected token whose tools vanished still renders so it can be cleared. */
function buildVocabulary(
  views: readonly ToolView[],
  selectedTags: readonly string[],
): TagVocabularyEntry[] {
  const counts = new Map<string, number>();
  let untaggedCount = 0;
  for (const view of views) {
    if (view.tags.length === 0) {
      untaggedCount += 1;
      continue;
    }
    for (const tag of view.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const vocabulary: TagVocabularyEntry[] = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => ({ token: label, label, count }));
  if (untaggedCount > 0) {
    vocabulary.push({ token: UNTAGGED_TOKEN, label: UNTAGGED_LABEL, count: untaggedCount });
  }
  for (const token of selectedTags) {
    if (!vocabulary.some((entry) => entry.token === token)) {
      vocabulary.push({
        token,
        label: token === UNTAGGED_TOKEN ? UNTAGGED_LABEL : token,
        count: 0,
      });
    }
  }
  return vocabulary;
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
        description="The skeleton has no registered tools to run."
      />
    );
  }

  // A tags OR overlay read failure must not take down browsing: the merged view still
  // renders (from whatever loaded), under a loud notice on the tag/folder controls.
  const sideReadError = tagsQuery.isError
    ? tagsQuery.error
    : metaQuery.isError
      ? metaQuery.error
      : null;

  // The current directory: its subfolders, and the tools filed directly in it. A tool
  // whose effective visibility is hidden is excluded outright — unhiding is a CLI/API
  // operation (`tai tool-meta … --visibility shown`), never a screen affordance.
  const subfolders = childFolders(folders, currentFolderId);
  const inFolder = allViews.filter((view) => view.folderId === currentFolderId && !view.hidden);

  const vocabulary = buildVocabulary(inFolder, selectedTags);
  const selectedSet = new Set(selectedTags);
  const toggle = (token: string): void => {
    const next = selectedSet.has(token)
      ? selectedTags.filter((t) => t !== token)
      : [...selectedTags, token];
    navigate('tools', { tool: selected, tags: next.length > 0 ? next : undefined });
  };

  // OR semantics over merged tags: no selection shows every tool; otherwise a tool
  // matches when it carries any selected tag, or is untagged and "Untagged" is picked.
  const matches = (view: ToolView): boolean => {
    if (selectedSet.size === 0) return true;
    if (view.tags.length === 0) return selectedSet.has(UNTAGGED_TOKEN);
    return view.tags.some((tag) => selectedSet.has(tag));
  };
  const filtered = inFolder.filter(matches);

  const groups: { token: string; label: string; views: ToolView[] }[] = vocabulary
    .filter((entry) => entry.token !== UNTAGGED_TOKEN)
    .map((entry) => ({
      token: entry.token,
      label: entry.label,
      views: filtered.filter((view) => view.tags.includes(entry.label)),
    }))
    .filter((group) => group.views.length > 0);
  const untaggedFiltered = filtered.filter((view) => view.tags.length === 0);
  if (untaggedFiltered.length > 0) {
    groups.push({ token: UNTAGGED_TOKEN, label: UNTAGGED_LABEL, views: untaggedFiltered });
  }

  const listBody =
    sideReadError !== null ? (
      // A tags/overlay read failed: browsing survives as a FLAT list of what loaded,
      // under the loud strip below — no grouping/filter chips built from partial data.
      <FlatToolList
        views={inFolder}
        selected={selected}
        preserveTags={selectedTags}
        canWrite={canWrite}
        onEdit={(view) => {
          onEdit(view, folders);
        }}
      />
    ) : vocabulary.length === 0 ? (
      inFolder.length === 0 && subfolders.length === 0 ? (
        <EmptyState
          title="This folder is empty"
          description="No tools or subfolders are filed here."
        />
      ) : (
        <FlatToolList
          views={inFolder}
          selected={selected}
          preserveTags={selectedTags}
          canWrite={canWrite}
          onEdit={(view) => {
            onEdit(view, folders);
          }}
        />
      )
    ) : (
      <div className="tai-stack">
        <TagFilterRow vocabulary={vocabulary} selectedSet={selectedSet} onToggle={toggle} />
        {groups.length === 0 ? (
          <EmptyState
            title="No tools match"
            description="No tool carries any of the selected tags."
          />
        ) : (
          <div className="tai-stack">
            {groups.map((group) => (
              <TagGroup
                key={group.token}
                label={group.label}
                views={group.views}
                selected={selected}
                preserveTags={selectedTags}
                canWrite={canWrite}
                onEdit={(view) => {
                  onEdit(view, folders);
                }}
              />
            ))}
          </div>
        )}
      </div>
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

      <FolderBreadcrumb
        folders={folders}
        currentFolderId={currentFolderId}
        onNavigate={setCurrentFolderId}
        rootLabel="All tools"
      />

      {subfolders.length > 0 ? (
        <div className="tai-stack tai-stack-2">
          {subfolders.map((folder) => (
            <FolderRow key={folder.id} folder={folder} onOpen={setCurrentFolderId} />
          ))}
        </div>
      ) : null}

      {listBody}
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

  const pane = isSinglePane && selected !== undefined ? 'detail' : 'list';
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
