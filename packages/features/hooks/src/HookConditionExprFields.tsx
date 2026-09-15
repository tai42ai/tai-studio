/**
 * The optional `condition` and `expr` jq fields. `condition` gates whether the hook
 * fires; `expr` shapes the event before the tool runs. Both are authored as
 * templated text (inline jq or a stored template id) and default to unset.
 */
import type { TemplatedTextCatalog } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { HOOK_CONDITION_DECLARATION, HOOK_EXPR_DECLARATION } from './hookJqDeclarations';
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
        label="Expr"
        description="Optional. Shapes the event before the tool runs; blank leaves it unset."
        value={fields.expr}
        onChange={fields.setExpr}
        declaration={HOOK_EXPR_DECLARATION}
        templatedTextTemplates={templatedTextTemplates}
        resetToken={fields.formResetToken}
      />
    </>
  );
}
