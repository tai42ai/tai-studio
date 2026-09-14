/** The specific, non-retryable copy the inbox shows for answer and cancel failures. */
import { ApiConflictError, ApiError } from '@tai42/api-client';

/** Shown when a 409 says the question was resolved elsewhere (not a generic error). */
const ALREADY_ANSWERED_MESSAGE = 'This question was already answered elsewhere.';

/**
 * The withdraw-confirm's specific failure copy. A 409 means the question was answered
 * (by another client, or the flow, in the meantime) and is no longer cancellable; a
 * 404 means it is already gone (answered, withdrawn, or expired). Both are states the
 * operator cannot retry, so the dialog names them plainly rather than showing a raw
 * server line. Any other failure falls through to the generic message.
 */
const CANCEL_CONFLICT_MESSAGE =
  'This question was already answered and can no longer be cancelled.';
const CANCEL_GONE_MESSAGE =
  'This question is no longer pending — it may have been answered or already withdrawn.';

/** Resolve the message the withdraw-confirm dialog shows for a failed cancel. */
export function resolveCancelError(error: Error | null): string | null {
  if (error === null) return null;
  if (error instanceof ApiConflictError) return CANCEL_CONFLICT_MESSAGE;
  if (error instanceof ApiError && error.status === 404) return CANCEL_GONE_MESSAGE;
  return error.message;
}

/**
 * Resolve the single message the ErrorState shows. An answer error takes priority
 * (it is the operator's most recent action; a 409 maps to the specific "already
 * answered elsewhere" message), then a list-read failure, then a stream error.
 */
export function resolveErrorMessage(
  streamError: Error | null,
  loadError: Error | null,
  answerError: Error | null,
): string | null {
  if (answerError !== null) {
    if (answerError instanceof ApiConflictError) return ALREADY_ANSWERED_MESSAGE;
    return answerError.message;
  }
  if (loadError !== null) return loadError.message;
  if (streamError !== null) return streamError.message;
  return null;
}
