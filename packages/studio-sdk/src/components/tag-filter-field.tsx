/** `ToolPicker`'s tag filter field and its "no filter" sentinel value. */
import type { ReactNode } from 'react';

import { Field } from './field';
import { Select } from './select';

// Radix `Select.Item` forbids an empty-string value, so the "no filter" choice
// uses a sentinel rather than ''. A tool literally tagged this string would just
// never be filtered out — harmless for a UI convenience whose authority is the server.
export const ALL_TAGS = '__all_tags__';

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
