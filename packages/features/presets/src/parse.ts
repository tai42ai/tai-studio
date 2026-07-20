/**
 * Small pure helpers shared by the create form and the save-version dialog.
 *
 * `parseJsonObject` is the LOUD parse for the baked-`fixed_kwargs` JSON textarea:
 * it returns either the parsed object or a message to surface verbatim under the
 * field — a malformed body is never silently swallowed or coerced. (The stored
 * extension-combos projection to bare names is the SDK's `comboElementNames`, shared
 * with the tool-extensions editor.)
 */

/** The parsed JSON object, or a loud error message. An empty textarea is `{}`. */
export function parseJsonObject(
  text: string,
): { readonly value: Record<string, unknown> } | { readonly error: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { value: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON.' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: 'Fixed kwargs must be a JSON object.' };
  }
  return { value: parsed as Record<string, unknown> };
}

/** A stable structural equality over JSON-serialisable values (dirty detection). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
