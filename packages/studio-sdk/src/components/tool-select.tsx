/**
 * `ToolPicker`'s tool `Select`: grouped by tag or flat, with the option-label and
 * grouping helpers it renders from.
 */
import type { ReactNode } from 'react';

import { toolDisplayLabel } from '../hooks/useToolDisplayNames';
import { Select, type SelectGroup, type SelectOption } from './select';

const NO_DISPLAY_NAMES: Readonly<Record<string, string>> = {};
const UNTAGGED = 'Untagged';

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

/** The tool select: grouped by tag when `tagsByTool` is present, else a flat list.
 *  Either branch is a `Select`, which claims the enclosing `Field`'s control id. */
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
  if (tagsByTool !== undefined) {
    const groups = buildGroups(filtered, tagsByTool, displayNames, agentToolNames);
    return (
      <Select
        groups={
          leading === undefined ? groups : [{ label: leading.label, options: [leading] }, ...groups]
        }
        value={value ?? ''}
        onValueChange={onChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
      />
    );
  }
  const options = filtered.map((name) => ({
    value: name,
    label: optionLabel(name, displayNames, agentToolNames),
  }));
  return (
    <Select
      // Keep Radix controlled even when the caller's value is null: `''` matches no
      // item (placeholder still shows) and avoids the uncontrolled→controlled warning
      // a subsequent selection would otherwise trigger.
      options={leading === undefined ? options : [leading, ...options]}
      value={value ?? ''}
      onValueChange={onChange}
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      disabled={disabled}
    />
  );
}
