/** The fire-path form submit gate. */
import {
  canHoldExecutionKey,
  type ExecutionKeyBinding,
  type ExecutionKeyQuery,
} from '@tai42/studio-sdk';

/** Unsatisfiable exactly when the execution-key picker has no key for the form to send. */
export function fireGateUnsatisfiable(
  keys: ExecutionKeyQuery,
  binding: ExecutionKeyBinding,
  value: string,
): boolean {
  return !canHoldExecutionKey(keys, binding, value);
}
