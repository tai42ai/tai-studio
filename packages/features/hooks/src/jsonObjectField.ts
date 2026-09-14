/**
 * Parse a JSON-object textarea shared by the hooks write forms. Blank yields
 * `undefined` so each caller decides whether that means `{}` or an omitted field;
 * a parse failure or a non-object value throws a loud message naming the field,
 * so bad input blocks submit before any request fires.
 */
import { errorMessage } from '@tai42/studio-sdk';

/**
 * Parse `raw` as a JSON object. Blank returns `undefined`. Unparseable JSON, or a
 * value that is not a plain object, throws an `Invalid JSON: …` error whose tail
 * names `label` (the field the value came from).
 */
export function parseJsonObject(raw: string, label: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Invalid JSON: ${errorMessage(error)}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Invalid JSON: ${label} must be a JSON object.`);
  }
  return value as Record<string, unknown>;
}
