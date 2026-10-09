/**
 * The tracing filter grid: status, tags, and the cost / token / latency min-max
 * fields. A field whose run-list filter param the active sort cannot be combined with
 * (the backend's served capabilities say which) is disabled, so the unserved
 * combination is never composed. Why it is disabled is said twice: in a tooltip on
 * hover, and in a note under the grid that every disabled control names as its
 * description, because a disabled control takes no keyboard focus and so never opens
 * its tooltip from the keyboard.
 */
import { Field, NumberInput, Select, TextInput, Tooltip } from '@tai42/studio-sdk';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { useId } from 'react';

import { type FilterDraft, STATUS_ANY } from './filterDraft';

/** Why a filter is disabled under the active sort. */
export const FILTER_COMBINATION_NOTE =
  'Not available with this sort — the monitoring backend cannot combine them. Sort by time to use it.';

const fieldRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
  gap: 'var(--tai-space-3)',
  alignItems: 'end',
};

export interface MetricFilterFieldsProps {
  readonly draft: FilterDraft;
  /** The run-list filter params (draft keys) the active sort cannot be combined with. */
  readonly unavailable: ReadonlySet<string>;
  readonly onChange: (patch: Partial<FilterDraft>) => void;
}

/** A disabled filter field wrapped in the hover trigger that carries the reason tooltip. */
function Explained({
  disabled,
  children,
}: {
  readonly disabled: boolean;
  readonly children: ReactElement;
}): ReactNode {
  if (!disabled) return children;
  return (
    <Tooltip content={FILTER_COMBINATION_NOTE}>
      <span style={{ display: 'block' }}>{children}</span>
    </Tooltip>
  );
}

type NumberKey =
  'minCost' | 'maxCost' | 'minTokens' | 'maxTokens' | 'minLatencyMs' | 'maxLatencyMs';

const NUMBER_FIELDS: readonly { readonly key: NumberKey; readonly label: string }[] = [
  { key: 'minCost', label: 'Min cost' },
  { key: 'maxCost', label: 'Max cost' },
  { key: 'minTokens', label: 'Min tokens' },
  { key: 'maxTokens', label: 'Max tokens' },
  { key: 'minLatencyMs', label: 'Min latency (ms)' },
  { key: 'maxLatencyMs', label: 'Max latency (ms)' },
];

/** Every filter param the grid renders a field for. */
const FILTER_KEYS: readonly string[] = ['status', 'tags', ...NUMBER_FIELDS.map(({ key }) => key)];

export function MetricFilterFields({
  draft,
  unavailable,
  onChange,
}: MetricFilterFieldsProps): ReactNode {
  const noteId = useId();
  const describedBy = (key: string): string | undefined =>
    unavailable.has(key) ? noteId : undefined;
  const anyDisabled = FILTER_KEYS.some((key) => unavailable.has(key));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <div style={fieldRowStyle}>
        <Explained disabled={unavailable.has('status')}>
          <Field label="Status">
            <Select
              options={[
                { value: STATUS_ANY, label: 'Any status' },
                { value: 'success', label: 'Success' },
                { value: 'error', label: 'Error' },
              ]}
              value={draft.status}
              disabled={unavailable.has('status')}
              aria-describedby={describedBy('status')}
              onValueChange={(value) => {
                onChange({ status: value });
              }}
            />
          </Field>
        </Explained>
        <Explained disabled={unavailable.has('tags')}>
          <Field label="Tags (comma-separated)">
            <TextInput
              value={draft.tags}
              disabled={unavailable.has('tags')}
              aria-describedby={describedBy('tags')}
              onChange={(e) => {
                onChange({ tags: e.target.value });
              }}
            />
          </Field>
        </Explained>
        {NUMBER_FIELDS.map(({ key, label }) => (
          <Explained key={key} disabled={unavailable.has(key)}>
            <Field label={label}>
              <NumberInput
                value={draft[key]}
                disabled={unavailable.has(key)}
                aria-describedby={describedBy(key)}
                onChange={(e) => {
                  onChange({ [key]: e.target.value });
                }}
              />
            </Field>
          </Explained>
        ))}
      </div>
      {anyDisabled ? (
        <p id={noteId} className="tai-field-hint" style={{ margin: 0 }}>
          {FILTER_COMBINATION_NOTE}
        </p>
      ) : null}
    </div>
  );
}
