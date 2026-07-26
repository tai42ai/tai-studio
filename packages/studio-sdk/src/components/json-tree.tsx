/**
 * `JsonTree` — a collapsible viewer for arbitrary JSON on the design system's
 * terminal ground (`tai-code-block`, which also supplies the mono face, the code
 * size and the line rhythm every row inherits). Objects and arrays are native
 * `<details>`/`<summary>` disclosures (keyboard-accessible, no custom ARIA
 * needed); primitives render inline, tinted by the `tai-syntax-*` class for their
 * type so a value's kind is readable at a glance. All values render as React TEXT
 * children, so a payload containing markup (e.g. `<script>`) is escaped by React
 * and never interpreted — this component is never an HTML sink.
 *
 * The pane IS the scrolling box, so it carries the region attributes itself
 * rather than sitting inside a `ScrollRegion` wrapper that would add a second
 * scroller: a deeply indented value makes it a named keyboard target, a shallow
 * one leaves it an ordinary block.
 */
import { useRef } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import { useOverflowRegion } from './scroll-region';

export interface JsonTreeProps {
  readonly data: unknown;
  readonly defaultExpanded?: boolean;
  /** The region's accessible name, applied only while the pane actually scrolls. */
  readonly label?: string;
}

/** The region's name when the caller supplies none. */
const DEFAULT_LABEL = 'JSON';

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

/**
 * One nesting level's indent: the child block insets and draws its own guide
 * rail. The depth is expressed by the DOM nesting, so each level repeats this
 * single step rather than computing an absolute offset.
 */
const childrenStyle: CSSProperties = {
  paddingLeft: 'var(--tai-space-4)',
  marginLeft: 'var(--tai-space-1)',
  borderLeft: '1px solid var(--tai-color-decor)',
};

/** A `<summary>` is a click target; browsers do not style it as one by default. */
const summaryStyle: CSSProperties = { cursor: 'pointer' };

interface NodeProps {
  readonly name?: string;
  readonly value: unknown;
  readonly defaultExpanded: boolean;
}

/** The syntax class for a primitive's type; anything outside JSON reads as muted. */
function primitiveClass(value: unknown): string {
  if (typeof value === 'string') return 'tai-syntax-string';
  if (typeof value === 'number' || typeof value === 'bigint') return 'tai-syntax-number';
  if (typeof value === 'boolean') return 'tai-syntax-bool';
  if (value === null || value === undefined) return 'tai-syntax-null';
  return 'tai-muted';
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
      <details open={defaultExpanded}>
        <summary style={summaryStyle}>
          {name !== undefined ? <span className="tai-syntax-key">{name}: </span> : null}
          <span className="tai-muted">{summary}</span>
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
    <div>
      {name !== undefined ? <span className="tai-syntax-key">{name}: </span> : null}
      <span className={primitiveClass(value)}>{primitiveText(value)}</span>
    </div>
  );
}

export function JsonTree({ data, defaultExpanded = true, label }: JsonTreeProps) {
  const paneRef = useRef<HTMLDivElement>(null);
  const region = useOverflowRegion(paneRef, label ?? DEFAULT_LABEL, data);

  return (
    <div ref={paneRef} className="tai-code-block" {...region}>
      <JsonNode value={data} defaultExpanded={defaultExpanded} />
    </div>
  );
}
