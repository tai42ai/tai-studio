/**
 * The base-tool picker for the create form: the shared `ToolPicker` over `listTools()`
 * (grouped by merged tags, agent tools labelled), EXCLUDING existing non-conflicted
 * preset names and effective-hidden tools. The picker draws the tools read's states in
 * its own field; a failed preset read is surfaced loudly in its place while the tools
 * read has not failed, never a silently-empty exclusion.
 */
import { errorMessage, ErrorState, ToolPicker } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import type { PresetToolCatalog } from './usePresetToolCatalog';

export function PresetBaseToolField({
  catalog,
  base,
  onChange,
  submitted,
}: {
  readonly catalog: PresetToolCatalog;
  readonly base: string | null;
  readonly onChange: (value: string | null) => void;
  readonly submitted: boolean;
}): ReactNode {
  const { toolsQuery, presetsQuery } = catalog;

  // The base-tool exclusion list depends on the preset list — a failed load is
  // surfaced loudly, never a silently-empty exclusion.
  if (presetsQuery.isError && !toolsQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(presetsQuery.error)}
        onRetry={() => void presetsQuery.refetch()}
      />
    );
  }

  const baseMissing = base === null || base === '';
  return (
    <ToolPicker
      query={toolsQuery}
      value={base}
      onChange={onChange}
      label="Base tool"
      error={submitted && baseMissing ? 'A base tool is required.' : undefined}
      emptyNote="No base tool to choose from. Tools come from installed plugins; presets and hidden tools are not offered."
      placeholder="Select a base tool…"
      excludeNames={catalog.excludeNames}
      tagsByTool={catalog.tagsByTool}
      agentToolNames={catalog.agentToolNames}
      displayNames={catalog.displayNames}
      badgesByTool={catalog.badgesByTool}
    />
  );
}
