/**
 * The subject + scope of one attached state: the SUBJECT (required) yields either a
 * bare record-key string or a full subject object; the optional SCOPE is a boolean
 * jq predicate — when it is false the state is skipped for the run. Each is an
 * authored templated-text value (inline jq or a stored template that renders to it).
 */
import type { ReactNode } from 'react';

import { BindingTemplatedJqField } from './BindingTemplatedJqField';
import type { TemplateJqSuggestion } from './BindingJqField';
import type { TemplatedText, TemplatedTextCatalog } from './types';

export interface SubjectScopeFieldsProps {
  readonly subjectExpr: TemplatedText;
  readonly scopeExpr: TemplatedText | null;
  readonly onSubjectChange: (value: TemplatedText) => void;
  readonly onScopeChange: (value: TemplatedText | null) => void;
  readonly subjectError?: string;
  readonly suggestions?: readonly TemplateJqSuggestion[];
  readonly templates?: TemplatedTextCatalog;
}

export function SubjectScopeFields({
  subjectExpr,
  scopeExpr,
  onSubjectChange,
  onScopeChange,
  subjectError,
  suggestions,
  templates,
}: SubjectScopeFieldsProps): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <BindingTemplatedJqField
        label="Subject"
        required
        description="The record key this binding reads and updates: a key string, or a full subject object."
        value={subjectExpr}
        error={subjectError}
        suggestions={suggestions}
        templates={templates}
        placeholder=".subject_id"
        onChange={(next) => {
          onSubjectChange(next ?? { content: '' });
        }}
      />
      <BindingTemplatedJqField
        label="Scope"
        description="Optional. A jq condition; when it is false this state is skipped for the run."
        value={scopeExpr}
        suggestions={suggestions}
        templates={templates}
        onChange={onScopeChange}
      />
    </div>
  );
}
