/**
 * The last-gate invariant a fenced profile apply upholds.
 */

/**
 * A fenced apply must NEVER fire while the reviewed diff carries boundary-refused
 * keys (a partial apply on a destructive action). Throws loudly when handed any
 * refused key.
 */
export function assertApplyable(refusedKeys: readonly string[]): void {
  if (refusedKeys.length > 0) {
    throw new Error(
      `Refusing to apply: the diff carries boundary-refused keys (${refusedKeys.join(', ')}).`,
    );
  }
}
