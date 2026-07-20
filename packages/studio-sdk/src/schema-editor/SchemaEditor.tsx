/**
 * `SchemaEditor` — the shared control for AUTHORING a JSON Schema. It is a VALIDATED
 * code editor, NOT a visual builder: the operator writes the schema as JSON in a
 * textarea, and the editor gives loud parse feedback, a structural lint (top-level
 * object; a `"title"` when `requireTitle`), and a live PREVIEW of the authored shape
 * through the same {@link SchemaForm} renderer the run side uses (falling back to a
 * {@link JsonTree} of the schema dict when the shape is not form-renderable).
 *
 * A JSON Schema is more expressive than any builder UI (`$defs`, `anyOf`, constraint
 * keywords), and the backend rejects an invalid schema LOUDLY — so full meta-schema
 * validation stays server-side and this control adds no schema-validation dependency.
 *
 * CONTROLLED-BY-SEED: `value` seeds the editor's text ONCE (on mount); thereafter the
 * text is the source of truth and every edit reports up through `onChange`. Validity
 * is exposed there too so the consumer can gate its submit — always alongside a
 * VISIBLE inline message, never a silently disabled button. The parsed dict is passed
 * through untouched, so a schema the editor does not understand round-trips exactly.
 *
 * SAFETY: the schema text is operator-authored and every derived value renders as
 * React TEXT (through the DS controls / `JsonTree` / `SchemaForm`), never an HTML sink.
 */
import { Component, useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { Field } from '../components/field';
import { Textarea } from '../components/inputs';
import { JsonTree } from '../components/json-tree';
import { classifySchema } from '../schema-form/classify';
import { defaultValueForSchema } from '../schema-form/default-value';
import { SchemaForm } from '../schema-form/SchemaForm';
import type { JsonSchema } from '../schema-form/types';
import { lintSchemaText } from './lint';

/** What {@link SchemaEditor} reports up on every edit. */
export interface SchemaEditorChange {
  /** The authored schema dict when valid and non-empty; `null` when the editor is empty. */
  readonly schema: Record<string, unknown> | null;
  /** False when the text is non-empty but unparseable or failing lint — gate submit on this. */
  readonly valid: boolean;
}

export interface SchemaEditorProps {
  /** The schema dict to seed the editor with, or `null` for an empty editor. */
  readonly value: Record<string, unknown> | null;
  /** Fired on every edit with the parsed schema (or `null`) and its validity. */
  readonly onChange: (change: SchemaEditorChange) => void;
  /** When true, a top-level `"title"` is required (the `response_format` contract). */
  readonly requireTitle: boolean;
  readonly label?: string;
  readonly description?: string;
  readonly disabled?: boolean;
  readonly idPrefix?: string;
}

const monoTextareaStyle: CSSProperties = { fontFamily: 'var(--tai-font-mono)' };

const previewLabelStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  fontWeight: 600,
  color: 'var(--tai-color-text-muted)',
};

const previewBoxStyle: CSSProperties = {
  padding: 'var(--tai-space-3)',
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-md)',
  background: 'var(--tai-color-surface)',
};

function seedText(value: Record<string, unknown> | null): string {
  return value === null ? '' : JSON.stringify(value, null, 2);
}

/**
 * Whether {@link SchemaForm} can render this schema's root — i.e. it classifies to a
 * concrete field kind rather than `unsupported`. A schema whose root the form cannot
 * render (or whose classification throws on a bad `$ref`) previews as a `JsonTree`.
 */
function canRenderWithForm(schema: JsonSchema): boolean {
  try {
    return classifySchema(schema, schema).model.kind !== 'unsupported';
  } catch {
    return false;
  }
}

/**
 * An interactive preview of the authored schema. Seeds a throwaway value from the
 * schema's defaults so the operator can see (and poke) the shape they defined.
 */
function PreviewForm({ schema }: { readonly schema: JsonSchema }): ReactNode {
  const [value, setValue] = useState<unknown>(() => defaultValueForSchema(schema));
  return <SchemaForm schema={schema} value={value} onChange={setValue} idPrefix="schema-preview" />;
}

/**
 * Catch a render-time throw from a deep, malformed schema (e.g. a nested unresolvable
 * `$ref`) so the preview degrades to the `JsonTree` fallback instead of crashing the
 * enclosing dialog. Reset per authored schema by keying this boundary on the schema.
 */
class PreviewBoundary extends Component<
  { readonly fallback: ReactNode; readonly children: ReactNode },
  { readonly failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError(_error: unknown): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function SchemaPreview({ schema }: { readonly schema: Record<string, unknown> }): ReactNode {
  const jsonFallback = <JsonTree data={schema} />;
  if (!canRenderWithForm(schema)) return jsonFallback;
  return (
    <PreviewBoundary fallback={jsonFallback}>{<PreviewForm schema={schema} />}</PreviewBoundary>
  );
}

export function SchemaEditor({
  value,
  onChange,
  requireTitle,
  label = 'Schema',
  description,
  disabled,
  idPrefix = 'schema-editor',
}: SchemaEditorProps): ReactNode {
  const [text, setText] = useState<string>(() => seedText(value));

  // Recomputed for display (inline error + preview) on every render; the change
  // handler lints the NEXT text independently so `onChange` and the view agree.
  const result = useMemo(() => lintSchemaText(text, requireTitle), [text, requireTitle]);

  const emit = (nextText: string): void => {
    setText(nextText);
    const next = lintSchemaText(nextText, requireTitle);
    onChange({ schema: next.valid ? next.schema : null, valid: next.valid });
  };

  return (
    <div
      data-testid={idPrefix}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}
    >
      <Field label={label} description={description} error={result.error}>
        <Textarea
          value={text}
          disabled={disabled}
          onChange={(event) => {
            emit(event.target.value);
          }}
          rows={10}
          aria-label={`${label} JSON`}
          style={monoTextareaStyle}
          spellCheck={false}
        />
      </Field>

      {result.schema !== null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <span style={previewLabelStyle}>Preview</span>
          <div style={previewBoxStyle} data-testid={`${idPrefix}-preview`}>
            <SchemaPreview
              // Re-seed the preview (and reset its error boundary) whenever the
              // authored schema changes.
              key={JSON.stringify(result.schema)}
              schema={result.schema}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
