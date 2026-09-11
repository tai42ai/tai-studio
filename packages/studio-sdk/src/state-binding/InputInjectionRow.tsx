/**
 * The input-injection list of one attached state. Each row injects a value into the
 * run input BEFORE the run: either a template `input` jq (picked by name) or a
 * custom jq over the record, placed under the `into` run-input field.
 */
import type { ReactNode } from 'react';

import { Button } from '../components/primitives';
import { Field } from '../components/field';
import { Select } from '../components/select';
import { TextInput } from '../components/inputs';
import { CloseIcon } from '../components/icons';
import { BindingTemplatedJqField } from './BindingTemplatedJqField';
import type { TemplateJqSuggestion } from './BindingJqField';
import type { ResolvedTemplateJq } from './catalog';
import type { StateInjection, TemplatedTextCatalog } from './types';

function optionLabel(entry: ResolvedTemplateJq): string {
  return entry.description !== undefined && entry.description !== ''
    ? `${entry.ref} — ${entry.description}`
    : entry.ref;
}

const CUSTOM = '__custom__';

function InjectionRow({
  injection,
  index,
  inputJq,
  suggestions,
  templates,
  onChange,
  onRemove,
}: {
  readonly injection: StateInjection;
  readonly index: number;
  readonly inputJq: readonly ResolvedTemplateJq[];
  readonly suggestions?: readonly TemplateJqSuggestion[];
  readonly templates?: TemplatedTextCatalog;
  readonly onChange: (injection: StateInjection) => void;
  readonly onRemove: () => void;
}): ReactNode {
  const isCustom = injection.jq !== null;
  const selectValue = isCustom ? CUSTOM : (injection.template_jq ?? '');

  return (
    <div
      data-testid={`injection-row-${String(index)}`}
      style={{
        display: 'flex',
        gap: 'var(--tai-space-2)',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
      }}
    >
      <Field label={`Injection source ${String(index + 1)}`} hideLabel>
        <Select
          placeholder="Choose a template jq"
          value={selectValue}
          onValueChange={(next) => {
            if (next === CUSTOM)
              onChange({ template_jq: null, jq: { content: '' }, into: injection.into });
            else onChange({ template_jq: next, jq: null, into: injection.into });
          }}
          groups={[
            {
              label: 'Template jq',
              options: inputJq.map((entry) => ({ value: entry.ref, label: optionLabel(entry) })),
            },
            { label: 'Custom', options: [{ value: CUSTOM, label: 'Custom jq' }] },
          ]}
        />
      </Field>
      {isCustom ? (
        <BindingTemplatedJqField
          label={`Custom injection jq ${String(index + 1)}`}
          required
          value={injection.jq}
          onChange={(next) => {
            onChange({ template_jq: null, jq: next ?? { content: '' }, into: injection.into });
          }}
          suggestions={suggestions}
          templates={templates}
        />
      ) : null}
      <Field label={`Into field ${String(index + 1)}`} hideLabel>
        <TextInput
          placeholder="Input field"
          value={injection.into}
          onChange={(event) => {
            onChange({ ...injection, into: event.target.value });
          }}
        />
      </Field>
      <Button
        type="button"
        variant="ghost"
        aria-label={`Remove input ${String(index + 1)}`}
        onClick={onRemove}
      >
        <CloseIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

export interface InjectionListProps {
  readonly injections: readonly StateInjection[];
  readonly onChange: (injections: readonly StateInjection[]) => void;
  readonly inputJq: readonly ResolvedTemplateJq[];
  readonly suggestions?: readonly TemplateJqSuggestion[];
  readonly templates?: TemplatedTextCatalog;
}

export function InjectionList({
  injections,
  onChange,
  inputJq,
  suggestions,
  templates,
}: InjectionListProps): ReactNode {
  const add = (): void => {
    const first = inputJq[0];
    const next: StateInjection =
      first !== undefined
        ? { template_jq: first.ref, jq: null, into: '' }
        : { template_jq: null, jq: { content: '' }, into: '' };
    onChange([...injections, next]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      {injections.map((injection, index) => (
        <InjectionRow
          // Rows are positional; the index is their stable identity within a save.
          key={index}
          injection={injection}
          index={index}
          inputJq={inputJq}
          suggestions={suggestions}
          templates={templates}
          onChange={(next) => {
            onChange(injections.map((current, position) => (position === index ? next : current)));
          }}
          onRemove={() => {
            onChange(injections.filter((_, position) => position !== index));
          }}
        />
      ))}
      <div>
        <Button type="button" variant="ghost" onClick={add}>
          Add input
        </Button>
      </div>
    </div>
  );
}
