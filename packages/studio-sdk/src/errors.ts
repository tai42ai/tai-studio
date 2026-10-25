/**
 * Normalize an unknown thrown/rejected value (a TanStack Query `error`, a
 * rejected mutation, a zod/`ApiError`) into a human-readable string for the loud
 * `ErrorState` / `Field` surfaces. This only turns a caught value into
 * displayable text — it never swallows the failure; the caller decides where to
 * show it, and the message is always shown, never blank.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'An unexpected error occurred.';
}

/**
 * True when `error` is a refusal for want of a grant: an object whose `status` is
 * `403`. Duck-typed, so it reads an `ApiError` and any error shaped like one.
 */
export function isForbiddenError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 403
  );
}
