/**
 * `StructuredOutput` — the READ-ONLY output side of the schema-driven system:
 * it renders a tool's `structured_content` THROUGH its declared MCP
 * `output_schema` (property titles + declared order), and falls back to a raw
 * `JsonTree` when the tool declares no output schema (or the content does not
 * match an object schema).
 *
 * Reusable by any feature/plugin run surface. SAFETY: every schema-derived and
 * content-derived value renders as React TEXT (through `JsonTree` / plain text
 * nodes), so a payload carrying markup is escaped, never interpreted.
 */
import type { CSSProperties, ReactNode } from 'react';

import { JsonTree } from '../components/json-tree';
import { resolveRef } from '../schema-form/resolve';
import type { JsonSchema } from '../schema-form/types';

export interface StructuredOutputProps {
  /** The tool's declared MCP output schema, if any. */
  readonly schema?: JsonSchema;
  /** The `structured_content` the tool returned. */
  readonly content: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isObjectSchema(
  schema: JsonSchema | undefined,
  root: JsonSchema | undefined,
): schema is JsonSchema {
  if (!schema || !root) return false;
  const resolved = schema.$ref ? resolveRef(schema, root) : schema;
  const type = resolved.type;
  const isObject = type === 'object' || (Array.isArray(type) && type.includes('object'));
  return isObject && isRecord(resolved.properties);
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
  paddingBottom: 'var(--tai-space-2)',
};

const labelStyle: CSSProperties = {
  font: 'var(--tai-text-sm) var(--tai-font-sans)',
  fontWeight: 600,
  color: 'var(--tai-color-text-muted)',
};

const stackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
};

/**
 * Render `content` through `schema`. An object schema drives a labeled,
 * ordered field list (each value shown with a `JsonTree`); anything else — no
 * schema, a non-object schema, or content that is not a matching object —
 * renders the raw content through a single `JsonTree`.
 */
export function StructuredOutput({ schema, content }: StructuredOutputProps): ReactNode {
  if (!isObjectSchema(schema, schema) || !isRecord(content)) {
    return (
      <div data-testid="structured-output-raw">
        <JsonTree data={content} defaultExpanded />
      </div>
    );
  }

  // `schema` is narrowed to a defined object schema here.
  const resolved = schema.$ref ? resolveRef(schema, schema) : schema;
  // `isObjectSchema` guarantees `properties` is a record; the fallback only
  // satisfies the optional type.
  const properties = resolved.properties ?? {};

  return (
    <div style={stackStyle} data-testid="structured-output">
      {Object.entries(properties).map(([key, propSchema]) => {
        const field = propSchema.$ref ? resolveRef(propSchema, schema) : propSchema;
        return (
          <div key={key} style={rowStyle}>
            <span style={labelStyle}>{field.title ?? key}</span>
            <JsonTree data={content[key]} defaultExpanded />
          </div>
        );
      })}
    </div>
  );
}
