/**
 * Tools page — the flagship surface. The master list comes from
 * `api.listTools`; selecting a name sets the `tool` search param (shell-owned
 * routing via `AppLink`), which drives the run panel and the extension-combo
 * editor. Server state flows through TanStack Query: loading → `Skeleton`, empty →
 * `EmptyState`, error → a loud `ErrorState` that is always visible (no
 * special-casing of 401).
 *
 * LAYOUT is a design-system master/detail split (`.tai-split` + `.tai-split-list` +
 * `.tai-split-detail`). Below 1024 (`useBreakpoint().isSinglePane`) exactly one
 * pane shows, driven by `data-pane`: the list until a tool is chosen, then the
 * detail with a Back control (an arrow-left icon and the word "Back") that clears
 * the selection. Selecting a tool moves focus to the detail heading; Back returns
 * focus to the list row it came from. A deep-link that arrives WITH a selection
 * does not steal focus on load — focus only follows a client-side change.
 *
 * The list is additionally grouped and filterable by NATIVE TOOL TAGS
 * (`api.listToolTags`): a toggle row of `.tai-chip` filters selects tags (OR
 * semantics; an "Untagged" chip selects tools carrying no tag), and the filtered
 * tools are grouped under per-tag headers (untagged last, a multi-tag tool under
 * each of its tags). The selection persists in the `?tags=` search param, so a
 * filtered view is linkable. When the vocabulary is large the chip row collapses
 * its overflow into a STATIC "+N more" count (never an expander) — every tag still
 * appears as a group header below, and every selected chip stays visible so it
 * remains toggleable. A tags-query failure never takes down browsing: the flat
 * list survives and the tag row shows a loud `ErrorState` strip instead of grouping.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AppLink,
  ArrowLeftIcon,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  Stack,
  errorMessage,
  isFullProjection,
  useApi,
  useAppNavigate,
  useBreakpoint,
  useCapabilities,
  type CapabilityState,
  type PageProps,
} from '@tai42/studio-sdk';
import type { ToolTagEntry } from '@tai42/api-client';

import { RunPanel } from './RunPanel';
import { ToolExtensionsCard } from './ToolExtensionsCard';
import { toolTagsKey, toolsListKey } from './keys';

/** The reserved route token selecting tools that carry NO tag (a namespaced sentinel). */
const UNTAGGED_TOKEN = '__untagged__';
const UNTAGGED_LABEL = 'Untagged';

/** How many tag chips the filter row shows before collapsing the rest into "+N more".
 * Selected chips are always shown (they stay toggleable), so this caps the UNSELECTED
 * chips on show; every tag still appears as a group header below. */
const MAX_VISIBLE_TAG_CHIPS = 8;

/** One tool row: a borderless nav-item link that sets `?tool=` while preserving the
 * active `?tags=`. Selected → accent tint + inset rail via `.tai-nav-item` +
 * `aria-current="page"`. The tool name is a machine identifier, so it renders mono. */
function ToolItem({
  name,
  selected,
  preserveTags,
}: {
  readonly name: string;
  readonly selected: boolean;
  readonly preserveTags: readonly string[];
}): ReactNode {
  return (
    <AppLink
      to="tools"
      search={{ tool: name, tags: preserveTags.length > 0 ? [...preserveTags] : undefined }}
      aria-label={`Open tool ${name}`}
      aria-current={selected ? 'page' : undefined}
      className="tai-nav-item tai-mono"
    >
      {name}
    </AppLink>
  );
}

/**
 * The tools visible to the caller. A scoped session sees only the tools its
 * projection lists; a full session — and any not-yet-ready projection — sees the
 * whole catalog, with the server the final authority on every run. The run panel is
 * gated the same way (see {@link ToolsPage}): a scoped deep-link to an unprojected
 * tool renders a "not available" state rather than mounting the run panel.
 */
function projectedTools(names: readonly string[], state: CapabilityState): readonly string[] {
  if (state.status !== 'ready' || isFullProjection(state.projection)) return names;
  const allowed = new Set(state.projection.tools);
  return names.filter((name) => allowed.has(name));
}

/** A flat, ungrouped list of tool names — the view when no tags are available. */
function FlatToolList({
  names,
  selected,
  preserveTags,
}: {
  readonly names: readonly string[];
  readonly selected: string | undefined;
  readonly preserveTags: readonly string[];
}): ReactNode {
  return (
    <div className="tai-stack tai-stack-2">
      {names.map((name) => (
        <ToolItem key={name} name={name} selected={name === selected} preserveTags={preserveTags} />
      ))}
    </div>
  );
}

/** A group of tools sharing one tag, rendered under a titled, counted header. */
function TagGroup({
  label,
  names,
  selected,
  preserveTags,
}: {
  readonly label: string;
  readonly names: readonly string[];
  readonly selected: string | undefined;
  readonly preserveTags: readonly string[];
}): ReactNode {
  return (
    <section className="tai-stack tai-stack-2">
      <h3 className="tai-label">
        {label} <span className="tai-muted">{names.length}</span>
      </h3>
      {names.map((name) => (
        <ToolItem key={name} name={name} selected={name === selected} preserveTags={preserveTags} />
      ))}
    </section>
  );
}

interface TagVocabularyEntry {
  readonly token: string;
  readonly label: string;
  readonly count: number;
}

/** A togglable tag chip; `aria-pressed` reflects whether the tag filters the list.
 * `.tai-chip` paints the pressed tint on `aria-pressed="true"`, so selection needs
 * no colour of its own. */
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
 * cap, with the remainder collapsed into a STATIC "+N more" count (not an expander —
 * every collapsed tag still appears as a group header below). */
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

function ToolList({
  selected,
  selectedTags,
}: {
  readonly selected: string | undefined;
  readonly selectedTags: readonly string[];
}): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const { state } = useCapabilities();
  const toolsQuery = useQuery({ queryKey: toolsListKey, queryFn: () => api.listTools() });
  const tagsQuery = useQuery({ queryKey: toolTagsKey, queryFn: () => api.listToolTags() });

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
  const names = projectedTools(toolsQuery.data, state);
  if (names.length === 0) {
    return (
      <EmptyState
        title="No tools available"
        description="The skeleton has no registered tools to run."
      />
    );
  }

  // A tags failure must not take down tool browsing: fall back to the flat list and
  // surface the failure loudly on the tag row (never a silent empty tag view).
  if (tagsQuery.isError) {
    return (
      <div className="tai-stack">
        <ErrorState
          message={errorMessage(tagsQuery.error)}
          onRetry={() => void tagsQuery.refetch()}
        />
        <FlatToolList names={names} selected={selected} preserveTags={selectedTags} />
      </div>
    );
  }
  // While tags load the list already renders flat (browsing never waits on tags).
  if (tagsQuery.isPending) {
    return <FlatToolList names={names} selected={selected} preserveTags={selectedTags} />;
  }

  const tagsByTool = new Map<string, readonly string[]>(
    tagsQuery.data.map((entry: ToolTagEntry) => [entry.name, entry.tags]),
  );
  const tagsFor = (name: string): readonly string[] => tagsByTool.get(name) ?? [];

  // The tag vocabulary: every distinct tag with the count of tools carrying it,
  // sorted, plus an "Untagged" pseudo-tag counting the tools with no tag.
  const counts = new Map<string, number>();
  let untaggedCount = 0;
  for (const name of names) {
    const tags = tagsFor(name);
    if (tags.length === 0) {
      untaggedCount += 1;
      continue;
    }
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const vocabulary: TagVocabularyEntry[] = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, count]) => ({ token: label, label, count }));
  if (untaggedCount > 0) {
    vocabulary.push({ token: UNTAGGED_TOKEN, label: UNTAGGED_LABEL, count: untaggedCount });
  }
  // A selected token whose tools have all vanished (a stale/shared `?tags=` link) still
  // renders as an active chip so it can be toggled off — otherwise the filter would strand
  // the user on "No tools match" with no in-page way to clear it.
  for (const token of selectedTags) {
    if (!vocabulary.some((entry) => entry.token === token)) {
      vocabulary.push({
        token,
        label: token === UNTAGGED_TOKEN ? UNTAGGED_LABEL : token,
        count: 0,
      });
    }
  }

  // No tags anywhere and no selection → the flat list, no filter row.
  if (vocabulary.length === 0) {
    return <FlatToolList names={names} selected={selected} preserveTags={selectedTags} />;
  }

  const selectedSet = new Set(selectedTags);
  const toggle = (token: string): void => {
    const next = selectedSet.has(token)
      ? selectedTags.filter((t) => t !== token)
      : [...selectedTags, token];
    navigate('tools', { tool: selected, tags: next.length > 0 ? next : undefined });
  };

  // OR semantics: no selection shows every tool; otherwise a tool matches when it
  // carries any selected tag, or is untagged and the "Untagged" chip is selected.
  const matches = (name: string): boolean => {
    if (selectedSet.size === 0) return true;
    const tags = tagsFor(name);
    if (tags.length === 0) return selectedSet.has(UNTAGGED_TOKEN);
    return tags.some((tag) => selectedSet.has(tag));
  };
  const filtered = names.filter(matches);

  // Group the filtered tools under each tag they carry (untagged last); a multi-tag
  // tool appears under every one of its tags. Each group carries its reserved token so
  // its React key never collides with a real tag that happens to be spelled "Untagged".
  const groups: { token: string; label: string; names: string[] }[] = vocabulary
    .filter((entry) => entry.token !== UNTAGGED_TOKEN)
    .map((entry) => ({
      token: entry.token,
      label: entry.label,
      names: filtered.filter((name) => tagsFor(name).includes(entry.label)),
    }))
    .filter((group) => group.names.length > 0);
  const untaggedFiltered = filtered.filter((name) => tagsFor(name).length === 0);
  if (untaggedFiltered.length > 0) {
    groups.push({ token: UNTAGGED_TOKEN, label: UNTAGGED_LABEL, names: untaggedFiltered });
  }

  return (
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
              names={group.names}
              selected={selected}
              preserveTags={selectedTags}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ToolsPage({ search }: PageProps<'tools'>): ReactNode {
  const selected = search.tool;
  const selectedTags = search.tags ?? [];
  const { state } = useCapabilities();
  const navigate = useAppNavigate();
  const { isSinglePane } = useBreakpoint();

  const listRef = useRef<HTMLDivElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  // Seed the previous selection on MOUNT so an initial `?tool=` deep-link never steals
  // focus (focus moves only on a client-side selection change, never on load).
  const prevSelected = useRef<string | undefined>(selected);

  useEffect(() => {
    if (selected === prevSelected.current) return;
    const previous = prevSelected.current;
    prevSelected.current = selected;
    if (selected !== undefined) {
      // Moved INTO a selection → focus the detail heading (present when the tool is
      // available; a scoped-unavailable selection has no heading to take focus).
      detailHeadingRef.current?.focus();
    } else if (previous !== undefined) {
      // Cleared (Back) → return focus to the list row it came from, matched inside the
      // list pane by the link's own accessible name.
      listRef.current?.querySelector<HTMLElement>(`[aria-label="Open tool ${previous}"]`)?.focus();
    }
  }, [selected]);

  // Projection ⊆ gate: a scoped caller who deep-links `?tool=<tool outside its
  // projection>` must NOT get the run panel + extensions editor for a tool the
  // server would 403 on (the run action is server-gated; the UI must not advertise
  // a door the gate denies). A full — or not-yet-ready — projection defers to the
  // server and shows any selected tool.
  const selectionAvailable =
    selected === undefined ||
    state.status !== 'ready' ||
    isFullProjection(state.projection) ||
    state.projection.tools.includes(selected);

  // Below 1024 exactly one pane shows: the detail (with a Back control) once a tool is
  // chosen, otherwise the list. Above 1024 both panes show and `data-pane` is inert.
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
            <ToolList selected={selected} selectedTags={selectedTags} />
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
    </Stack>
  );
}
