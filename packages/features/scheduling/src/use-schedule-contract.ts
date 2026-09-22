/**
 * The add-schedule dialog's door-contract state: the execution key a
 * contract-bearing fire runs as, its inline required-key error, and the four
 * door-contract jqs. Kept in one hook so the dialog body stays small; the pure
 * `ScheduleDoorContract` it exposes feeds `buildScheduleBody`.
 */
import type { TemplatedText } from '@tai42/api-client';
import { useState } from 'react';

import type { ScheduleDoorContract } from './schedule-form';

export interface ScheduleContractState {
  readonly executionKey: string;
  readonly setExecutionKey: (value: string) => void;
  readonly executionKeyError: string | null;
  readonly setExecutionKeyError: (value: string | null) => void;
  readonly startExpr: TemplatedText | null;
  readonly setStartExpr: (value: TemplatedText | null) => void;
  readonly cancelExpr: TemplatedText | null;
  readonly setCancelExpr: (value: TemplatedText | null) => void;
  readonly resumeExpr: TemplatedText | null;
  readonly setResumeExpr: (value: TemplatedText | null) => void;
  readonly extrasExpr: TemplatedText | null;
  readonly setExtrasExpr: (value: TemplatedText | null) => void;
  /** The pure door contract the submit body reads. */
  readonly contract: ScheduleDoorContract;
}

export function useScheduleContract(): ScheduleContractState {
  const [executionKey, setExecutionKey] = useState('');
  const [executionKeyError, setExecutionKeyError] = useState<string | null>(null);
  const [startExpr, setStartExpr] = useState<TemplatedText | null>(null);
  const [cancelExpr, setCancelExpr] = useState<TemplatedText | null>(null);
  const [resumeExpr, setResumeExpr] = useState<TemplatedText | null>(null);
  const [extrasExpr, setExtrasExpr] = useState<TemplatedText | null>(null);

  return {
    executionKey,
    setExecutionKey,
    executionKeyError,
    setExecutionKeyError,
    startExpr,
    setStartExpr,
    cancelExpr,
    setCancelExpr,
    resumeExpr,
    setResumeExpr,
    extrasExpr,
    setExtrasExpr,
    contract: { startExpr, cancelExpr, resumeExpr, extrasExpr },
  };
}
