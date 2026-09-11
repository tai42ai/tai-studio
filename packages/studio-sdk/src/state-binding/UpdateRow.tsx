/**
 * The update list of one attached state. Each update applies AFTER the run: either
 * a template `update` jq (picked by name, whose declared input is authored through
 * the adapter mapping) or a custom jq over `{ record, output, input }` that authors
 * the whole op batch itself. An optional op-id expression carries idempotency.
 */
import type { ReactNode } from 'react';

import { Badge } from '../components/badge';
import { Button } from '../components/primitives';
import { Field } from '../components/field';
import { Select } from '../components/select';
import { TemplatedTextField } from '../components/templated-text-field';
import { CloseIcon } from '../components/icons';
import { AdapterMapping } from './AdapterMapping';
import { BindingTemplatedJqField } from './BindingTemplatedJqField';
import type { TemplateJqSuggestion } from './BindingJqField';
import { findByRef, type ResolvedTemplateJq } from './catalog';
import type { BindingSourceSchemas, StateUpdate, TemplatedTextCatalog } from './types';

const CUSTOM = '__custom__';

function optionLabel(entry: ResolvedTemplateJq): string {
  return entry.description !== undefined && entry.description !== ''
    ? `${entry.ref} — ${entry.description}`
    : entry.ref;
}

function writesLabel(entry: ResolvedTemplateJq | undefined): string | null {
  if (entry?.writes === undefined || entry.writes.length === 0) return null;
  return entry.writes.map((path) => path.join('.')).join(', ');
}

function UpdateRowEditor({
  update,
  index,
  updateJq,
  sources,
  suggestions,
  templates,
  onChange,
  onRemove,
}: {
  readonly update: StateUpdate;
  readonly index: number;
  readonly updateJq: readonly ResolvedTemplateJq[];
  readonly sources?: BindingSourceSchemas;
  readonly suggestions?: readonly TemplateJqSuggestion[];
  readonly templates?: TemplatedTextCatalog;
  readonly onChange: (update: StateUpdate) => void;
  readonly onRemove: () => void;
}): ReactNode {
  const isCustom = update.jq !== null;
  const selectValue = isCustom ? CUSTOM : (update.template_jq ?? '');
  const resolved =
    update.template_jq !== null ? findByRef(update.template_jq, updateJq) : undefined;
  const writes = writesLabel(resolved);

  return (
    <div
      data-testid={`update-row-${String(index)}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--tai-space-2)',
        padding: 'var(--tai-space-2)',
        border: '1px solid var(--tai-color-border)',
        borderRadius: 'var(--tai-radius-md)',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 'var(--tai-space-2)',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Field label={`Update source ${String(index + 1)}`} hideLabel>
          <Select
            placeholder="Choose a template jq"
            value={selectValue}
            onValueChange={(next) => {
              if (next === CUSTOM)
                onChange({
                  template_jq: null,
                  jq: { content: '' },
                  adapter: null,
                  op_id: update.op_id,
                });
              else onChange({ template_jq: next, jq: null, adapter: null, op_id: update.op_id });
            }}
            groups={[
              {
                label: 'Template jq',
                options: updateJq.map((entry) => ({ value: entry.ref, label: optionLabel(entry) })),
              },
              { label: 'Custom', options: [{ value: CUSTOM, label: 'Custom jq' }] },
            ]}
          />
        </Field>
        {writes !== null ? <Badge variant="neutral">{`writes: ${writes}`}</Badge> : null}
        <Button
          type="button"
          variant="ghost"
          aria-label={`Remove update ${String(index + 1)}`}
          onClick={onRemove}
        >
          <CloseIcon aria-hidden="true" />
        </Button>
      </div>

      {isCustom ? (
        <BindingTemplatedJqField
          label={`Custom update jq ${String(index + 1)}`}
          required
          description="A jq over `{ record, output, input }` returning a template-relative op batch."
          value={update.jq}
          onChange={(next) => {
            onChange({
              template_jq: null,
              jq: next ?? { content: '' },
              adapter: null,
              op_id: update.op_id,
            });
          }}
          suggestions={suggestions}
          templates={templates}
        />
      ) : (
        <TemplatedTextField
          // Remount on a template change so the mapping rebuilds from the newly
          // declared input (and re-seeds its shown default) instead of stale rows.
          key={resolved?.ref ?? '__none__'}
          label="Adapter"
          value={update.adapter}
          templates={templates?.templates}
          templatesLoading={templates?.loading}
          templatesError={templates?.error}
          onTemplatesRetry={templates?.onRetry}
          onChange={(next) => {
            onChange({ ...update, adapter: next });
          }}
          renderInline={({ value: inlineValue, onChange: onInline }) => (
            <AdapterMapping
              declaredInput={resolved?.params ?? []}
              value={inlineValue}
              sources={sources}
              suggestions={suggestions}
              onChange={(adapterJq) => {
                onInline(adapterJq ?? '');
              }}
            />
          )}
        />
      )}

      <BindingTemplatedJqField
        label="Op id"
        description="Optional — an idempotency-key expression."
        value={update.op_id}
        onChange={(next) => {
          onChange({ ...update, op_id: next });
        }}
        suggestions={suggestions}
        templates={templates}
      />
    </div>
  );
}

export interface UpdateListProps {
  readonly updates: readonly StateUpdate[];
  readonly onChange: (updates: readonly StateUpdate[]) => void;
  readonly updateJq: readonly ResolvedTemplateJq[];
  readonly sources?: BindingSourceSchemas;
  readonly suggestions?: readonly TemplateJqSuggestion[];
  readonly templates?: TemplatedTextCatalog;
}

export function UpdateList({
  updates,
  onChange,
  updateJq,
  sources,
  suggestions,
  templates,
}: UpdateListProps): ReactNode {
  const add = (): void => {
    const first = updateJq[0];
    const next: StateUpdate =
      first !== undefined
        ? { template_jq: first.ref, jq: null, adapter: null, op_id: null }
        : { template_jq: null, jq: { content: '' }, adapter: null, op_id: null };
    onChange([...updates, next]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      {updates.map((update, index) => (
        <UpdateRowEditor
          // Rows are positional; the index is their stable identity within a save.
          key={index}
          update={update}
          index={index}
          updateJq={updateJq}
          sources={sources}
          suggestions={suggestions}
          templates={templates}
          onChange={(next) => {
            onChange(updates.map((current, position) => (position === index ? next : current)));
          }}
          onRemove={() => {
            onChange(updates.filter((_, position) => position !== index));
          }}
        />
      ))}
      <div>
        <Button type="button" variant="ghost" onClick={add}>
          Add update
        </Button>
      </div>
    </div>
  );
}
