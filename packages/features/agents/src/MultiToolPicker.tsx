import type { ReactNode } from 'react';

import { Button, ToolPicker } from '@tai42/studio-sdk';

import { chipStyle, monoStyle, rowStyle, smallStackStyle } from './authoring-styles';

/**
 * A multi-select over tool names, built by REUSING the shared single-select
 * `ToolPicker` as an "add" control plus a removable chip list — so `tool_names`
 * composes without a second picker implementation. Only registered tools are
 * offered (an unknown name cannot be added here; the server stays the loud backstop).
 */
export function MultiToolPicker({
  toolNames,
  tagsByTool,
  value,
  onChange,
  disabled,
  idPrefix,
  addLabel = 'Add a tool',
}: {
  readonly toolNames: readonly string[];
  readonly tagsByTool?: Readonly<Record<string, readonly string[]>>;
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly disabled?: boolean;
  readonly idPrefix: string;
  readonly addLabel?: string;
}): ReactNode {
  return (
    <div style={smallStackStyle} data-testid={idPrefix}>
      {value.length > 0 ? (
        <div style={{ ...rowStyle, flexWrap: 'wrap' }}>
          {value.map((name) => (
            <span key={name} style={chipStyle}>
              <span style={monoStyle}>{name}</span>
              <Button
                type="button"
                aria-label={`Remove tool ${name}`}
                disabled={disabled}
                onClick={() => {
                  onChange(value.filter((n) => n !== name));
                }}
              >
                ×
              </Button>
            </span>
          ))}
        </div>
      ) : null}
      <ToolPicker
        toolNames={toolNames}
        value={null}
        onChange={(name) => {
          if (!value.includes(name)) onChange([...value, name]);
        }}
        disabled={disabled}
        excludeNames={value}
        tagsByTool={tagsByTool}
        idPrefix={`${idPrefix}-add`}
        label={addLabel}
        placeholder="Add a tool…"
      />
    </div>
  );
}
