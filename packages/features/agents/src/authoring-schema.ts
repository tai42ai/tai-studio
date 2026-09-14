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

/** Whether a schema node declares something the auto-form can actually render. */
export function isRenderable(node: JsonSchema): boolean {
  return (
    node.type !== undefined ||
    node.enum !== undefined ||
    node.anyOf !== undefined ||
    node.oneOf !== undefined ||
    node.$ref !== undefined
  );
}

/** Whether an agent schema declares the named top-level property. */
export function hasField(schema: JsonSchema, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(schemaProps(schema), field);
}

/**
 * Build the sub-schema of the `SchemaForm`-authored extra spec fields (`strategy`)
 * the agent declares AND the auto-form can render. A field the agent leaves untyped
 * (e.g. a permissive `{default: null}`) is not renderable, so it is omitted rather
 * than shown as a broken "unsupported field" control — it simply stays un-baked (a
 * valid, optional choice), and the server is the authority. `response_format` is NOT
 * here: it is a raw JSON Schema authored by the dedicated `SchemaEditor` instead.
 */
export function extraSpecSchema(agentSchema: JsonSchema): JsonSchema | null {
  const props = schemaProps(agentSchema);
  const picked: Record<string, JsonSchema> = {};
  for (const field of SCHEMA_FORM_EXTRA_FIELDS) {
    const node = props[field];
    if (node !== undefined && isRenderable(node)) picked[field] = node;
  }
  if (Object.keys(picked).length === 0) return null;
  // Spread the base schema so its `$defs` document rides along — a picked field may
  // be (or contain) a `$ref` the form/seed resolve against the root. `required` is
  // reset: these extra fields are optional (baked only when set), and the base's own
  // required list must not ride along and demand unrendered fields.
  return { ...agentSchema, type: 'object', properties: picked, required: [] };
}

/**
 * The base agent's renderable top-level fields that are NOT part of the curated
 * spec vocabulary (`ALL_SPEC_FIELDS`) — the arbitrary tuning knobs a `spec_runnable`
 * agent may declare (e.g. a bounded step budget). Each is bakeable server-side, so
 * the compose dialog offers them as an OPT-IN checklist: an unchecked field is
 * never baked and stays a run-time input; a checked one is baked into the agent's
 * fixed identity. A field the auto-form cannot render is omitted (the server stays
 * the authority), mirroring `extraSpecSchema`.
 */
export function fallbackFieldNames(agentSchema: JsonSchema): string[] {
  return Object.entries(schemaProps(agentSchema))
    .filter(([key, node]) => !ALL_SPEC_FIELDS.includes(key) && isRenderable(node))
    .map(([key]) => key);
}

/**
 * Build the object sub-schema over the CHECKED fallback fields (all required).
 * Spreads the base schema so its `$defs` document rides along — a picked field may
 * be a `$ref` (or contain one), which the form/validator resolve against the root.
 */
export function subsetSchema(
  agentSchema: JsonSchema,
  checked: ReadonlySet<string>,
): JsonSchema | null {
  const picked: Record<string, JsonSchema> = {};
  for (const [key, node] of Object.entries(schemaProps(agentSchema))) {
    if (checked.has(key)) picked[key] = node;
  }
  if (Object.keys(picked).length === 0) return null;
  return { ...agentSchema, type: 'object', properties: picked, required: Object.keys(picked) };
}
