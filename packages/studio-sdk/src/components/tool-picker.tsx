/**
 * `ToolPicker` — a controlled single-select over the available tool names, built
 * on the DS `Select` so features share one picker instead of each re-implementing
 * a listbox (the same reason `SchemaForm` lives in the SDK). It is
 * PRESENTATIONAL: the caller fetches the tool names (GET /api/tools) and owns the
 * selected value; this component fetches nothing.
 *
 * Two optional extensions, both inert unless supplied (every existing call site
 * passes neither):
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
 *
 * SAFETY: a tool name AND a tag are server-supplied, so every name/tag renders as
 * TEXT through the DS `Select` (React escapes it) — never an HTML sink. Pinned by
 * a test.
 */
import { useState } from 'react';

import { Field } from './field';
import { Select, type SelectGroup } from './select';

export interface ToolPickerProps {
  readonly toolNames: readonly string[];
  readonly value: string | null;
  readonly onChange: (toolName: string) => void;
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly idPrefix?: string;
  readonly label?: string;
  /** Names removed from the options (the server remains the authority). */
  readonly excludeNames?: readonly string[];
  /** Per-tool native tags; when present, options are grouped and a tag filter shows. */
  readonly tagsByTool?: Readonly<Record<string, readonly string[]>>;
  /** Tool names that are agent run tools; their option labels are suffixed " (agent)". */
  readonly agentToolNames?: ReadonlySet<string>;
}

const UNTAGGED = 'Untagged';
// Radix `Select.Item` forbids an empty-string value, so the "no filter" choice
// uses a sentinel rather than ''. A tool literally tagged this string would just
// never be filtered out — harmless for a UI convenience whose authority is the server.
const ALL_TAGS = '__all_tags__';

/** The group a tool sorts into: its alphabetically-first tag, else "Untagged". */
function groupFor(name: string, tagsByTool: Readonly<Record<string, readonly string[]>>): string {
  const tags = [...(tagsByTool[name] ?? [])].sort((a, b) => a.localeCompare(b));
  return tags[0] ?? UNTAGGED;
}

/** The option label: the bare name, suffixed " (agent)" for an agent run tool. */
function optionLabel(name: string, agentToolNames: ReadonlySet<string> | undefined): string {
  return agentToolNames?.has(name) === true ? `${name} (agent)` : name;
}

/** Build the grouped option clusters (sorted group labels, "Untagged" last). */
function buildGroups(
  names: readonly string[],
  tagsByTool: Readonly<Record<string, readonly string[]>>,
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
        label: optionLabel(name, agentToolNames),
      })),
    }));
}

export function ToolPicker({
  toolNames,
  value,
  onChange,
  disabled,
  placeholder = 'Select a tool…',
  idPrefix = 'tool-picker',
  label,
  excludeNames,
  tagsByTool,
  agentToolNames,
}: ToolPickerProps) {
  const [tagFilter, setTagFilter] = useState<string>(ALL_TAGS);

  const excluded = new Set(excludeNames ?? []);
  const available = toolNames.filter((name) => !excluded.has(name));

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

  const toolSelect =
    tagsByTool !== undefined ? (
      <Select
        options={[]}
        groups={buildGroups(filtered, tagsByTool, agentToolNames)}
        value={value ?? ''}
        onValueChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    ) : (
      <Select
        // Keep Radix controlled even when the caller's value is null: `''` matches no
        // item (placeholder still shows) and avoids the uncontrolled→controlled warning
        // a subsequent selection would otherwise trigger.
        options={filtered.map((name) => ({
          value: name,
          label: optionLabel(name, agentToolNames),
        }))}
        value={value ?? ''}
        onValueChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
      />
    );

  return (
    <div data-testid={idPrefix} className="tai-stack tai-stack-2">
      {tagsByTool !== undefined && allTags.length > 0 ? (
        <Field label="Filter by tag">
          <Select
            options={[
              { value: ALL_TAGS, label: 'All tags' },
              ...allTags.map((tag) => ({ value: tag, label: tag })),
            ]}
            value={tagFilter}
            onValueChange={setTagFilter}
            aria-label="Filter tools by tag"
            disabled={disabled}
          />
        </Field>
      ) : null}
      {label !== undefined ? <Field label={label}>{toolSelect}</Field> : toolSelect}
    </div>
  );
}
