/**
 * `JsonTree` — a collapsible viewer for arbitrary JSON. Objects and arrays are
 * native `<details>`/`<summary>` disclosures (keyboard-accessible, no custom ARIA
 * needed); primitives render inline. All values render as React TEXT children, so
 * a payload containing markup (e.g. `<script>`) is escaped by React and never
 * interpreted — this component is never an HTML sink.
 */
import type { CSSProperties, ReactElement } from 'react';

export interface JsonTreeProps {
  readonly data: unknown;
  readonly defaultExpanded?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function primitiveText(value: unknown): string {
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

const rowStyle: CSSProperties = {
  font: 'var(--tai-text-sm) var(--tai-font-mono)',
  color: 'var(--tai-color-text)',
  padding: '0.05rem 0',
};

const keyStyle: CSSProperties = { color: 'var(--tai-color-text-muted)' };
const summaryStyle: CSSProperties = { ...rowStyle, cursor: 'pointer' };
const childrenStyle: CSSProperties = {
  paddingLeft: 'var(--tai-space-4)',
  borderLeft: '1px solid var(--tai-color-border)',
  marginLeft: 'var(--tai-space-1)',
};

interface NodeProps {
  readonly name?: string;
  readonly value: unknown;
  readonly defaultExpanded: boolean;
}

function primitiveColor(value: unknown): string {
  if (typeof value === 'string') return 'var(--tai-color-success)';
  if (typeof value === 'number' || typeof value === 'bigint') return 'var(--tai-color-primary)';
  if (typeof value === 'boolean' || value === null) return 'var(--tai-color-warning)';
  return 'var(--tai-color-text)';
}

function JsonNode({ name, value, defaultExpanded }: NodeProps): ReactElement {
  if (Array.isArray(value) || isRecord(value)) {
    const entries: [string, unknown][] = Array.isArray(value)
      ? value.map((item, index) => [String(index), item])
      : Object.entries(value);
    const summary = Array.isArray(value)
      ? `Array(${String(value.length)})`
      : `Object(${String(entries.length)})`;
    return (
      <details open={defaultExpanded} style={rowStyle}>
        <summary style={summaryStyle}>
          {name !== undefined ? <span style={keyStyle}>{name}: </span> : null}
          <span style={keyStyle}>{summary}</span>
        </summary>
        <div style={childrenStyle}>
          {entries.map(([childName, childValue]) => (
            <JsonNode
              key={childName}
              name={childName}
              value={childValue}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      </details>
    );
  }

  return (
    <div style={rowStyle}>
      {name !== undefined ? <span style={keyStyle}>{name}: </span> : null}
      <span style={{ color: primitiveColor(value) }}>{primitiveText(value)}</span>
    </div>
  );
}

export function JsonTree({ data, defaultExpanded = true }: JsonTreeProps) {
  return <JsonNode value={data} defaultExpanded={defaultExpanded} />;
}
