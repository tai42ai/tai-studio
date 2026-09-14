/**
 * Assemble the register body from the form's raw field values. Parses the
 * `tool_kwargs` textarea and validates the optional subject; a bad value returns a
 * field-scoped error rather than a thrown exception, so the form can place the
 * message under the offending control and fire no request. An untouched subject is
 * omitted; a partially-filled one is refused loudly.
 */
import { errorMessage } from '@tai42/studio-sdk';
import type { HookRegister, HookSubject, StateBinding, TemplatedText } from '@tai42/api-client';

import { parseJsonObject } from './jsonObjectField';

export interface HookFormValues {
  readonly name: string;
  readonly topic: string;
  readonly tool: string;
  readonly executionKey: string;
  readonly toolKwargs: string;
  readonly subjectTarget: string;
  readonly subjectKind: string;
  readonly subjectKeyExpr: string;
  readonly condition: TemplatedText | null;
  readonly expr: TemplatedText | null;
  readonly stateBinding: StateBinding | null;
}

export type HookParamsResult =
  | { readonly ok: true; readonly params: HookRegister }
  | { readonly ok: false; readonly field: 'kwargs' | 'subject'; readonly message: string };

/** A subject is present when any of its three inputs is non-blank. */
function subjectTouched(values: HookFormValues): boolean {
  return (
    values.subjectTarget !== '' ||
    values.subjectKind.trim() !== '' ||
    values.subjectKeyExpr.trim() !== ''
  );
}

/** Build the subject or return a loud field error; `null` when untouched. */
function resolveSubject(values: HookFormValues): HookSubject | null | { readonly message: string } {
  if (!subjectTouched(values)) return null;
  const separator = values.subjectTarget.indexOf(':');
  if (separator < 0 || values.subjectKind.trim() === '' || values.subjectKeyExpr.trim() === '') {
    return { message: 'A subject needs a target, a kind, and a key expression.' };
  }
  return {
    target_kind: values.subjectTarget.slice(0, separator) as HookSubject['target_kind'],
    target_name: values.subjectTarget.slice(separator + 1),
    kind: values.subjectKind.trim(),
    key_expr: { content: values.subjectKeyExpr.trim() },
  };
}

export function buildHookParams(values: HookFormValues): HookParamsResult {
  let toolKwargs: Record<string, unknown>;
  try {
    toolKwargs = parseJsonObject(values.toolKwargs, 'tool_kwargs') ?? {};
  } catch (error) {
    return { ok: false, field: 'kwargs', message: errorMessage(error) };
  }

  const subject = resolveSubject(values);
  if (subject !== null && 'message' in subject) {
    return { ok: false, field: 'subject', message: subject.message };
  }

  return {
    ok: true,
    params: {
      name: values.name.trim(),
      topic: values.topic.trim(),
      tool: values.tool.trim(),
      execution_key: values.executionKey,
      tool_kwargs: toolKwargs,
      subject,
      condition: values.condition,
      expr: values.expr,
      state_binding: values.stateBinding,
    },
  };
}
