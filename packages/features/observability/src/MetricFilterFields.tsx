/**
 * The tracing filter grid: status, tags, and the cost / token / latency min-max
 * fields. Every field except Tags is disabled while a metric sort is active — a
 * metric sort cannot carry those filters (the reader answers 501), so the combo is
 * never composed.
 */
import { Field, NumberInput, Select, TextInput } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import { type FilterDraft, STATUS_ANY } from './filterDraft';

const fieldRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
  gap: 'var(--tai-space-3)',
  alignItems: 'end',
};

export interface MetricFilterFieldsProps {
  readonly draft: FilterDraft;
  readonly metricSortActive: boolean;
  readonly onChange: (patch: Partial<FilterDraft>) => void;
}

export function MetricFilterFields({
  draft,
  metricSortActive,
  onChange,
}: MetricFilterFieldsProps): ReactNode {
  return (
    <div style={fieldRowStyle}>
      <Field label="Status">
        <Select
          options={[
            { value: STATUS_ANY, label: 'Any status' },
            { value: 'success', label: 'Success' },
            { value: 'error', label: 'Error' },
          ]}
          value={draft.status}
          disabled={metricSortActive}
          onValueChange={(value) => {
            onChange({ status: value });
          }}
        />
      </Field>
      <Field label="Tags (comma-separated)">
        <TextInput
          value={draft.tags}
          onChange={(e) => {
            onChange({ tags: e.target.value });
          }}
        />
      </Field>
      <Field label="Min cost">
        <NumberInput
          value={draft.minCost}
          disabled={metricSortActive}
          onChange={(e) => {
            onChange({ minCost: e.target.value });
          }}
        />
      </Field>
      <Field label="Max cost">
        <NumberInput
          value={draft.maxCost}
          disabled={metricSortActive}
          onChange={(e) => {
            onChange({ maxCost: e.target.value });
          }}
        />
      </Field>
      <Field label="Min tokens">
        <NumberInput
          value={draft.minTokens}
          disabled={metricSortActive}
          onChange={(e) => {
            onChange({ minTokens: e.target.value });
          }}
        />
      </Field>
      <Field label="Max tokens">
        <NumberInput
          value={draft.maxTokens}
          disabled={metricSortActive}
          onChange={(e) => {
            onChange({ maxTokens: e.target.value });
          }}
        />
      </Field>
      <Field label="Min latency (ms)">
        <NumberInput
          value={draft.minLatencyMs}
          disabled={metricSortActive}
          onChange={(e) => {
            onChange({ minLatencyMs: e.target.value });
          }}
        />
      </Field>
      <Field label="Max latency (ms)">
        <NumberInput
          value={draft.maxLatencyMs}
          disabled={metricSortActive}
          onChange={(e) => {
            onChange({ maxLatencyMs: e.target.value });
          }}
        />
      </Field>
    </div>
  );
}
