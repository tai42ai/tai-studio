/**
 * One row of the adapter mapping form: it picks ONE of three value sources for a
 * declared input key — a picked field (from the run's output / input schema), a
 * hardcoded literal, or a jq expression — and shows the row's own compiled jq on
 * demand. {@link AdapterMapping} composes one editor per declared key.
 */
import { type ReactNode, useState } from 'react';

import { Badge } from '../components/badge';
import { Field } from '../components/field';
import { TextInput } from '../components/inputs';
import { Button, Skeleton } from '../components/primitives';
import { Select } from '../components/select';
import { type FieldRoot, type MappingRow, type MappingSource, rowValueJq } from './adapter';
import { BindingJqField, type TemplateJqSuggestion } from './BindingJqField';
import type { BindingSourceSchemas, SchemaFieldPath } from './types';

const ROOT_OPTIONS: readonly { value: FieldRoot; label: string }[] = [
  { value: 'output', label: 'Run output' },
  { value: 'input', label: 'Run input' },
];

const SOURCE_OPTIONS = [
  { value: 'field', label: 'Field' },
  { value: 'literal', label: 'Literal' },
  { value: 'jq', label: 'Jq' },
];

function fieldsFor(
  root: FieldRoot,
  sources: BindingSourceSchemas | undefined,
): readonly SchemaFieldPath[] {
  if (root === 'output') return sources?.output ?? [];
  return sources?.input ?? [];
}

/** The value control for one row's picked-field source: a Select where a schema is known, else a path input. */
function FieldSourceControl({
  root,
  path,
  onRootChange,
  onPathChange,
  fields,
  loading = false,
  error,
}: {
  readonly root: FieldRoot;
  readonly path: readonly string[];
  readonly onRootChange: (root: FieldRoot) => void;
  readonly onPathChange: (path: readonly string[]) => void;
  readonly fields: readonly SchemaFieldPath[];
  readonly loading?: boolean;
  readonly error?: string;
}): ReactNode {
  const pathInput = (
    <TextInput
      aria-label="Field path"
      placeholder="path.into.value"
      value={path.join('.')}
      onChange={(event) => {
        const text = event.target.value.trim();
        onPathChange(text === '' ? [] : text.split('.'));
      }}
    />
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}>
      <div style={{ display: 'flex', gap: 'var(--tai-space-2)', flexWrap: 'wrap' }}>
        <Field label="Field root" hideLabel>
          <Select
            value={root}
            onValueChange={(next) => {
              onRootChange(next as FieldRoot);
            }}
            options={ROOT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
          />
        </Field>
        {loading ? (
          <Skeleton height={32} width={220} />
        ) : fields.length > 0 ? (
          <Field label="Field" hideLabel>
            <Select
              placeholder="Choose a field"
              value={path.length === 0 ? '' : JSON.stringify(path)}
              onValueChange={(next) => {
                onPathChange(next === '' ? [] : (JSON.parse(next) as string[]));
              }}
              options={[
                { value: '', label: '(whole value)' },
                ...fields.map((field) => ({
                  value: JSON.stringify(field.path),
                  label: field.label,
                })),
              ]}
            />
          </Field>
        ) : (
          pathInput
        )}
      </div>
      {error !== undefined && !loading ? (
        <span
          role="status"
          style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function MappingRowEditor({
  row,
  onChange,
  sources,
  suggestions,
}: {
  readonly row: MappingRow;
  readonly onChange: (row: MappingRow) => void;
  readonly sources?: BindingSourceSchemas;
  readonly suggestions?: readonly TemplateJqSuggestion[];
}): ReactNode {
  const [showJq, setShowJq] = useState(false);
  const source = row.source;
  const preview = rowValueJq(source);

  const setSource = (next: MappingSource): void => {
    onChange({ ...row, source: next });
  };

  const changeKind = (kind: string): void => {
    if (kind === 'field') setSource({ kind: 'field', root: 'output', path: [] });
    else if (kind === 'literal') setSource({ kind: 'literal', json: '' });
    else setSource({ kind: 'jq', expr: '' });
  };

  return (
    <div
      data-testid={`adapter-row-${row.target}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--tai-space-1)',
        padding: 'var(--tai-space-2)',
        border: '1px solid var(--tai-color-border)',
        borderRadius: 'var(--tai-radius-md)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--tai-space-2)',
          flexWrap: 'wrap',
        }}
      >
        <Badge variant="neutral">{row.target}</Badge>
        <Field label={`Source for ${row.target}`} hideLabel>
          <Select
            aria-label={`Source for ${row.target}`}
            value={source.kind}
            onValueChange={changeKind}
            options={SOURCE_OPTIONS}
          />
        </Field>
      </div>

      {source.kind === 'field' ? (
        <FieldSourceControl
          root={source.root}
          path={source.path}
          fields={fieldsFor(source.root, sources)}
          loading={sources?.loading}
          error={sources?.error}
          onRootChange={(nextRoot) => {
            setSource({ kind: 'field', root: nextRoot, path: [] });
          }}
          onPathChange={(nextPath) => {
            setSource({ kind: 'field', root: source.root, path: nextPath });
          }}
        />
      ) : source.kind === 'literal' ? (
        <Field
          label={`Literal for ${row.target}`}
          hideLabel
          error={preview.ok ? undefined : preview.error}
        >
          <TextInput
            aria-label={`Literal for ${row.target}`}
            placeholder='"a string", 42, true, or {"k":1}'
            value={source.json}
            onChange={(event) => {
              setSource({ kind: 'literal', json: event.target.value });
            }}
          />
        </Field>
      ) : (
        <BindingJqField
          label={`Jq for ${row.target}`}
          value={source.expr}
          onChange={(next) => {
            setSource({ kind: 'jq', expr: next });
          }}
          error={preview.ok ? undefined : preview.error}
          suggestions={suggestions}
        />
      )}

      <div>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={showJq}
          onClick={() => {
            setShowJq((open) => !open);
          }}
        >
          {showJq ? 'Hide jq' : 'Show jq'}
        </Button>
        {showJq ? (
          <pre
            data-testid={`adapter-row-jq-${row.target}`}
            style={{ margin: 0, fontFamily: 'var(--tai-font-mono)', whiteSpace: 'pre-wrap' }}
          >
            {preview.ok ? preview.jq : preview.error}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
