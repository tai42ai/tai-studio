/**
 * The optional `condition` gate plus the four door-contract jq fields a hook
 * carries: `start_expr` builds the fired tool's kwargs, `cancel_expr` /
 * `resume_expr` act on the run's parked interactions, and `extras_expr` builds the
 * started run's extras. Each is authored as templated text (inline jq or a stored
 * template id) and defaults to unset.
 */
import type { TemplatedTextCatalog } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import {
  HOOK_CANCEL_EXPR_DECLARATION,
  HOOK_CONDITION_DECLARATION,
  HOOK_EXTRAS_EXPR_DECLARATION,
  HOOK_RESUME_EXPR_DECLARATION,
  HOOK_START_EXPR_DECLARATION,
} from './hookJqDeclarations';
import { HookTemplatedJqField } from './HookTemplatedJqField';
import type { HookFormFields } from './useHookFormFields';

export interface HookConditionExprFieldsProps {
  readonly fields: HookFormFields;
  readonly templatedTextTemplates: TemplatedTextCatalog;
}

export function HookConditionExprFields({
  fields,
  templatedTextTemplates,
}: HookConditionExprFieldsProps): ReactNode {
  return (
    <>
      <HookTemplatedJqField
        label="Condition"
        description="Optional. Gates whether the hook fires; blank leaves it unset."
        value={fields.condition}
        onChange={fields.setCondition}
        declaration={HOOK_CONDITION_DECLARATION}
        templatedTextTemplates={templatedTextTemplates}
        resetToken={fields.formResetToken}
      />
      <HookTemplatedJqField
        label="Start"
        description="Optional. Builds the fired tool's kwargs from the event; blank fires the stored kwargs. Reads $parked."
        value={fields.startExpr}
        onChange={fields.setStartExpr}
        declaration={HOOK_START_EXPR_DECLARATION}
        templatedTextTemplates={templatedTextTemplates}
        resetToken={fields.formResetToken}
      />
      <HookTemplatedJqField
        label="Cancel"
        description="Optional. Names the parked interactions to cancel; blank cancels nothing. Reads $parked."
        value={fields.cancelExpr}
        onChange={fields.setCancelExpr}
        declaration={HOOK_CANCEL_EXPR_DECLARATION}
        templatedTextTemplates={templatedTextTemplates}
        resetToken={fields.formResetToken}
      />
      <HookTemplatedJqField
        label="Resume"
        description="Optional. Names the parked interactions to resume with an answer or to take; blank resumes nothing. Reads $parked."
        value={fields.resumeExpr}
        onChange={fields.setResumeExpr}
        declaration={HOOK_RESUME_EXPR_DECLARATION}
        templatedTextTemplates={templatedTextTemplates}
        resetToken={fields.formResetToken}
      />
      <HookTemplatedJqField
        label="Extras"
        description="Optional. Builds the extras mapping handed to the started run; blank sends none. Reads $parked."
        value={fields.extrasExpr}
        onChange={fields.setExtrasExpr}
        declaration={HOOK_EXTRAS_EXPR_DECLARATION}
        templatedTextTemplates={templatedTextTemplates}
        resetToken={fields.formResetToken}
      />
    </>
  );
}
