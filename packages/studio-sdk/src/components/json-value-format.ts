/**
 * Formatting a JSON value for display and for the clipboard: the inline primitive
 * text and its syntax class, the clipboard serialization, and the copy-failure
 * messages.
 */

/** Shown when the browser offers no clipboard at all (any non-secure context). */
export const NO_CLIPBOARD =
  'This browser will not write to the clipboard here. Select the value and copy it by hand.';

/** Shown when the write, or the value's serialization, is offered and refused. */
export function copyFailed(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  return `Copy failed: ${detail}.`;
}

export function primitiveText(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined':
      return 'undefined';
    case 'string':
      return `"${value}"`;
    case 'number':
    case 'bigint':
    case 'boolean':
      return String(value);
    case 'symbol':
      return value.toString();
    case 'function':
      return '[Function]';
    default:
      return '[object]';
  }
}

/** The syntax class for a primitive's type; anything outside JSON reads as muted. */
export function primitiveClass(value: unknown): string {
  if (typeof value === 'string') return 'tai-syntax-string';
  if (typeof value === 'number' || typeof value === 'bigint') return 'tai-syntax-number';
  if (typeof value === 'boolean') return 'tai-syntax-bool';
  if (value === null || value === undefined) return 'tai-syntax-null';
  return 'tai-muted';
}

/**
 * `JSON.stringify` is TYPED to always return `string`, but a value it cannot
 * represent (a function, a bare `undefined`) yields `undefined` at runtime. This
 * boundary admits the absence the standard-library overload denies, so the guard
 * below is a real check rather than a cast around one.
 */
function stringifyJson(value: unknown): string | undefined {
  return JSON.stringify(value, null, 2);
}

/**
 * The value's pretty JSON for the clipboard. A value JSON cannot represent (a
 * function, a bare `undefined`) has no JSON, so its readable form is copied
 * rather than an empty string. A value JSON REFUSES (a `bigint`) throws here, and
 * the caller renders that as the same visible alert a blocked write is.
 */
export function serializeForCopy(value: unknown): string {
  return stringifyJson(value) ?? String(value);
}
