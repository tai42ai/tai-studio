/**
 * Read a `.json` document off a file input as a JSON object, or throw a loud, human
 * message. Shared by the states and state-template upload doors.
 */
import { errorMessage } from '@tai42/studio-sdk';

/** Parse `file`'s text as a JSON object; throws a human message on bad JSON or a
 * non-object value. */
export async function readJsonObjectFile(file: File): Promise<Record<string, unknown>> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`This file is not valid JSON: ${errorMessage(error)}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('This file must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}
