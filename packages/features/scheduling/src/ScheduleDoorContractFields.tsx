/**
 * The four optional door-contract jq fields of the add-schedule dialog: `start_expr`
 * builds the fired tool's kwargs, `cancel_expr` / `resume_expr` act on the run's
 * parked interactions, and `extras_expr` builds the started run's extras. Each is
 * authored as templated text (inline jq or a stored template id) and defaults to
 * unset; any one set needs an execution key.
 */
import type { TemplatedText } from '@tai42/api-client';
import type { TemplatedTextCatalog } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import type { ScheduleDoorContract } from './schedule-form';
import {
  SCHEDULE_CANCEL_EXPR_DECLARATION,
  SCHEDULE_EXTRAS_EXPR_DECLARATION,
  SCHEDULE_RESUME_EXPR_DECLARATION,
  SCHEDULE_START_EXPR_DECLARATION,
} from './scheduleJqDeclarations';
import { ScheduleTemplatedJqField } from './ScheduleTemplatedJqField';

export interface ScheduleDoorContractFieldsProps {
  readonly contract: ScheduleDoorContract;
  readonly onStartExprChange: (value: TemplatedText | null) => void;
  readonly onCancelExprChange: (value: TemplatedText | null) => void;
  readonly onResumeExprChange: (value: TemplatedText | null) => void;
  readonly onExtrasExprChange: (value: TemplatedText | null) => void;
  readonly templatedTextTemplates: TemplatedTextCatalog;
}

export function ScheduleDoorContractFields({
  contract,
  onStartExprChange,
  onCancelExprChange,
  onResumeExprChange,
  onExtrasExprChange,
  templatedTextTemplates,
}: ScheduleDoorContractFieldsProps): ReactNode {
  return (
    <>
      <ScheduleTemplatedJqField
        label="Start"
        description="Optional. Builds the fired tool's kwargs from the stored arguments; blank fires them unchanged. Reads $parked."
        value={contract.startExpr}
        onChange={onStartExprChange}
        declaration={SCHEDULE_START_EXPR_DECLARATION}
        templatedTextTemplates={templatedTextTemplates}
      />
      <ScheduleTemplatedJqField
        label="Cancel"
        description="Optional. Names the parked interactions to cancel; blank cancels nothing. Reads $parked."
        value={contract.cancelExpr}
        onChange={onCancelExprChange}
        declaration={SCHEDULE_CANCEL_EXPR_DECLARATION}
        templatedTextTemplates={templatedTextTemplates}
      />
      <ScheduleTemplatedJqField
        label="Resume"
        description="Optional. Names the parked interactions to resume with an answer or to take; blank resumes nothing. Reads $parked."
        value={contract.resumeExpr}
        onChange={onResumeExprChange}
        declaration={SCHEDULE_RESUME_EXPR_DECLARATION}
        templatedTextTemplates={templatedTextTemplates}
      />
      <ScheduleTemplatedJqField
        label="Extras"
        description="Optional. Builds the extras mapping handed to the started run; blank sends none. Reads $parked."
        value={contract.extrasExpr}
        onChange={onExtrasExprChange}
        declaration={SCHEDULE_EXTRAS_EXPR_DECLARATION}
        templatedTextTemplates={templatedTextTemplates}
      />
    </>
  );
}
