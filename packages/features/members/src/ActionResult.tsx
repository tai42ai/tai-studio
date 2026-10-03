/**
 * The READ-ONLY view of a member action's result, driven entirely by the action's
 * declared `result_schema` — no provider field is named here.
 *
 * `SchemaForm` is an INPUT-only control (it has no display mode), so it is never used
 * for the result. Each declared field is resolved against the schema and rendered by
 * its type: a STRING field (a one-time invite link or sign-in token the provider
 * mints) goes through {@link CopyField} with a shown-once caption — the token is never
 * re-fetchable, so it must be copied now; every other field renders as a labelled
 * read-only readback (a nested object/array through {@link JsonTree}). An action that
 * declares no result field (a remove / role change) shows a plain completion line.
 *
 * SAFETY: every schema- and value-derived string renders as React TEXT through the
 * design-system components; no field name or value is ever an HTML sink.
 */
import { CopyField, type JsonSchema, JsonTree, resolveRef } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

/** Shown on every result string: the invoke is not re-fetchable, so copy it now. */
const SHOWN_ONCE = 'Shown once — copy it now; it cannot be retrieved again.';

const completionStyle: CSSProperties = {
  margin: 0,
  color: 'var(--tai-color-text-muted)',
};

const fieldLabelStyle: CSSProperties = {
  display: 'block',
  marginBottom: 'var(--tai-space-1)',
};

const scalarValueStyle: CSSProperties = {
  wordBreak: 'break-word',
};

/** Whether a resolved schema node is a plain string field. */
function isStringField(schema: JsonSchema): boolean {
  const { type } = schema;
  return type === 'string' || (Array.isArray(type) && type.includes('string'));
}

/** A scalar value as display text: primitives direct, anything else as JSON. */
function toText(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'bigint':
      return String(value);
    case 'boolean':
      return value ? 'Yes' : 'No';
    default:
      return JSON.stringify(value);
  }
}

/** A non-string field's value rendered read-only: scalars as text, objects as a tree. */
function ReadbackValue({
  label,
  value,
}: {
  readonly label: string;
  readonly value: unknown;
}): ReactNode {
  if (value === undefined || value === null || value === '') {
    return <span style={scalarValueStyle}>—</span>;
  }
  if (typeof value === 'object') {
    return <JsonTree data={value} defaultExpanded label={label} />;
  }
  return <span style={scalarValueStyle}>{toText(value)}</span>;
}

export function ActionResult({
  schema,
  value,
}: {
  readonly schema: JsonSchema;
  readonly value: Record<string, unknown>;
}): ReactNode {
  const properties = schema.properties ?? {};
  const entries = Object.entries(properties);
  if (entries.length === 0) {
    return (
      <p style={completionStyle} data-testid="member-action-result">
        The action completed.
      </p>
    );
  }
  return (
    <div className="tai-stack tai-stack-3" data-testid="member-action-result">
      {entries.map(([key, propSchema]) => {
        const field = resolveRef(propSchema, schema);
        const label = typeof field.title === 'string' ? field.title : key;
        const raw = value[key];
        if (isStringField(field) && typeof raw === 'string') {
          return (
            <CopyField
              key={key}
              idPrefix={`member-action-result-${key}`}
              label={label}
              value={raw}
              caption={SHOWN_ONCE}
            />
          );
        }
        return (
          <div key={key} className="tai-field">
            <span className="tai-field-label" style={fieldLabelStyle}>
              {label}
            </span>
            <ReadbackValue label={label} value={raw} />
          </div>
        );
      })}
    </div>
  );
}
