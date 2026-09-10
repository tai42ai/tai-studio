/**
 * The subject + scope jq of one attached state: the SUBJECT expression (required)
 * yields either a bare record-key string or a full subject object; the optional SCOPE
 * expression is a boolean jq predicate — when it is false the state is skipped for the run.
 */
import type { ReactNode } from 'react';

import { BindingJqField, type TemplateJqSuggestion } from './BindingJqField';

export interface SubjectScopeFieldsProps {
  readonly subjectExpr: string;
  readonly scopeExpr: string | null;
  readonly onSubjectChange: (value: string) => void;
  readonly onScopeChange: (value: string | null) => void;
  readonly subjectError?: string;
  readonly suggestions?: readonly TemplateJqSuggestion[];
}

export function SubjectScopeFields({
  subjectExpr,
  scopeExpr,
  onSubjectChange,
  onScopeChange,
  subjectError,
  suggestions,
}: SubjectScopeFieldsProps): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <BindingJqField
        label="Subject"
        description="The record key this binding reads and updates: a key string, or a full subject object."
        value={subjectExpr}
        onChange={onSubjectChange}
        error={subjectError}
        suggestions={suggestions}
        placeholder=".subject_id"
      />
      <BindingJqField
        label="Scope"
        description="Optional. A jq condition; when it is false this state is skipped for the run."
        value={scopeExpr ?? ''}
        onChange={(next) => {
          onScopeChange(next.trim() === '' ? null : next);
        }}
        suggestions={suggestions}
      />
    </div>
  );
}
