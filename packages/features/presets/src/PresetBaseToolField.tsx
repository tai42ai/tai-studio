/**
 * The base-tool picker for the create form: the shared `ToolPicker` over `listTools()`
 * (grouped by merged tags, agent tools labelled), EXCLUDING existing non-conflicted
 * preset names and effective-hidden tools. A failed tools/preset read is surfaced
 * loudly instead of a silently-empty picker.
 */
import type { ReactNode } from 'react';

import { ErrorState, Field, ToolPicker, errorMessage } from '@tai42/studio-sdk';

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

  if (toolsQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(toolsQuery.error)}
        onRetry={() => void toolsQuery.refetch()}
      />
    );
  }
  // The base-tool exclusion list depends on the preset list — a failed load is
  // surfaced loudly, never a silently-empty exclusion.
  if (presetsQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(presetsQuery.error)}
        onRetry={() => void presetsQuery.refetch()}
      />
    );
  }

  const baseMissing = base === null || base === '';
  return (
    <Field
      label="Base tool"
      error={submitted && baseMissing ? 'A base tool is required.' : undefined}
    >
      <ToolPicker
        toolNames={toolsQuery.data ?? []}
        value={base}
        onChange={onChange}
        disabled={toolsQuery.isPending}
        placeholder={toolsQuery.isPending ? 'Loading tools…' : 'Select a base tool…'}
        excludeNames={catalog.excludeNames}
        tagsByTool={catalog.tagsByTool}
        agentToolNames={catalog.agentToolNames}
        displayNames={catalog.displayNames}
        badgesByTool={catalog.badgesByTool}
      />
    </Field>
  );
}
