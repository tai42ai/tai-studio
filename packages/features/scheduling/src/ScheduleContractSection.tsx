/**
 * The add-schedule dialog's door-contract section: the execution-key picker (the api
 * key a contract-bearing recurring fire runs as) and the four door-contract jq fields.
 */
import {
  ExecutionKeyPicker,
  type ExecutionKeyQuery,
  type TemplatedTextCatalog,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { ScheduleDoorContractFields } from './ScheduleDoorContractFields';
import type { ScheduleContractState } from './use-schedule-contract';

export interface ScheduleContractSectionProps {
  readonly contract: ScheduleContractState;
  readonly keysQuery: ExecutionKeyQuery;
  readonly templatedTextTemplates: TemplatedTextCatalog;
}

export function ScheduleContractSection({
  contract,
  keysQuery,
  templatedTextTemplates,
}: ScheduleContractSectionProps): ReactNode {
  return (
    <>
      <ExecutionKeyPicker
        query={keysQuery}
        value={contract.executionKey}
        onValueChange={contract.setExecutionKey}
        error={contract.executionKeyError ?? undefined}
      />
      <ScheduleDoorContractFields
        contract={contract.contract}
        onStartExprChange={contract.setStartExpr}
        onCancelExprChange={contract.setCancelExpr}
        onResumeExprChange={contract.setResumeExpr}
        onExtrasExprChange={contract.setExtrasExpr}
        templatedTextTemplates={templatedTextTemplates}
      />
    </>
  );
}
