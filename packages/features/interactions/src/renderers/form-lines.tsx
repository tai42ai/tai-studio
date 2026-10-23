/**
 * The form answer's two caller-worded lines: the stepped form's progress line
 * (`wording.form.step_progress`) and the could-not-update banner for a failed reaction
 * round-trip (`wording.form.update_failed`), each with the surface's own English when the
 * caller set none.
 */
import type { FormPage } from '@tai42/api-client';
import { ApiError } from '@tai42/api-client';
import type { ReactNode } from 'react';
import { useId } from 'react';

import { FormReactionRequestError } from '../reaction-config';
import { isPlainObject } from './answer-schema';
import { contextHeadingStyle, formContextStyle, malformedStyle } from './renderer-styles';

/** `text` with every `{token}` replaced by `value`: a plain split/join, never a pattern replace. */
function fillToken(text: string, token: string, value: string): string {
  return text.split(`{${token}}`).join(value);
}

/**
 * The current step's progress line: the caller's `label` with `{step}` / `{steps}` filled,
 * else "Step N of M", then " — <page title>". The section is named by the line itself.
 */
export function FormStepStatus({
  pages,
  step,
  label,
}: {
  readonly pages: readonly FormPage[];
  readonly step: number;
  readonly label: string | undefined;
}): ReactNode {
  const lineId = useId();
  const page = pages[step];
  if (page === undefined) return null;
  const stepText = String(step + 1);
  const stepsText = String(pages.length);
  const progress =
    label === undefined
      ? `Step ${stepText} of ${stepsText}`
      : fillToken(fillToken(label, 'step', stepText), 'steps', stepsText);
  return (
    <section style={formContextStyle} data-testid="form-step-status" aria-labelledby={lineId}>
      <p id={lineId} style={contextHeadingStyle}>
        {progress}
        {page.title !== '' ? ` — ${page.title}` : ''}
      </p>
    </section>
  );
}

/**
 * A failed reaction round-trip: `message` the failure's own text (the surface's line
 * shows it), `reason` the server door's reason when it sent one (the caller's line fills
 * `{reason}` with it), else `null`.
 */
export interface ReactionFailure {
  readonly message: string;
  readonly reason: string | null;
}

/**
 * The failure a reaction round-trip threw. The in-app door's `ApiError` carries the
 * server's `error` in its parsed body, and the host door's `FormReactionRequestError` the
 * response's `reason`; any other failure (a network error, a malformed update) has no
 * server reason.
 */
export function reactionFailure(error: unknown): ReactionFailure {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof FormReactionRequestError) return { message, reason: error.reason };
  if (error instanceof ApiError && isPlainObject(error.body)) {
    const reason = error.body.error;
    return { message, reason: typeof reason === 'string' ? reason : null };
  }
  return { message, reason: null };
}

/**
 * A LOUD banner for a failed reaction round-trip — never a silent or stale value: the
 * caller's `label` with `{reason}` filled by the server door's reason (empty when it sent
 * none), else "The form could not update: <message>".
 */
export function ReactionErrorNotice({
  failure,
  label,
}: {
  readonly failure: ReactionFailure | null;
  readonly label: string | undefined;
}): ReactNode {
  if (failure === null) return null;
  return (
    <p
      role="alert"
      data-testid="form-reaction-error"
      className="tai-field-error"
      style={malformedStyle}
    >
      {label === undefined
        ? `The form could not update: ${failure.message}`
        : fillToken(label, 'reason', failure.reason ?? '')}
    </p>
  );
}
