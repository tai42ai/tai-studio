/**
 * The source region of `TemplatedTextField`: the inline/stored toggle and its
 * editors while storage is present, a stand-in while presence is unknown, and the
 * read-only stored reference (never converted, dropped, or blanked) when storage
 * is absent.
 */
import type { ReactNode } from 'react';

import { Field } from './field';
import { Textarea } from './inputs';
import { ErrorState, Skeleton } from './primitives';
import { RadioGroup } from './radio-group';
import { Select } from './select';
import type { TemplatedTextInlineProps, TemplatedTextTemplateOption } from './templated-text-field';
import type { Mode } from './templated-text-kwargs';

/** A labeled read-only reference to a stored template id, plus the note that
 *  stored templates are unavailable here — NOT an editable field. */
function ReadOnlyStoredReference({ id }: { readonly id: string }): ReactNode {
  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}>
        <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
          Stored template
        </span>
        <code style={{ fontFamily: 'var(--tai-font-mono)', wordBreak: 'break-all' }}>{id}</code>
      </div>
      <p
        style={{ margin: 0, fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}
      >
        Stored templates are unavailable — this deployment has no storage backend.
      </p>
    </>
  );
}

interface PresentStorageSourceProps {
  readonly label: string;
  readonly mode: Mode;
  readonly disabled: boolean;
  readonly inlineEditor: ReactNode;
  readonly error?: string;
  readonly storedDraft: string;
  readonly templates: readonly TemplatedTextTemplateOption[];
  readonly templateOptions: readonly { value: string; label: string }[];
  readonly templatesLoading: boolean;
  readonly templatesError?: string;
  readonly onTemplatesRetry?: () => void;
  readonly unresolvedId?: string;
  readonly resolveError?: string;
  readonly onModeChange: (mode: Mode) => void;
  readonly onStoredChange: (stored: string) => void;
}

/** The inline/stored toggle, the mode's editor, and the unresolved-id note, for
 *  the storage-present configuration. */
function PresentStorageSource({
  label,
  mode,
  disabled,
  inlineEditor,
  error,
  storedDraft,
  templates,
  templateOptions,
  templatesLoading,
  templatesError,
  onTemplatesRetry,
  unresolvedId,
  resolveError,
  onModeChange,
  onStoredChange,
}: PresentStorageSourceProps): ReactNode {
  return (
    <>
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
          onModeChange(next as Mode);
        }}
      />

      {mode === 'inline' ? (
        inlineEditor
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
            onValueChange={onStoredChange}
          />
        </Field>
      )}

      {unresolvedId !== undefined ? (
        <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
          {resolveError ?? `The stored template "${unresolvedId}" is not available.`}
        </p>
      ) : null}
    </>
  );
}

export interface TemplatedTextSourceProps {
  readonly label: string;
  readonly mode: Mode;
  readonly inlineDraft: string;
  readonly storedDraft: string;
  readonly error?: string;
  readonly disabled: boolean;
  readonly placeholder?: string;
  readonly renderInline?: (props: TemplatedTextInlineProps) => ReactNode;
  readonly templates: readonly TemplatedTextTemplateOption[];
  readonly templatesLoading: boolean;
  readonly templatesError?: string;
  readonly onTemplatesRetry?: () => void;
  readonly resolveError?: string;
  readonly storageAbsent: boolean;
  readonly storagePresenceLoading: boolean;
  /** The `id` already authored on the value, shown read-only when storage is absent. */
  readonly authoredStoredId?: string;
  readonly onModeChange: (mode: Mode) => void;
  readonly onInlineChange: (value: string) => void;
  readonly onStoredChange: (stored: string) => void;
}

export function TemplatedTextSource({
  label,
  mode,
  inlineDraft,
  storedDraft,
  error,
  disabled,
  placeholder,
  renderInline,
  templates,
  templatesLoading,
  templatesError,
  onTemplatesRetry,
  resolveError,
  storageAbsent,
  storagePresenceLoading,
  authoredStoredId,
  onModeChange,
  onInlineChange,
  onStoredChange,
}: TemplatedTextSourceProps): ReactNode {
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

  // The inline editor, shared by the present-storage inline mode and the
  // absent-storage inline-only rendering: the caller's rich editor when supplied,
  // else a plain textarea.
  const inlineEditor =
    renderInline !== undefined ? (
      renderInline({ label, value: inlineDraft, onChange: onInlineChange, error, hideLabel: true })
    ) : (
      <Field label={label} hideLabel error={error}>
        <Textarea
          value={inlineDraft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => {
            onInlineChange(event.target.value);
          }}
        />
      </Field>
    );

  // While presence is unknown a placeholder stands in, so the toggle is never
  // shown and then removed. With storage absent the stored source cannot work and
  // is not offered: an inline or empty value edits inline; a value carrying an
  // `id` is shown read-only. With storage present the full toggle and picker render.
  if (storagePresenceLoading) return <Skeleton height={36} />;
  if (storageAbsent) {
    return authoredStoredId !== undefined ? (
      <ReadOnlyStoredReference id={authoredStoredId} />
    ) : (
      inlineEditor
    );
  }
  return (
    <PresentStorageSource
      label={label}
      mode={mode}
      disabled={disabled}
      inlineEditor={inlineEditor}
      error={error}
      storedDraft={storedDraft}
      templates={templates}
      templateOptions={templateOptions}
      templatesLoading={templatesLoading}
      templatesError={templatesError}
      onTemplatesRetry={onTemplatesRetry}
      unresolvedId={unresolvedId}
      resolveError={resolveError}
      onModeChange={onModeChange}
      onStoredChange={onStoredChange}
    />
  );
}
