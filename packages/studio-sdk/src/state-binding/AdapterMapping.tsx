/**
 * The adapter mapping form for a NAMED update. It renders one row per declared
 * input key of the update jq; each row picks ONE of three value sources — a picked
 * field (from the run's output / input schema, when a schema is known), a hardcoded
 * literal, or a jq expression — and the whole form compiles into ONE adapter jq over
 * `{ output, input }` that constructs the update jq's declared input object. Each
 * row shows its own jq on demand, and the whole compiled adapter is shown on demand.
 *
 * A raw-jq escape hatch (`Write jq`) authors the adapter directly when the mapping needs
 * more than the row form expresses. An update that declares NO input needs no adapter, so
 * it shows a tool-output passthrough and stores `null` (the escape hatch stays available).
 *
 * The stored value always equals what the form shows (WYSIWYG): an accepted default is
 * emitted on mount, so it is never left as the empty string the platform's save refuses.
 * The emitted adapter is a non-empty jq or `null`, never `''`.
 */
import { useEffect, useState, type ReactNode } from 'react';

import { Badge } from '../components/badge';
import { Button, Skeleton } from '../components/primitives';
import { Field } from '../components/field';
import { Select } from '../components/select';
import { TextInput } from '../components/inputs';
import { BindingJqField, type TemplateJqSuggestion } from './BindingJqField';
import {
  compileAdapter,
  parseAdapter,
  rowValueJq,
  type FieldRoot,
  type MappingRow,
  type MappingSource,
} from './adapter';
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

export interface AdapterMappingProps {
  /** The declared input keys of the update jq — one row each. Empty ⇒ raw jq only. */
  readonly declaredInput: readonly string[];
  /** The current adapter jq (compiled or authored) stored on the update; `''` ⇒ none stored. */
  readonly value: string;
  /** Emits the adapter to store: a non-empty jq, or `null` for no adapter (never `''`). */
  readonly onChange: (adapterJq: string | null) => void;
  /** The output / input field paths a picker offers. */
  readonly sources?: BindingSourceSchemas;
  /** Template jq offered as `tjq_<name>({…})` inserts in the jq escape hatch. */
  readonly suggestions?: readonly TemplateJqSuggestion[];
}

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

/** One row per declared input key, each defaulting to the whole run output. */
function defaultRows(declaredInput: readonly string[]): MappingRow[] {
  return declaredInput.map((target): MappingRow => ({
    target,
    source: { kind: 'field', root: 'output', path: [] },
  }));
}

function MappingRowEditor({
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

export function AdapterMapping({
  declaredInput,
  value,
  onChange,
  sources,
  suggestions,
}: AdapterMappingProps): ReactNode {
  const canMap = declaredInput.length > 0;
  // Rebuild the form from STORED data: a stored adapter that parses back to rows reopens
  // as the mapping form; anything else opens in the raw-jq escape hatch. With no declared
  // input the update needs no adapter, so it opens on the tool-output passthrough (a
  // stored jq still reopens the escape hatch).
  const recovered = value.trim() === '' ? null : parseAdapter(value);
  const [mode, setMode] = useState<'fields' | 'jq'>(() => {
    if (value.trim() === '') return 'fields';
    return canMap && recovered !== null ? 'fields' : 'jq';
  });
  const [rows, setRows] = useState<MappingRow[]>(() => recovered ?? defaultRows(declaredInput));
  // Set when a toggle to fields mode finds a jq the row form cannot represent: the
  // note explains why the view stayed on the raw jq (see `toFields`).
  const [unmappable, setUnmappable] = useState(false);

  const emit = (nextRows: readonly MappingRow[]): void => {
    // WYSIWYG: store exactly what the form shows. A compile failure has no valid adapter,
    // so emit `null` (no adapter) — never the empty string the platform's save refuses.
    const compiled = compileAdapter(nextRows);
    onChange(compiled.ok ? compiled.jq : null);
  };

  // WYSIWYG on mount: with no stored value the form shows a default — the compiled
  // declared-input rows when mappable, else the tool-output passthrough — so store it AT
  // ONCE. An operator who accepts the shown default must not leave an empty adapter the
  // platform's save-time compile check refuses. Re-runs when the declared input changes
  // the shown default; the guard preserves a stored/authored value untouched.
  const declaredKey = declaredInput.join(' ');
  useEffect(() => {
    if (mode !== 'fields' || value.trim() !== '') return;
    const seeded = canMap ? compileAdapter(defaultRows(declaredInput)) : null;
    onChange(seeded?.ok ? seeded.jq : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [declaredKey]);

  // Toggle to the row form by re-deriving rows from the CURRENT stored jq, never from
  // the rows held since mount (those go stale while the user edits the raw jq, so
  // compiling them would silently overwrite the authored jq). A non-empty jq the row
  // form cannot represent keeps the raw view and surfaces a note instead of clobbering
  // it; a clean round-trip re-emits nothing, so an authored jq is preserved byte-for-byte.
  // With no declared input there is nothing to map — the toggle returns to the passthrough.
  const toFields = (): void => {
    if (!canMap) {
      setMode('fields');
      setUnmappable(false);
      onChange(null);
      return;
    }
    const parsed = value.trim() === '' ? null : parseAdapter(value);
    if (value.trim() !== '' && parsed === null) {
      setUnmappable(true);
      return;
    }
    const nextRows = parsed ?? defaultRows(declaredInput);
    setRows(nextRows);
    setMode('fields');
    setUnmappable(false);
    const compiled = compileAdapter(nextRows);
    if (compiled.ok && compiled.jq !== value) onChange(compiled.jq);
  };

  // The raw-jq edit path clears a stale unmappable note so a re-mapping attempt sees the
  // edited jq, then forwards the edit — normalizing an empty/whitespace box to `null` (no
  // adapter) so the empty string is never stored.
  const onJqChange = (next: string): void => {
    if (unmappable) setUnmappable(false);
    onChange(next.trim() === '' ? null : next);
  };

  const setRow = (index: number, next: MappingRow): void => {
    const nextRows = rows.map((row, position) => (position === index ? next : row));
    setRows(nextRows);
    emit(nextRows);
  };

  const compiled = compileAdapter(rows);
  const [showCompiled, setShowCompiled] = useState(false);

  // An adapter is refused empty ONLY when the update declares inputs to fill; a
  // no-declared-input update legitimately stores no adapter (the passthrough).
  const rawError =
    canMap && mode === 'jq' && value.trim() === ''
      ? 'Map the declared inputs or write an adapter jq — an empty adapter is refused.'
      : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
        <Button
          type="button"
          variant={mode === 'fields' ? 'primary' : 'ghost'}
          aria-pressed={mode === 'fields'}
          onClick={toFields}
        >
          {canMap ? 'Map fields' : 'Use tool output'}
        </Button>
        <Button
          type="button"
          variant={mode === 'jq' ? 'primary' : 'ghost'}
          aria-pressed={mode === 'jq'}
          onClick={() => {
            // Seed the escape hatch with the compiled adapter so nothing is lost — only
            // when there are rows to compile; a no-declared-input update opens empty.
            if (canMap && value.trim() === '' && compiled.ok) onChange(compiled.jq);
            setMode('jq');
          }}
        >
          Write jq
        </Button>
      </div>

      {unmappable ? (
        <p
          role="status"
          style={{
            margin: 0,
            color: 'var(--tai-color-text-muted)',
            fontSize: 'var(--tai-text-sm)',
          }}
        >
          This adapter jq cannot be shown as fields. Edit it here.
        </p>
      ) : null}

      {mode === 'fields' ? (
        canMap ? (
          <>
            {rows.map((row, index) => (
              <MappingRowEditor
                key={row.target}
                row={row}
                sources={sources}
                suggestions={suggestions}
                onChange={(next) => {
                  setRow(index, next);
                }}
              />
            ))}
            {!compiled.ok ? (
              <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
                {compiled.error}
              </p>
            ) : null}
            <div>
              <Button
                type="button"
                variant="ghost"
                aria-expanded={showCompiled}
                onClick={() => {
                  setShowCompiled((open) => !open);
                }}
              >
                {showCompiled ? 'Hide adapter jq' : 'Show adapter jq'}
              </Button>
              {showCompiled ? (
                <pre
                  data-testid="adapter-compiled-jq"
                  style={{ margin: 0, fontFamily: 'var(--tai-font-mono)', whiteSpace: 'pre-wrap' }}
                >
                  {compiled.ok ? compiled.jq : compiled.error}
                </pre>
              ) : null}
            </div>
          </>
        ) : (
          <p
            role="status"
            style={{
              margin: 0,
              color: 'var(--tai-color-text-muted)',
              fontSize: 'var(--tai-text-sm)',
            }}
          >
            This update runs with the tool output as its input.
          </p>
        )
      ) : (
        <BindingJqField
          label="Adapter"
          description="Maps the run's output into what this update expects as `.input`."
          value={value}
          onChange={onJqChange}
          suggestions={suggestions}
          placeholder="{ total: .output.total }"
          error={rawError}
        />
      )}
    </div>
  );
}
