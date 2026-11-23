/**
 * Which top-level fields a form value change touched — the fields whose declared
 * reaction a change triggers.
 */
import { isRecord } from '../guards';

/** The top-level keys whose value differs between the previous and next form value; a
 * value that is not an object reads as empty. */
export function changedTopLevelKeys(previous: unknown, next: unknown): string[] {
  const before = isRecord(previous) ? previous : {};
  const after = isRecord(next) ? next : {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => before[key] !== after[key]);
}
