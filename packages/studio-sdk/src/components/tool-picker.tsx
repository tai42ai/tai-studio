/**
 * `ToolPicker` — a controlled single-select over the tool names a host offers, built
 * on the DS `SearchableSelect` so features share one picker instead of each
 * re-implementing a listbox (the same reason `SchemaForm` lives in the SDK). It is
 * PRESENTATIONAL: the host owns the tool list read and hands it in as `query`, and
 * owns the selected value; this component fetches nothing.
 *
 * Opening the picker opens a search box: typing narrows the options to the tools whose
 * label or description contains the text, ignoring case. The label carries the display
 * name and the raw name, so either finds the tool; a host's `toolDescriptions` adds each
 * tool's description, drawn under its label and searched with it.
 *
 * The picker owns its `Field` (with `label`) and draws the read's states in it: pending
 * (a disabled select reading "Loading tools…"), error (`ErrorState` with Retry, or the
 * host's `errorNote` line where the same failure is drawn with Retry elsewhere), refused
 * (a 403 where the host sets no `errorNote`: the session may not list tools, so a text
 * input takes the tool's name, with a note saying why there is no list; the server
 * checks the name on save), and loaded with
 * nothing to offer (the host's `emptyNote`, then its `emptyAction`). The host's `error`
 * shows, and the `Field` claims its control id, exactly while a select or the typed
 * entry renders.
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
 *    name and grouping/tag filtering/exclusion key off raw names alone; the display
 *    name only labels the option, and so is what the search reads with the raw name.
 *  - `toolDescriptions` (each tool's own description) draws a tool's description as
 *    a quieter line under its option and lets the search find the tool by it, by the
 *    same rule that matches its label.
 *  - `badgesByTool` (native ∪ overlay, from the tool-meta merge) surfaces the
 *    SELECTED tool's DECLARED capability badges as read-only chips beneath the
 *    select. Badges are INFORMATIONAL — the tooltip says so — never a gate, so they
 *    change nothing about which options select or how they group.
 *
 * SAFETY: a tool name, a tag, a display name, AND a badge are server-supplied, so
 * every one renders as TEXT (React escapes it) — never an HTML sink. Pinned by a test.
 */
import { type ReactNode, useId, useMemo, useState } from 'react';

import { errorMessage, isForbiddenError } from '../errors';
import { Badge } from './badge';
import { Field } from './field';
import { ErrorState } from './primitives';
import type { SelectOption } from './select';
import { SelectedToolBadges } from './selected-tool-badges';
import { ALL_TAGS, TagFilterField } from './tag-filter-field';
import { ToolSelect } from './tool-select';
import { TypedNameEntry } from './typed-name-entry';

export { BADGES_NOTE } from './selected-tool-badges';

const MUTED_LINE = { margin: 0, color: 'var(--tai-color-text-muted)' } as const;

/** The sentence under the typed entry, naming why there is no list and what saving does. */
const TOOL_LIST_REFUSED_NOTE =
  "This session cannot list tools, so type the tool's exact name. Saving checks that the deployment serves it.";

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
   * Drawn in place of the `ErrorState` and the control when the read fails, a 403
   * included, with no Retry: for a host that already draws the same read's failure
   * elsewhere. Such a host draws no typed entry on a 403.
   */
  readonly errorNote?: string;
  /** Flags a stored value the loaded list does not carry (see the module docs). */
  readonly unlistedLabel?: string;
  readonly disabled?: boolean;
  /** Shown once the list is loaded; a pending read reads "Loading tools…". */
  readonly placeholder?: string;
  readonly idPrefix?: string;
  readonly label?: string;
  /** Handed to the picker's `Field` (with `label`). */
  readonly description?: string;
  /** The host's field error, shown under the control while one renders (with `label`). */
  readonly error?: string;
  /**
   * Accessible name for the control when `label` renders none and no enclosing
   * `Field` names it. `label` wins where both are given: it names the control from
   * visible text, and the control drops a caller name it would otherwise override.
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
   * Each tool's description keyed by raw tool name. A described option draws it under
   * its label, and the search matches it as it matches the label.
   */
  readonly toolDescriptions?: Readonly<Record<string, string>>;
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

/** The loaded names the picker offers: the read's data without `excludeNames`. */
function availableNames(
  data: readonly string[] | undefined,
  excludeNames: readonly string[] | undefined,
): readonly string[] {
  const excluded = new Set(excludeNames ?? []);
  return (data ?? []).filter((name) => !excluded.has(name));
}

function pickerState(
  query: ToolListQuery,
  available: readonly string[],
  value: string | null,
  unlistedLabel: string | undefined,
  errorNote: string | undefined,
): PickerState {
  const stored = value !== null && value !== '' ? value : null;
  const loaded = query.isSuccess && !query.isError;
  const unlisted =
    unlistedLabel !== undefined && loaded && stored !== null && !available.includes(stored);
  const empty = loaded && available.length === 0;
  // A host with `errorNote` draws the read's failure itself, a 403 included.
  const refused = errorNote === undefined && query.isError && isForbiddenError(query.error);
  const phase = phaseOf(refused, query.isError, unlisted, empty);
  return { phase, stored, pending: !loaded && !query.isError, unlisted, empty };
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

/** The sentence a host adds while a failed description read leaves the search on names alone. */
export const TOOL_SEARCH_NAMES_ONLY_NOTE = 'The tool search matches tool names only.';

/**
 * Whether a `ToolPicker` given these props draws its search: the list is loaded, the
 * select offers an option (a listed tool, or a flagged stored value) and the picker is
 * enabled. A pending, failed, refused or empty read, or a disabled picker, draws none. A
 * host reads it to say what the search matches only while the search is there.
 */
export function toolSearchShown({
  query,
  value,
  excludeNames,
  unlistedLabel,
  disabled,
}: Pick<
  ToolPickerProps,
  'query' | 'value' | 'excludeNames' | 'unlistedLabel' | 'disabled'
>): boolean {
  const state = pickerState(
    query,
    availableNames(query.data, excludeNames),
    value,
    unlistedLabel,
    undefined,
  );
  return selectView(state, disabled).searchShown;
}

/**
 * The picker's select: drawn in the `select` and `unlisted` phases, disabled while the
 * host disables the picker or the read is pending. Its search opens only from a drawn,
 * enabled select.
 */
interface SelectView {
  readonly drawn: boolean;
  readonly disabled: boolean;
  readonly searchShown: boolean;
}

function selectView(state: PickerState, disabled: boolean | undefined): SelectView {
  const drawn = state.phase === 'select' || state.phase === 'unlisted';
  const locked = disabled === true || state.pending;
  return { drawn, disabled: locked, searchShown: drawn && !locked };
}

/** The tag filter's choices, and the available names the chosen tag keeps. */
function tagView(
  available: readonly string[],
  listed: boolean,
  tagsByTool: Readonly<Record<string, readonly string[]>> | undefined,
  tagFilter: string,
): { readonly allTags: readonly string[]; readonly filtered: readonly string[] } {
  if (tagsByTool === undefined) return { allTags: [], filtered: available };
  return {
    allTags: listed ? tagsAcross(available, tagsByTool) : [],
    filtered:
      tagFilter === ALL_TAGS
        ? available
        : available.filter((name) => (tagsByTool[name] ?? []).includes(tagFilter)),
  };
}

/** The option drawn ahead of the list's own: an unlisted value, flagged with `unlistedLabel`. */
function leadingOption(
  phase: PickerPhase,
  stored: string | null,
  unlistedLabel: string | undefined,
): SelectOption | undefined {
  if (stored === null || phase !== 'unlisted') return undefined;
  return { value: stored, label: `${stored} (${unlistedLabel ?? ''})` };
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
  toolDescriptions,
  badgesByTool,
}: ToolPickerProps) {
  const [tagFilter, setTagFilter] = useState<string>(ALL_TAGS);
  const unlistedId = useId();
  // Memoised so a host re-render hands the select the same options, and an open
  // list keeps its rows instead of re-indexing every tool.
  const available = useMemo(
    () => availableNames(query.data, excludeNames),
    [query.data, excludeNames],
  );
  const state = pickerState(query, available, value, unlistedLabel, errorNote);
  const { phase, stored } = state;
  const view = selectView(state, disabled);

  const listed = !state.pending && phase !== 'error' && phase !== 'refused';
  const { allTags, filtered } = useMemo(
    () => tagView(available, listed, tagsByTool, tagFilter),
    [available, listed, tagsByTool, tagFilter],
  );

  const leading = useMemo(
    () => leadingOption(phase, stored, unlistedLabel),
    [phase, stored, unlistedLabel],
  );
  const select = (options: readonly string[]): ReactNode => (
    <ToolSelect
      tagsByTool={tagsByTool}
      filtered={options}
      value={value}
      onChange={onChange}
      placeholder={state.pending ? 'Loading tools…' : placeholder}
      ariaLabel={ariaLabel}
      ariaDescribedBy={state.unlisted ? unlistedId : undefined}
      disabled={view.disabled}
      displayNames={displayNames}
      toolDescriptions={toolDescriptions}
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

  // Only a rendered control claims the field's control id; with none the host's
  // error is hidden and the note in its place says why the field is empty.
  const controlRenders = view.drawn || phase === 'refused';
  // The select is drawn where `selectView` says; each phase adds its own lines beside it.
  const besideSelectByPhase: Record<PickerPhase, () => ReactNode> = {
    refused: () => (
      <TypedNameEntry
        value={stored}
        onChange={onChange}
        disabled={disabled === true}
        ariaLabel={ariaLabel}
        note={TOOL_LIST_REFUSED_NOTE}
      />
    ),
    error: () =>
      errorNote !== undefined ? <MutedLine text={errorNote} /> : <ReadError query={query} />,
    unlisted: () => (
      <>
        {state.empty ? emptyState : null}
        <p id={unlistedId} className="tai-field-hint" style={{ margin: 0 }}>
          <Badge variant="warning">{unlistedLabel}</Badge> {stored} is {unlistedLabel}. Pick
          another, or saving is refused.
        </p>
      </>
    ),
    empty: () => emptyState,
    select: () => null,
  };
  const content = (
    <>
      {view.drawn ? select(filtered) : null}
      {besideSelectByPhase[phase]()}
    </>
  );

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
          error={controlRenders ? error : undefined}
          group={!controlRenders}
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
