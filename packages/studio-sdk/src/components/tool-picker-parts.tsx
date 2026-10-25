/**
 * The pieces of `ToolPicker`: the tool `Select` itself (grouped or flat), the tag
 * filter field, and the selected tool's capability badges. The picker owns the
 * state and composes these; the option-label and grouping helpers live here too.
 */
import type { ReactNode } from 'react';

import { toolDisplayLabel } from '../hooks/useToolDisplayNames';
import { Badge } from './badge';
import { Field } from './field';
import { Select, type SelectGroup, type SelectOption } from './select';
import { Tooltip } from './tooltip';

/** The shared informational note every badge surface carries: declared, never enforced. */
export const BADGES_NOTE =
  'Declared capability labels — informational only. They describe what the tool touches; the server never enforces them.';

const NO_DISPLAY_NAMES: Readonly<Record<string, string>> = {};
const UNTAGGED = 'Untagged';
// Radix `Select.Item` forbids an empty-string value, so the "no filter" choice
// uses a sentinel rather than ''. A tool literally tagged this string would just
// never be filtered out — harmless for a UI convenience whose authority is the server.
export const ALL_TAGS = '__all_tags__';

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

/** The tag filter: an "All tags" sentinel plus one option per distinct tag. */
export function TagFilterField({
  allTags,
  tagFilter,
  onTagFilterChange,
  disabled,
}: {
  readonly allTags: readonly string[];
  readonly tagFilter: string;
  readonly onTagFilterChange: (value: string) => void;
  readonly disabled: boolean | undefined;
}): ReactNode {
  return (
    <Field label="Filter by tag">
      <Select
        options={[
          { value: ALL_TAGS, label: 'All tags' },
          ...allTags.map((tag) => ({ value: tag, label: tag })),
        ]}
        value={tagFilter}
        onValueChange={onTagFilterChange}
        disabled={disabled}
      />
    </Field>
  );
}

/** The selected tool's DECLARED capability badges, read-only and informational.
 *  Renders nothing unless the selected tool carries badges. */
export function SelectedToolBadges({
  value,
  badgesByTool,
  idPrefix,
}: {
  readonly value: string | null;
  readonly badgesByTool: Readonly<Record<string, readonly string[]>> | undefined;
  readonly idPrefix: string;
}): ReactNode {
  if (value === null || badgesByTool === undefined || (badgesByTool[value]?.length ?? 0) === 0) {
    return null;
  }
  return (
    <Tooltip content={BADGES_NOTE}>
      <span
        className="tai-row"
        data-testid={`${idPrefix}-badges`}
        style={{ gap: 'var(--tai-space-1)' }}
      >
        {(badgesByTool[value] ?? []).map((badge) => (
          <Badge key={badge} variant="neutral">
            {badge}
          </Badge>
        ))}
      </span>
    </Tooltip>
  );
}
