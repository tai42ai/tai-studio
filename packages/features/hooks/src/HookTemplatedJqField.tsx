/**
 * One templated-text field whose inline authoring surface is a `JqField` (a resting
 * input with an always-present visual-editor door). The stored-template picker is
 * gated on a storage backend; a fresh `resetToken` remounts the control blank after
 * a successful create.
 */
import type { ReactNode } from 'react';
import { TemplatedTextField, type TemplatedTextCatalog } from '@tai42/studio-sdk';
import { JqField } from '@tai42/jq-studio';
import type { JqFieldDeclaration } from '@tai42/jq-studio';
import type { TemplatedText } from '@tai42/api-client';

export interface HookTemplatedJqFieldProps {
  readonly label: string;
  readonly description: string;
  readonly value: TemplatedText | null;
  readonly onChange: (value: TemplatedText | null) => void;
  readonly declaration: JqFieldDeclaration;
  readonly templatedTextTemplates: TemplatedTextCatalog;
  readonly resetToken: number;
}

export function HookTemplatedJqField({
  label,
  description,
  value,
  onChange,
  declaration,
  templatedTextTemplates,
  resetToken,
}: HookTemplatedJqFieldProps): ReactNode {
  return (
    <TemplatedTextField
      key={`${label}-${String(resetToken)}`}
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
