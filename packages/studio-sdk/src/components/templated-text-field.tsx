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
 * own editor. The stored-template list, its loading/error state, the verbatim
 * server message for an id that no longer resolves, and whether storage is present
 * are passed in by the caller — this control holds no data edge of its own.
 *
 * When storage is absent (a supported configuration in which stored templates
 * cannot be fetched or resolved) the stored source is not offered: an inline or
 * empty value edits inline; a value already carrying an `id` is shown read-only with
 * its kwargs, never converted or dropped. See `storageAbsent` /
 * `storagePresenceLoading`.
 */
import { useState, type ReactNode } from 'react';

import type { TemplatedText } from '@tai42/api-client';

import { Field } from './field';
import {
  initialMode,
  objectToRows,
  templatedValueFrom,
  type KwargRow,
  type Mode,
} from './templated-text-kwargs';
import { KwargsEditor, ReadOnlyKwargs } from './templated-text-kwargs-editor';
import { TemplatedTextSource } from './templated-text-source';

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
  /**
   * Storage is registered ABSENT (`GET /api/storage` → `present: false`) — a fully
   * supported configuration in which stored templates can be neither browsed nor
   * resolved. The stored source is therefore not offered: an inline or empty value
   * shows the inline editor alone (no toggle, no catalog); a value that already
   * carries an `id` is shown READ-ONLY with its kwargs and a note that stored
   * templates are unavailable here — the authored value is never converted to inline,
   * dropped, or blanked.
   */
  readonly storageAbsent?: boolean;
  /**
   * Storage presence is not yet known. A placeholder stands in for the source region
   * so the toggle is not shown and then removed once presence resolves.
   */
  readonly storagePresenceLoading?: boolean;
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
  storageAbsent = false,
  storagePresenceLoading = false,
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
    onChange(templatedValueFrom(nextMode, nextInline, nextStored, nextKwargs, required));
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

  // A stored `id` already authored on the value is shown read-only when storage is
  // absent — never resolved, browsed, converted, or dropped.
  const showsReadOnlyStored = storageAbsent && value?.id !== undefined;

  const source = (
    <TemplatedTextSource
      label={label}
      mode={mode}
      inlineDraft={inlineDraft}
      storedDraft={storedDraft}
      error={error}
      disabled={disabled}
      placeholder={placeholder}
      renderInline={renderInline}
      templates={templates}
      templatesLoading={templatesLoading}
      templatesError={templatesError}
      onTemplatesRetry={onTemplatesRetry}
      resolveError={resolveError}
      storageAbsent={storageAbsent}
      storagePresenceLoading={storagePresenceLoading}
      authoredStoredId={value?.id}
      onModeChange={changeMode}
      onInlineChange={changeInline}
      onStoredChange={changeStored}
    />
  );

  // ONE coherent group per field: the label + description form the group header, and
  // the source region and the render-parameters disclosure sit under it — so the
  // controls unambiguously belong to THIS field, read label → description → source →
  // parameters like every sibling field. The header names the `role="group"`
  // container; the active editor is named by the field's own name through its
  // visually-hidden `<label for>` (see `hideLabel`). The container-name redundancy
  // `Field` accepts by design (a redundant container is audible, an unnamed group is
  // silent).
  return (
    <Field label={label} description={description} group>
      {source}
      {showsReadOnlyStored ? (
        <ReadOnlyKwargs label={label} rows={kwargsRows} />
      ) : (
        <KwargsEditor label={label} rows={kwargsRows} disabled={disabled} onChange={changeKwargs} />
      )}
    </Field>
  );
}
