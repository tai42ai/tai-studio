/**
 * `SchemaField` — the ONE control that authors a state's base JSON schema, which the
 * platform serves as the `TemplatedText | dict` union: an inline schema document, or a
 * stored template reference (an `id` + render `kwargs`) whose rendered value is the schema.
 *
 * It composes the shared {@link TemplatedTextField} — the same authored-body control every
 * other templated field uses — so the mode toggle, the stored-template picker, the
 * storage-absent / picker-loading / picker-error / unresolved-id states, both themes and the
 * keyboard model come from that control unchanged. Its inline body is the shared
 * {@link SchemaEditor}: a validated JSON editor whose parsed object is the union's inline arm.
 *
 * The two union arms map exactly to the two sources:
 *  - inline  → the editor's parsed schema DICT, stored verbatim (the platform serves an inline
 *    dict back unchanged, so a literal schema is never rendered as a template). Render
 *    parameters are a stored-template concept and do not apply to a literal schema.
 *  - stored  → a `{ id, kwargs }` templated-text value the platform renders to the schema.
 *
 * The editor drives its own text; validity flows up through `onChange` so the caller gates
 * its save on it (never a silently disabled control). An empty editor is an unset schema.
 */
import { schemas, type TemplatedText } from '@tai42/api-client';
import {
  SchemaEditor,
  type SchemaEditorChange,
  type TemplatedTextCatalog,
  TemplatedTextField,
} from '@tai42/studio-sdk';
import { type ReactNode, useRef } from 'react';

/** The served base-schema value: an inline JSON-schema dict or a templated-text reference. */
export type SchemaUnion = TemplatedText | Record<string, unknown>;

/** What {@link SchemaField} reports up on every edit: the union value and its validity. */
export interface SchemaFieldChange {
  /** The union value, or `null` when the schema is unset (an empty inline editor). */
  readonly schema: SchemaUnion | null;
  /** False while the inline editor holds unparseable text — the caller blocks its save. */
  readonly valid: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The stored templated-text reference a value carries, or `null` for an inline schema. A
 * value parses as templated-text (the strict `content` XOR `id` shape) exactly when it is
 * the reference arm — a JSON Schema carries `type`/`properties`/etc. and never matches — so
 * this mirrors the platform's own `TemplatedText | dict` union resolution.
 */
export function storedSchemaRef(value: SchemaUnion | null | undefined): TemplatedText | null {
  if (value === null || value === undefined) return null;
  const parsed = schemas.templatedText.safeParse(value);
  return parsed.success && parsed.data.id !== undefined ? parsed.data : null;
}

/**
 * The inline schema dict a value seeds the editor with: the value itself when it is a plain
 * schema dict, or the parsed object of an inline-`content` templated value; `null` for a
 * stored reference (there is no inline text to edit) or an empty value.
 */
function inlineDict(value: SchemaUnion | null): Record<string, unknown> | null {
  if (value === null) return null;
  const parsed = schemas.templatedText.safeParse(value);
  if (parsed.success) {
    if (parsed.data.content === undefined) return null;
    try {
      const object: unknown = JSON.parse(parsed.data.content);
      return isPlainObject(object) ? object : null;
    } catch {
      return null;
    }
  }
  return isPlainObject(value) && Object.keys(value).length > 0 ? value : null;
}

/**
 * A non-empty placeholder handed to the inline source when the editor holds unparseable
 * text, so the control stays in its inline source (rather than reading as an unset value) and
 * reports the editor's `valid: false` up. The placeholder itself is never read — the recorded
 * editor result is the value — so its content is immaterial beyond being non-blank.
 */
const INLINE_INVALID = '{';

export interface SchemaFieldProps {
  readonly label: string;
  readonly description?: string;
  readonly value: SchemaUnion | null;
  readonly onChange: (change: SchemaFieldChange) => void;
  /** The storage-presence + stored-template catalog the picker reads (built once per form). */
  readonly catalog: TemplatedTextCatalog;
  readonly disabled?: boolean;
}

export function SchemaField({
  label,
  description,
  value,
  onChange,
  catalog,
  disabled,
}: SchemaFieldProps): ReactNode {
  const inlineSeed = inlineDict(value);
  // The latest inline-editor result, seeded from the value's inline arm. The control emits
  // the inline SOURCE (content present) on every inline edit; the value it carries is this
  // recorded schema, so the object and its validity survive an unparseable intermediate edit.
  const inline = useRef<SchemaFieldChange>({ schema: inlineSeed, valid: true });

  const controlValue = storedSchemaRef(value);

  return (
    <TemplatedTextField
      label={label}
      description={description}
      value={controlValue}
      templates={catalog.templates}
      templatesLoading={catalog.loading}
      templatesError={catalog.error}
      onTemplatesRetry={catalog.onRetry}
      storageAbsent={catalog.storageAbsent}
      storagePresenceLoading={catalog.storagePresenceLoading}
      disabled={disabled}
      onChange={(next) => {
        if (next === null) {
          onChange({ schema: null, valid: true });
          return;
        }
        if (next.id !== undefined) {
          onChange({ schema: next, valid: true });
          return;
        }
        onChange(inline.current);
      }}
      // The control's group header already draws the field label + description, so the inline
      // editor's own heading is hidden (`hideLabel`) — the field reads label → description →
      // editor. The label stays the editor's accessible name, visually hidden, never removed.
      renderInline={({ label: inlineLabel, onChange: onInline, hideLabel }) => (
        <SchemaEditor
          value={inlineSeed}
          requireTitle={false}
          label={inlineLabel}
          hideLabel={hideLabel}
          disabled={disabled}
          onChange={(change: SchemaEditorChange) => {
            inline.current = { schema: change.schema, valid: change.valid };
            onInline(
              change.valid
                ? change.schema !== null
                  ? JSON.stringify(change.schema, null, 2)
                  : ''
                : INLINE_INVALID,
            );
          }}
        />
      )}
    />
  );
}
