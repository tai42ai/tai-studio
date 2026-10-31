/**
 * The hook form's optional Subject group: the SDK's `SubjectSection` bound to the hook
 * form's fields, with the key given as templated text (an inline jq over the event
 * payload, or a stored template, plus kwargs). The target + kind + key expression are
 * either all filled or all left blank; a partially-filled subject is refused loudly on
 * submit (the error is surfaced here).
 */
import {
  SubjectSection,
  type SubjectTargetOption,
  type TemplatedTextCatalog,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { HOOK_SUBJECT_KEY_DECLARATION } from './hookJqDeclarations';
import { HookTemplatedJqField } from './HookTemplatedJqField';
import type { HookFormFields } from './useHookFormFields';

export interface HookSubjectSectionProps {
  readonly fields: HookFormFields;
  readonly targetOptions: readonly SubjectTargetOption[];
  readonly templatedTextTemplates: TemplatedTextCatalog;
}

export function HookSubjectSection({
  fields,
  targetOptions,
  templatedTextTemplates,
}: HookSubjectSectionProps): ReactNode {
  return (
    <SubjectSection
      open={fields.subjectOpen}
      onToggle={() => {
        fields.setSubjectOpen((open) => !open);
      }}
      target={fields.subjectTarget}
      onTargetChange={fields.setSubjectTarget}
      kind={fields.subjectKind}
      onKindChange={fields.setSubjectKind}
      error={fields.subjectError}
      targetOptions={targetOptions}
      caption="Key this fire’s state writes to a subject; leave blank for none."
      targetPlaceholder="Choose a conversation target"
      keyField={
        <HookTemplatedJqField
          label="Key expression"
          description="A jq over the event payload; it must yield a non-empty string key."
          value={fields.subjectKeyExpr}
          onChange={fields.setSubjectKeyExpr}
          declaration={HOOK_SUBJECT_KEY_DECLARATION}
          templatedTextTemplates={templatedTextTemplates}
          resetToken={fields.formResetToken}
        />
      }
    />
  );
}
