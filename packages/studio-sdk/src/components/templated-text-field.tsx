/**
 * `TemplatedTextField` — the ONE control that authors a {@link TemplatedText}
 * value: an authored-text field that is either inline `content` (text written in
 * place) or a stored template `id` (a template resource fetched and rendered at
 * run time), with the render `kwargs` that apply in BOTH cases.
 *
 * The two sources are mutually exclusive by CONSTRUCTION: the mode toggle only ever
 * writes `content` XOR `id`, so a value can never carry both. "Neither" is a `null`
 * value, allowed only when the field is optional; a `required` field emits its
 * empty source instead so the schema's non-empty guard (and the field error) refuse
 * the save. The kwargs editor is shared across both modes.
 *
 * It seeds its editing state from `value` ONCE and drives itself thereafter,
 * emitting a normalized value on every change (a caller resets it by remounting
 * under a fresh `key`). The inline editor is a plain multiline textarea by default;
 * a caller authoring jq or another rich field passes `renderInline` to supply its
 * own editor. The stored-template list, its loading/error state, and the verbatim
 * server message for an id that no longer resolves are passed in by the caller —
 * this control holds no data edge of its own.
 */
import { useState, type ReactNode } from 'react';

import type { TemplatedText } from '@tai42/api-client';

import { Button, ErrorState, Skeleton } from './primitives';
import { Field } from './field';
import { RadioGroup } from './radio-group';
import { Select } from './select';
import { Textarea, TextInput } from './inputs';
import { CloseIcon } from './icons';

/** One stored template the id picker offers. */
export interface TemplatedTextTemplateOption {
  readonly id: string;
  /** The label shown for the id; defaults to the id itself. */
  readonly label?: string;
}

/** The props `renderInline` receives to draw the inline-content editor. */
export interface TemplatedTextInlineProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  /**
   * The field renders its own group header (label + description) above the source
   * toggle, so the inline editor's OWN visible label is redundant: an editor honours
   * this by rendering that label visually hidden while keeping it as its accessible
   * name (its `<label for>` association stays intact). Always `true` — the control is
   * always grouped — so an editor that draws its own label must respect it.
   */
  readonly hideLabel: boolean;
}

export interface TemplatedTextFieldProps {
  /** The field's accessible name, shown on the active editor. */
  readonly label: string;
  readonly value: TemplatedText | null;
  readonly onChange: (value: TemplatedText | null) => void;
  /** Group-level helper shown under the label, above the source toggle. */
  readonly description?: string;
  /** A field-level error surfaced beneath the control. */
  readonly error?: string;
  /**
   * When true the field must carry a source: clearing the inline text or leaving
   * the template unchosen emits an EMPTY source (not `null`), so the schema guard
   * and the field error refuse the save rather than silently dropping the field.
   */
  readonly required?: boolean;
  /** The stored templates the id picker offers. */
  readonly templates?: readonly TemplatedTextTemplateOption[];
  /** The template list fetch is in flight. */
  readonly templatesLoading?: boolean;
  /** The template list fetch failed — surfaced with a retry. */
  readonly templatesError?: string;
  readonly onTemplatesRetry?: () => void;
  /** The verbatim server message when the stored `id` no longer resolves. */
  readonly resolveError?: string;
  /** Supply a custom inline-content editor (jq, rich text); defaults to a textarea. */
  readonly renderInline?: (props: TemplatedTextInlineProps) => ReactNode;
  readonly disabled?: boolean;
  /** Placeholder for the default textarea editor (ignored when `renderInline` is given). */
  readonly placeholder?: string;
}

/** A short one-line rendering of a templated-text value, for read-only summaries. */
export function templatedTextSummary(value: TemplatedText | null): string {
  if (value === null) return '(unset)';
  if (value.id !== undefined) return `template: ${value.id}`;
  return value.content ?? '';
}

type Mode = 'inline' | 'stored';

interface KwargRow {
  readonly key: string;
  readonly value: string;
  /**
   * The stored value this row was seeded from, kept so an UNTOUCHED row re-emits it
   * BYTE-FOR-BYTE: the row form cannot tell a stored string `"7"` from the number `7`,
   * so re-parsing an untouched row would silently coerce the stored type. `undefined`
   * for a row the author added.
   */
  readonly original?: unknown;
}

/** The row's canonical string form, matched against `value` to detect an untouched row. */
function stringifyRowValue(raw: unknown): string {
  return typeof raw === 'string' ? raw : JSON.stringify(raw);
}

/** Parse a cell as JSON when it can be (numbers/bools/objects), else keep the string. */
function parseCellValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

/** Collapse the kwargs rows into an object, dropping rows with a blank key. */
function rowsToObject(rows: readonly KwargRow[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key.length === 0) continue;
    // An untouched seeded row re-emits its stored value verbatim (no JSON-type coerce);
    // an edited or added row is parsed from the cell text.
    out[key] =
      row.original !== undefined && stringifyRowValue(row.original) === row.value
        ? row.original
        : parseCellValue(row.value);
  }
  return out;
}

/** Seed rows from a stored kwargs object (stringifying non-string values). */
function objectToRows(kwargs: Record<string, unknown> | undefined): KwargRow[] {
  if (kwargs === undefined) return [];
  return Object.entries(kwargs).map(([key, raw]) => ({
    key,
    value: stringifyRowValue(raw),
    original: raw,
  }));
}

/** The add/remove kwargs editor, revealed on demand and open when kwargs already exist. */
function KwargsEditor({
  label,
  rows,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly rows: readonly KwargRow[];
  readonly disabled: boolean;
  readonly onChange: (rows: KwargRow[]) => void;
}): ReactNode {
  const [open, setOpen] = useState(rows.length > 0);
  const groupLabel = `${label} render parameters`;

  if (!open) {
    // Wrapped so the ghost button keeps its content width and stays left-aligned
    // in the field's column, marking it as this field's own disclosure rather than
    // a full-width control floating between two fields.
    return (
      <div>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setOpen(true);
            onChange([...rows, { key: '', value: '' }]);
          }}
        >
          Add render parameters
        </Button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={groupLabel}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}
    >
      <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
        Render parameters
      </span>
      {rows.map((row, index) => (
        <div
          key={index}
          style={{ display: 'flex', gap: 'var(--tai-space-2)', alignItems: 'center' }}
        >
          <TextInput
            aria-label={`${groupLabel} key ${String(index + 1)}`}
            placeholder="name"
            value={row.key}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, key: event.target.value };
              onChange(next);
            }}
          />
          <TextInput
            aria-label={`${groupLabel} value ${String(index + 1)}`}
            placeholder="value"
            value={row.value}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, value: event.target.value };
              onChange(next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            aria-label={`Remove ${groupLabel} ${String(index + 1)}`}
            disabled={disabled}
            onClick={() => {
              onChange(rows.filter((_, position) => position !== index));
            }}
          >
            <CloseIcon aria-hidden="true" />
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            onChange([...rows, { key: '', value: '' }]);
          }}
        >
          Add parameter
        </Button>
      </div>
    </div>
  );
}

/** The initial mode: stored when the seed carries an `id`, inline otherwise. */
function initialMode(value: TemplatedText | null): Mode {
  return value?.id !== undefined ? 'stored' : 'inline';
}

export function TemplatedTextField({
  label,
  value,
  onChange,
  description,
  error,
  required = false,
  templates = [],
  templatesLoading = false,
  templatesError,
  onTemplatesRetry,
  resolveError,
  renderInline,
  disabled = false,
  placeholder,
}: TemplatedTextFieldProps): ReactNode {
  const [mode, setMode] = useState<Mode>(() => initialMode(value));
  const [inlineDraft, setInlineDraft] = useState(() => value?.content ?? '');
  const [storedDraft, setStoredDraft] = useState(() => value?.id ?? '');
  const [kwargsRows, setKwargsRows] = useState<KwargRow[]>(() => objectToRows(value?.kwargs));

  const emit = (
    nextMode: Mode,
    nextInline: string,
    nextStored: string,
    nextKwargs: readonly KwargRow[],
  ): void => {
    const kwargs = rowsToObject(nextKwargs);
    const kw = Object.keys(kwargs).length > 0 ? { kwargs } : {};
    if (nextMode === 'stored') {
      const id = nextStored.trim();
      if (id === '') {
        onChange(required ? { id: '', ...kw } : null);
        return;
      }
      onChange({ id, ...kw });
      return;
    }
    if (nextInline.trim() === '') {
      onChange(required ? { content: '', ...kw } : null);
      return;
    }
    onChange({ content: nextInline, ...kw });
  };

  const changeMode = (next: Mode): void => {
    setMode(next);
    emit(next, inlineDraft, storedDraft, kwargsRows);
  };

  const changeInline = (next: string): void => {
    setInlineDraft(next);
    emit('inline', next, storedDraft, kwargsRows);
  };

  const changeStored = (next: string): void => {
    setStoredDraft(next);
    emit('stored', inlineDraft, next, kwargsRows);
  };

  const changeKwargs = (next: KwargRow[]): void => {
    setKwargsRows(next);
    emit(mode, inlineDraft, storedDraft, next);
  };

  const templateOptions = templates.map((template) => ({
    value: template.id,
    label: template.label ?? template.id,
  }));
  // A stored id the catalog does not offer cannot be picked from the list; it is
  // shown as an unresolved note rather than silently blanked.
  const unresolvedId =
    mode === 'stored' &&
    storedDraft.trim() !== '' &&
    !templatesLoading &&
    templatesError === undefined &&
    !templates.some((template) => template.id === storedDraft.trim())
      ? storedDraft.trim()
      : undefined;

  // ONE coherent group per field: the label + description form the group header,
  // and the source toggle, the active editor, and the render-parameters disclosure
  // sit under it — so the toggle unambiguously belongs to THIS field, and the field
  // reads label → description → toggle → editor → parameters like every sibling
  // field in the form. The header names the `role="group"` container; the toggle
  // names itself `"<label> source"`; the active editor is named by the field's own
  // name through its visually-hidden `<label for>` (see `hideLabel`). The group
  // container and that editor therefore both answer to the field's own name — the
  // container-name redundancy `Field` accepts by design (a redundant container is
  // audible, an unnamed group is silent).
  return (
    <Field label={label} description={description} group>
      <RadioGroup
        aria-label={`${label} source`}
        variant="segmented"
        value={mode}
        disabled={disabled}
        options={[
          { value: 'inline', label: 'Inline text' },
          { value: 'stored', label: 'Stored template' },
        ]}
        onValueChange={(next) => {
          changeMode(next as Mode);
        }}
      />

      {mode === 'inline' ? (
        renderInline !== undefined ? (
          renderInline({
            label,
            value: inlineDraft,
            onChange: changeInline,
            error,
            hideLabel: true,
          })
        ) : (
          <Field label={label} hideLabel error={error}>
            <Textarea
              value={inlineDraft}
              placeholder={placeholder}
              disabled={disabled}
              onChange={(event) => {
                changeInline(event.target.value);
              }}
            />
          </Field>
        )
      ) : templatesError !== undefined ? (
        <ErrorState message={templatesError} onRetry={onTemplatesRetry} />
      ) : templatesLoading ? (
        <Skeleton height={36} />
      ) : (
        <Field label={label} hideLabel error={error}>
          <Select
            placeholder={templates.length === 0 ? 'No templates available' : 'Select a template'}
            value={storedDraft}
            disabled={disabled || templates.length === 0}
            options={templateOptions}
            onValueChange={changeStored}
          />
        </Field>
      )}

      {unresolvedId !== undefined ? (
        <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
          {resolveError ?? `The stored template "${unresolvedId}" is not available.`}
        </p>
      ) : null}

      <KwargsEditor label={label} rows={kwargsRows} disabled={disabled} onChange={changeKwargs} />
    </Field>
  );
}
