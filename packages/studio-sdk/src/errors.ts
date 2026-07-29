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
