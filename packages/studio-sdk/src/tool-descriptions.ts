/**
 * The per-tool DECLARED description, shared by every tool picker that searches it: a
 * tool's description is its own declaration (`listToolTags`), drawn under its option
 * and matched by the picker's search alongside its label.
 */
import type { ToolTagEntry } from '@tai42/api-client';

/**
 * The raw-name → description map a tool picker reads (its `toolDescriptions`). Only
 * tools that declare a non-empty description appear; a tool that declares none is
 * simply absent (its option draws no description line).
 */
export function toolDescriptionsByName(
  tagEntries: readonly ToolTagEntry[],
): Readonly<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const entry of tagEntries) {
    if (entry.description !== null && entry.description !== '') {
      map[entry.name] = entry.description;
    }
  }
  return map;
}
