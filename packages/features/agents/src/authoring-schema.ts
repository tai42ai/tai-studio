/**
 * The composable spec vocabulary and the schema accessor shared across the
 * agent-authoring surface: the curated spec field sets (an authored agent's fixed
 * IDENTITY, excluded from the run form) and the `properties` accessor over an
 * agent's `ToolInput` JSON schema.
 */
import type { JsonSchema } from '@tai42/studio-sdk';

// The four composable spec fields authored with dedicated pickers.
export const RICH_SPEC_FIELDS = ['system_prompt', 'tool_names', 'presets', 'subagents'] as const;
// The composable spec field authored as a raw JSON Schema (a `response_format` value
// IS a schema, which `SchemaForm` cannot author — it routes to `SchemaEditor`).
export const RESPONSE_FORMAT_FIELD = 'response_format';
// The remaining composable spec fields authored via `SchemaForm` when renderable.
export const SCHEMA_FORM_EXTRA_FIELDS = ['strategy'] as const;
// The full composable spec field set — an authored agent's fixed IDENTITY. The
// streaming-run form excludes ALL of these (a run supplies only the query/user
// input); they are never a run-time input control.
export const ALL_SPEC_FIELDS: readonly string[] = [
  ...RICH_SPEC_FIELDS,
  ...SCHEMA_FORM_EXTRA_FIELDS,
  RESPONSE_FORMAT_FIELD,
];

/** The declared properties of an agent's `ToolInput` JSON schema. */
export function schemaProps(schema: JsonSchema): Readonly<Record<string, JsonSchema>> {
  return schema.properties ?? {};
}
