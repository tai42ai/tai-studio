/**
 * `ToolPicker`'s tool select: a `SearchableSelect`, grouped by tag or flat, with the
 * option-label and grouping helpers it renders from. Its search matches the option
 * label, which carries both the display name and the raw name (`toolDisplayLabel`).
 */
import { type ReactNode, useMemo } from 'react';

import { toolDisplayLabel } from '../hooks/useToolDisplayNames';
import { SearchableSelect } from './searchable-select';
import type { SelectGroup, SelectOption } from './select';

const NO_DISPLAY_NAMES: Readonly<Record<string, string>> = {};
const UNTAGGED = 'Untagged';
const SEARCH_LABEL = 'Search tools';

/** The group a tool sorts into: its alphabetically-first tag, else "Untagged". */
function groupFor(name: string, tagsByTool: Readonly<Record<string, readonly string[]>>): string {
  const tags = [...(tagsByTool[name] ?? [])].sort((a, b) => a.localeCompare(b));
  return tags[0] ?? UNTAGGED;
}

/**
 * The option label: `Display Name (raw)` when a distinct non-empty display name maps
 * the name, else the bare name; either way suffixed " (agent)" for an agent run tool.
 */
function optionLabel(
  name: string,
  displayNames: Readonly<Record<string, string>> | undefined,
  agentToolNames: ReadonlySet<string> | undefined,
): string {
  const base = toolDisplayLabel(displayNames ?? NO_DISPLAY_NAMES, name);
  return agentToolNames?.has(name) === true ? `${base} (agent)` : base;
}

/** Build the grouped option clusters (sorted group labels, "Untagged" last). */
function buildGroups(
  names: readonly string[],
  tagsByTool: Readonly<Record<string, readonly string[]>>,
  displayNames: Readonly<Record<string, string>> | undefined,
  agentToolNames: ReadonlySet<string> | undefined,
): SelectGroup[] {
  const byGroup = new Map<string, string[]>();
  for (const name of names) {
    const group = groupFor(name, tagsByTool);
    const bucket = byGroup.get(group) ?? [];
    bucket.push(name);
    byGroup.set(group, bucket);
  }
  return [...byGroup.entries()]
    .sort(([a], [b]) => {
      if (a === UNTAGGED) return 1;
      if (b === UNTAGGED) return -1;
      return a.localeCompare(b);
    })
    .map(([label, groupNames]) => ({
      label,
      options: groupNames.map((name) => ({
        value: name,
        label: optionLabel(name, displayNames, agentToolNames),
      })),
    }));
}

interface ToolSelectProps {
  readonly tagsByTool: Readonly<Record<string, readonly string[]>> | undefined;
  readonly filtered: readonly string[];
  readonly value: string | null;
  readonly onChange: (toolName: string) => void;
  readonly placeholder: string;
  readonly ariaLabel: string | undefined;
  readonly disabled: boolean | undefined;
  readonly displayNames: Readonly<Record<string, string>> | undefined;
  readonly agentToolNames: ReadonlySet<string> | undefined;
  /** An option drawn ahead of the list's own (a stored value the list does not carry). */
  readonly leading: SelectOption | undefined;
  readonly ariaDescribedBy: string | undefined;
}

/** The select's options: tag groups when `tagsByTool` is present, else one flat run,
 *  with `leading` ahead of either. */
function toolListing(
  filtered: readonly string[],
  tagsByTool: Readonly<Record<string, readonly string[]>> | undefined,
  displayNames: Readonly<Record<string, string>> | undefined,
  agentToolNames: ReadonlySet<string> | undefined,
  leading: SelectOption | undefined,
): { readonly groups: readonly SelectGroup[] } | { readonly options: readonly SelectOption[] } {
  if (tagsByTool !== undefined) {
    const groups = buildGroups(filtered, tagsByTool, displayNames, agentToolNames);
    return {
      groups:
        leading === undefined ? groups : [{ label: leading.label, options: [leading] }, ...groups],
    };
  }
  const options = filtered.map((name) => ({
    value: name,
    label: optionLabel(name, displayNames, agentToolNames),
  }));
  return { options: leading === undefined ? options : [leading, ...options] };
}

/** The tool select: grouped by tag when `tagsByTool` is present, else a flat list.
 *  Either branch is a `SearchableSelect`, which claims the enclosing `Field`'s control id. */
export function ToolSelect({
  tagsByTool,
  filtered,
  value,
  onChange,
  placeholder,
  ariaLabel,
  disabled,
  displayNames,
  agentToolNames,
  leading,
  ariaDescribedBy,
}: ToolSelectProps): ReactNode {
  // Memoised so a host re-render keeps the indexed options of an open list.
  const listing = useMemo(
    () => toolListing(filtered, tagsByTool, displayNames, agentToolNames, leading),
    [filtered, tagsByTool, displayNames, agentToolNames, leading],
  );
  const shared = {
    value: value ?? '',
    onValueChange: onChange,
    placeholder,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    disabled,
    searchLabel: SEARCH_LABEL,
  };
  return 'groups' in listing ? (
    <SearchableSelect {...shared} groups={listing.groups} />
  ) : (
    <SearchableSelect {...shared} options={listing.options} />
  );
}
