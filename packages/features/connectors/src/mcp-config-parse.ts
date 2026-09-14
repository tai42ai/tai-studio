/** Entry/schema shaping for the MCP config editor: loose-shape readers plus the
 *  JSON-buffer parse both config views persist through. */
import { errorMessage } from '@tai42/studio-sdk';
import type { JsonSchema } from '@tai42/studio-sdk';
import type { ConnectorRef } from '@tai42/api-client';

/** A plain object view of one entry, tolerating a loose/absent shape. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** The string members of a possibly-absent, possibly-loose array field. */
export function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** The connector back-reference on a managed entry, or `null` for a hand-authored one. */
export function connectorRefOf(entry: unknown): ConnectorRef | null {
  const managed = asRecord(entry).managed;
  const ref = asRecord(managed);
  if (
    typeof ref.connection_id === 'string' &&
    typeof ref.provider_id === 'string' &&
    typeof ref.sub_service === 'string'
  ) {
    return {
      connection_id: ref.connection_id,
      provider_id: ref.provider_id,
      sub_service: ref.sub_service,
    };
  }
  return null;
}

/** The base tool name a composed `tool:ext[:ext]` token was built from. */
export function baseToolOf(token: string): string {
  const separator = token.indexOf(':');
  return separator === -1 ? token : token.slice(0, separator);
}

export const STRIPPED_FIELDS = ['include', 'exclude', 'managed'] as const;

/**
 * A shallow clone of an object schema with `fields` removed from `properties` and
 * `required`, so the schema-driven form renders the transport config only and the
 * tool lists / provenance are handled by dedicated surfaces (rather than as raw
 * free-text string arrays). Non-object schemas pass through untouched.
 */
export function stripSchemaFields(schema: JsonSchema, fields: readonly string[]): JsonSchema {
  const record = asRecord(schema);
  const properties = record.properties;
  if (typeof properties !== 'object' || properties === null) return schema;
  const nextProperties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties as Record<string, unknown>)) {
    if (!fields.includes(key)) nextProperties[key] = value;
  }
  const next: Record<string, unknown> = { ...record, properties: nextProperties };
  if (Array.isArray(record.required)) {
    next.required = record.required.filter(
      (key) => typeof key !== 'string' || !fields.includes(key),
    );
  }
  return next;
}

/** Parse the raw JSON buffer into an MCP array, raising a loud message on any
 *  problem. Shared by the JSON-view save and the JSON→form switch. */
export function parseEntries(text: string): { entries: unknown[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: `Invalid JSON: ${errorMessage(error)}` };
  }
  if (!Array.isArray(parsed)) {
    return { error: 'The MCP config must be a JSON array of server entries.' };
  }
  return { entries: parsed };
}
