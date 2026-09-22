/**
 * `ToolPicker` — a controlled single-select over the available tool names, built
 * on the DS `Select` so features share one picker instead of each re-implementing
 * a listbox (the same reason `SchemaForm` lives in the SDK). It is
 * PRESENTATIONAL: the caller fetches the tool names (GET /api/tools) and owns the
 * selected value; this component fetches nothing.
 *
 * Four optional extensions, each inert unless supplied; the preset create flow
 * passes all four and the multi-tool picker every one but `agentToolNames`:
 *  - `excludeNames` removes names from the options (e.g. a preset cannot be
 *    another preset's base, so the preset create flow excludes existing preset
 *    names). The server stays the authority — a slipped-through name is rejected
 *    loudly there — this is only a UI convenience.
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
import { useState } from 'react';

import { Field } from './field';
import { ALL_TAGS, SelectedToolBadges, TagFilterField, ToolSelect } from './tool-picker-parts';

export { BADGES_NOTE } from './tool-picker-parts';

/** The trigger copy when the picker has no option to offer at all (after exclusions).
 *  Shown only once the list has settled — a still-loading picker keeps its own
 *  placeholder — so it never misreads a pending fetch as "nothing to pick". */
const NO_TOOLS_AVAILABLE = 'No tools available';

export interface ToolPickerProps {
  readonly toolNames: readonly string[];
  readonly value: string | null;
  readonly onChange: (toolName: string) => void;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly idPrefix?: string;
  readonly label?: string;
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

export function ToolPicker({
  toolNames,
  value,
  onChange,
  disabled,
  placeholder = 'Select a tool…',
  idPrefix = 'tool-picker',
  label,
  'aria-label': ariaLabel,
  excludeNames,
  tagsByTool,
  agentToolNames,
  displayNames,
  badgesByTool,
}: ToolPickerProps) {
  const [tagFilter, setTagFilter] = useState<string>(ALL_TAGS);

  const excluded = new Set(excludeNames ?? []);
  const available = toolNames.filter((name) => !excluded.has(name));

  // A settled, empty option set (not a load in progress) is a "nothing to pick"
  // state: the trigger reads the empty copy and cannot open onto an empty popup. The
  // caller's `disabled` still marks a loading picker, which keeps its own placeholder.
  const noneAvailable = available.length === 0;
  const pickerDisabled = disabled === true || noneAvailable;
  const pickerPlaceholder = noneAvailable && disabled !== true ? NO_TOOLS_AVAILABLE : placeholder;

  // Distinct tags across the available tools, sorted, feeding the filter control.
  const allTags =
    tagsByTool === undefined
      ? []
      : [...new Set(available.flatMap((name) => tagsByTool[name] ?? []))].sort((a, b) =>
          a.localeCompare(b),
        );

  const filtered =
    tagsByTool !== undefined && tagFilter !== ALL_TAGS
      ? available.filter((name) => (tagsByTool[name] ?? []).includes(tagFilter))
      : available;

  const toolSelect = (
    <ToolSelect
      tagsByTool={tagsByTool}
      filtered={filtered}
      value={value}
      onChange={onChange}
      placeholder={pickerPlaceholder}
      ariaLabel={ariaLabel}
      disabled={pickerDisabled}
      displayNames={displayNames}
      agentToolNames={agentToolNames}
    />
  );

  return (
    <div data-testid={idPrefix} className="tai-stack tai-stack-2">
      {tagsByTool !== undefined && allTags.length > 0 ? (
        <TagFilterField
          allTags={allTags}
          tagFilter={tagFilter}
          onTagFilterChange={setTagFilter}
          disabled={disabled}
        />
      ) : null}
      {label !== undefined ? <Field label={label}>{toolSelect}</Field> : toolSelect}
      <SelectedToolBadges value={value} badgesByTool={badgesByTool} idPrefix={idPrefix} />
    </div>
  );
}
