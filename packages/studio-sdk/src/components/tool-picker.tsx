/**
 * `ToolPicker` — a controlled single-select over the tool names a host offers, built
 * on the DS `Select` so features share one picker instead of each re-implementing
 * a listbox (the same reason `SchemaForm` lives in the SDK). It is
 * PRESENTATIONAL: the host owns the tool list read and hands it in as `query`, and
 * owns the selected value; this component fetches nothing.
 *
 * The picker owns its `Field` (with `label`) and draws the read's states in it: pending
 * (a disabled `Select` reading "Loading tools…"), error (`ErrorState` with Retry, or the
 * host's `errorNote` line where the same failure is drawn with Retry elsewhere), refused
 * (a 403 with `forbiddenNote` set), and loaded with nothing to offer (the host's
 * `emptyNote`, then its `emptyAction`). The host's `error` shows, and the `Field` claims
 * its control id, exactly while a `Select` renders.
 *
 * Optional extensions, each inert unless supplied:
 *  - `excludeNames` removes names from the options (e.g. a preset cannot be
 *    another preset's base, so the preset create flow excludes existing preset
 *    names). The server stays the authority — a slipped-through name is rejected
 *    loudly there — this is only a UI convenience.
 *  - `unlistedLabel` flags a stored value the loaded list does not carry: it is the
 *    first option, labelled `<value> (<unlistedLabel>)`, with a warning line under the
 *    control. It never blocks: the server judges the save.
 *  - `tagsByTool` (from GET /api/tools/tags) turns on tag GROUPING + a tag FILTER:
 *    the options are grouped under their tag and a filter control narrows them to
 *    a chosen tag.
 *  - `agentToolNames` suffixes the LABEL of any option whose name is an agent run
 *    tool with " (agent)" (in grouped and flat renderings alike) — a purely visual
 *    honesty cue; the value stays the bare name and no option is excluded, since an
 *    agent run tool is a legal preset base for an authored agent.
 *  - `displayNames` (from the tool-meta overlay) overlays a human name onto the
 *    LABEL: a mapped option reads `Display Name (raw_name)`, an unmapped name (or a
 *    mapping equal to the raw name) reads the bare raw name. The value stays the raw
 *    name and grouping/filtering/exclusion key off raw names alone, so a display
 *    name is purely cosmetic.
 *  - `badgesByTool` (native ∪ overlay, from the tool-meta merge) surfaces the
 *    SELECTED tool's DECLARED capability badges as read-only chips beneath the
 *    select. Badges are INFORMATIONAL — the tooltip says so — never a gate, so they
 *    change nothing about which options select or how they group.
 *
 * SAFETY: a tool name, a tag, a display name, AND a badge are server-supplied, so
 * every one renders as TEXT (React escapes it) — never an HTML sink. Pinned by a test.
 */
import { type ReactNode, useId, useState } from 'react';

import { errorMessage, isForbiddenError } from '../errors';
import { Badge } from './badge';
import { Field } from './field';
import { ErrorState } from './primitives';
import type { SelectOption } from './select';
import { ALL_TAGS, SelectedToolBadges, TagFilterField, ToolSelect } from './tool-picker-parts';

export { BADGES_NOTE } from './tool-picker-parts';

const MUTED_LINE = { margin: 0, color: 'var(--tai-color-text-muted)' } as const;

/**
 * The subset of a tool list read this picker reads: `data` is the names the host
 * offers. A caller's TanStack `UseQueryResult<readonly string[]>` satisfies it
 * structurally, so the SDK names no query library.
 */
export interface ToolListQuery {
  readonly data: readonly string[] | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly isSuccess: boolean;
  readonly error: unknown;
  readonly refetch: () => void;
}

export interface ToolPickerProps {
  /** The tool list read the host owns, `data` projected to the names it offers. */
  readonly query: ToolListQuery;
  readonly value: string | null;
  readonly onChange: (toolName: string) => void;
  /** The empty state's sentence, drawn when the loaded list offers no option (after `excludeNames`). */
  readonly emptyNote: string;
  /** Drawn after `emptyNote` in the empty state (e.g. a link to where tools come from). */
  readonly emptyAction?: ReactNode;
  /**
   * Drawn in place of the `ErrorState` and the control when the read fails, with no
   * Retry: for a host that already draws the same read's failure with Retry elsewhere.
   */
  readonly errorNote?: string;
  /** Drawn on a 403 of the read in place of the error state (the no-grant state). */
  readonly forbiddenNote?: string;
  /** Flags a stored value the loaded list does not carry (see the module docs). */
  readonly unlistedLabel?: string;
  readonly disabled?: boolean;
  /** Shown once the list is loaded; a pending read reads "Loading tools…". */
  readonly placeholder?: string;
  readonly idPrefix?: string;
  readonly label?: string;
  /** Handed to the picker's `Field` (with `label`). */
  readonly description?: string;
  /** The host's field error, shown under the control while a `Select` renders (with `label`). */
  readonly error?: string;
  /**
   * Accessible name for the tool listbox when `label` renders none and no
   * enclosing `Field` names it. `label` wins where both are given: it names the
   * control from visible text, and the `Select` drops a caller name it would
   * otherwise override.
   */
  readonly 'aria-label'?: string;
  /** Names removed from the options (the server remains the authority). */
  readonly excludeNames?: readonly string[];
  /** Per-tool native tags; when present, options are grouped and a tag filter shows. */
  readonly tagsByTool?: Readonly<Record<string, readonly string[]>>;
  /** Tool names that are agent run tools; their option labels are suffixed " (agent)". */
  readonly agentToolNames?: ReadonlySet<string>;
  /**
   * Human display names keyed by raw tool name (from the tool-meta overlay). A
   * mapped option's label reads `Display Name (raw_name)`; an unmapped name — or a
   * mapping equal to the raw name — reads the bare raw name. The value `onChange`
   * emits stays the raw name in every case.
   */
  readonly displayNames?: Readonly<Record<string, string>>;
  /**
   * Per-tool DECLARED capability badges (native ∪ overlay). When present, the
   * selected tool's badges render as read-only chips beneath the select — purely
   * informational, never affecting which options show or how they group.
   */
  readonly badgesByTool?: Readonly<Record<string, readonly string[]>>;
}

/** Which of the picker's states the read and the stored value put it in. */
type PickerPhase = 'refused' | 'error' | 'unlisted' | 'empty' | 'select';

interface PickerState {
  readonly phase: PickerPhase;
  readonly available: readonly string[];
  /** The stored value, or `null` for none. */
  readonly stored: string | null;
  readonly pending: boolean;
  /** The loaded list lacks the stored value and an `unlistedLabel` asks for the flag. */
  readonly unlisted: boolean;
  readonly empty: boolean;
}

function phaseOf(
  refused: boolean,
  failed: boolean,
  unlisted: boolean,
  empty: boolean,
): PickerPhase {
  if (refused) return 'refused';
  if (failed) return 'error';
  if (unlisted) return 'unlisted';
  return empty ? 'empty' : 'select';
}

function pickerState(
  query: ToolListQuery,
  value: string | null,
  excludeNames: readonly string[] | undefined,
  forbiddenNote: string | undefined,
  unlistedLabel: string | undefined,
): PickerState {
  const excluded = new Set(excludeNames ?? []);
  const available = (query.data ?? []).filter((name) => !excluded.has(name));
  const stored = value !== null && value !== '' ? value : null;
  const loaded = query.isSuccess && !query.isError;
  const unlisted =
    unlistedLabel !== undefined && loaded && stored !== null && !available.includes(stored);
  const empty = loaded && available.length === 0;
  const refused = forbiddenNote !== undefined && query.isError && isForbiddenError(query.error);
  const phase = phaseOf(refused, query.isError, unlisted, empty);
  return { phase, available, stored, pending: !loaded && !query.isError, unlisted, empty };
}

/** The distinct tags across `names`, sorted, feeding the filter control. */
function tagsAcross(
  names: readonly string[],
  tagsByTool: Readonly<Record<string, readonly string[]>>,
): string[] {
  return [...new Set(names.flatMap((name) => tagsByTool[name] ?? []))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/** The tag filter's choices, and the available names the chosen tag keeps. */
function tagView(
  state: PickerState,
  tagsByTool: Readonly<Record<string, readonly string[]>> | undefined,
  tagFilter: string,
): { readonly allTags: readonly string[]; readonly filtered: readonly string[] } {
  if (tagsByTool === undefined) return { allTags: [], filtered: state.available };
  const listed = !state.pending && state.phase !== 'error' && state.phase !== 'refused';
  return {
    allTags: listed ? tagsAcross(state.available, tagsByTool) : [],
    filtered:
      tagFilter === ALL_TAGS
        ? state.available
        : state.available.filter((name) => (tagsByTool[name] ?? []).includes(tagFilter)),
  };
}

function MutedLine({ text }: { readonly text: string }): ReactNode {
  return (
    <p role="status" style={MUTED_LINE}>
      {text}
    </p>
  );
}

function ReadError({ query }: { readonly query: ToolListQuery }): ReactNode {
  return (
    <ErrorState
      message={errorMessage(query.error)}
      onRetry={() => {
        query.refetch();
      }}
    />
  );
}

export function ToolPicker({
  query,
  value,
  onChange,
  emptyNote,
  emptyAction,
  errorNote,
  forbiddenNote,
  unlistedLabel,
  disabled,
  placeholder = 'Select a tool…',
  idPrefix = 'tool-picker',
  label,
  description,
  error,
  'aria-label': ariaLabel,
  excludeNames,
  tagsByTool,
  agentToolNames,
  displayNames,
  badgesByTool,
}: ToolPickerProps) {
  const [tagFilter, setTagFilter] = useState<string>(ALL_TAGS);
  const unlistedId = useId();
  const state = pickerState(query, value, excludeNames, forbiddenNote, unlistedLabel);
  const { phase, stored } = state;

  const { allTags, filtered } = tagView(state, tagsByTool, tagFilter);

  const select = (options: readonly string[], leading: SelectOption | undefined): ReactNode => (
    <ToolSelect
      tagsByTool={tagsByTool}
      filtered={options}
      value={value}
      onChange={onChange}
      placeholder={state.pending ? 'Loading tools…' : placeholder}
      ariaLabel={ariaLabel}
      ariaDescribedBy={state.unlisted ? unlistedId : undefined}
      disabled={disabled === true || state.pending}
      displayNames={displayNames}
      agentToolNames={agentToolNames}
      leading={leading}
    />
  );
  const emptyState = (
    <>
      <MutedLine text={emptyNote} />
      {emptyAction}
    </>
  );

  // Only a rendered `Select` claims the field's control id; with none the host's
  // error is hidden and the note in its place says why the field is empty.
  const selectRenders =
    phase === 'unlisted' || phase === 'select' || (phase === 'refused' && stored !== null);
  const contentByPhase: Record<PickerPhase, () => ReactNode> = {
    // A stored value stays as the sole, unflagged option: without the list the form claims nothing about it.
    refused: () => (
      <>
        {stored !== null ? select([], { value: stored, label: stored }) : null}
        <MutedLine text={forbiddenNote ?? ''} />
      </>
    ),
    error: () =>
      errorNote !== undefined ? <MutedLine text={errorNote} /> : <ReadError query={query} />,
    unlisted: () => (
      <>
        {select(filtered, {
          value: stored ?? '',
          label: `${stored ?? ''} (${unlistedLabel ?? ''})`,
        })}
        {state.empty ? emptyState : null}
        <p id={unlistedId} className="tai-field-hint" style={{ margin: 0 }}>
          <Badge variant="warning">{unlistedLabel}</Badge> {stored} is {unlistedLabel}. Pick
          another, or saving is refused.
        </p>
      </>
    ),
    empty: () => emptyState,
    select: () => select(filtered, undefined),
  };
  const content = contentByPhase[phase]();

  return (
    <div data-testid={idPrefix} className="tai-stack tai-stack-2">
      {allTags.length > 0 ? (
        <TagFilterField
          allTags={allTags}
          tagFilter={tagFilter}
          onTagFilterChange={setTagFilter}
          disabled={disabled}
        />
      ) : null}
      {label !== undefined ? (
        <Field
          label={label}
          description={description}
          error={selectRenders ? error : undefined}
          group={!selectRenders}
        >
          {content}
        </Field>
      ) : (
        content
      )}
      <SelectedToolBadges value={value} badgesByTool={badgesByTool} idPrefix={idPrefix} />
    </div>
  );
}
