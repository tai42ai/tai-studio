/**
 * One templated-text door jq field for the add-schedule dialog, authored inline
 * through a `JqField` (a resting input with an always-present visual-editor door)
 * with an optional stored-template picker gated on a storage backend. Mirrors the
 * hooks feature's inline jq field; the add-schedule dialog is throwaway (it closes
 * on success), so it needs no reset token.
 */
import type { TemplatedText } from '@tai42/api-client';
import type { JqFieldDeclaration } from '@tai42/jq-studio';
import { JqField } from '@tai42/jq-studio';
import { type TemplatedTextCatalog, TemplatedTextField } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

export interface ScheduleTemplatedJqFieldProps {
  readonly label: string;
  readonly description: string;
  readonly value: TemplatedText | null;
  readonly onChange: (value: TemplatedText | null) => void;
  readonly declaration: JqFieldDeclaration;
  readonly templatedTextTemplates: TemplatedTextCatalog;
}

export function ScheduleTemplatedJqField({
  label,
  description,
  value,
  onChange,
  declaration,
  templatedTextTemplates,
}: ScheduleTemplatedJqFieldProps): ReactNode {
  return (
    <TemplatedTextField
      label={label}
      description={description}
      value={value}
      templates={templatedTextTemplates.templates}
      templatesLoading={templatedTextTemplates.loading}
      templatesError={templatedTextTemplates.error}
      onTemplatesRetry={templatedTextTemplates.onRetry}
      storageAbsent={templatedTextTemplates.storageAbsent}
      storagePresenceLoading={templatedTextTemplates.storagePresenceLoading}
      onChange={onChange}
      renderInline={({
        label: inlineLabel,
        value: inlineValue,
        onChange: onInlineChange,
        hideLabel,
      }) => (
        <div className={hideLabel ? 'tai-templated-inline--grouped' : undefined}>
          <JqField
            label={inlineLabel}
            shape={declaration.shape}
            multiline={false}
            value={inlineValue}
            onChange={onInlineChange}
          />
        </div>
      )}
    />
  );
}
