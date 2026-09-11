/**
 * One state-binding jq slot authored as a {@link TemplatedText}: a
 * `TemplatedTextField` whose INLINE editor is the jq field (the host's visual jq
 * door, else a textarea) carrying the attached templates' template-jq inserts, and
 * whose STORED mode picks a stored template that renders to the jq at run time.
 */
import type { ReactNode } from 'react';

import { TemplatedTextField } from '../components/templated-text-field';
import { BindingJqField, type TemplateJqSuggestion } from './BindingJqField';
import type { TemplatedText, TemplatedTextCatalog } from './types';

export interface BindingTemplatedJqFieldProps {
  readonly label: string;
  readonly value: TemplatedText | null;
  readonly onChange: (value: TemplatedText | null) => void;
  readonly description?: string;
  readonly error?: string;
  /** The subject/adapter slots require a source; the rest are optional (`null` clears). */
  readonly required?: boolean;
  readonly placeholder?: string;
  readonly suggestions?: readonly TemplateJqSuggestion[];
  readonly templates?: TemplatedTextCatalog;
  readonly disabled?: boolean;
}

export function BindingTemplatedJqField({
  label,
  value,
  onChange,
  description,
  error,
  required,
  placeholder,
  suggestions,
  templates,
  disabled,
}: BindingTemplatedJqFieldProps): ReactNode {
  return (
    <TemplatedTextField
      label={label}
      value={value}
      onChange={onChange}
      description={description}
      error={error}
      required={required}
      disabled={disabled}
      templates={templates?.templates}
      templatesLoading={templates?.loading}
      templatesError={templates?.error}
      onTemplatesRetry={templates?.onRetry}
      storageAbsent={templates?.storageAbsent}
      storagePresenceLoading={templates?.storagePresenceLoading}
      renderInline={({
        label: inlineLabel,
        value: inlineValue,
        onChange: onInlineChange,
        error: inlineError,
        hideLabel: inlineHideLabel,
      }) => (
        <BindingJqField
          label={inlineLabel}
          value={inlineValue}
          onChange={onInlineChange}
          error={inlineError}
          placeholder={placeholder}
          suggestions={suggestions}
          hideLabel={inlineHideLabel}
        />
      )}
    />
  );
}
