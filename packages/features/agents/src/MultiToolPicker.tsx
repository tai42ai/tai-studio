import type { ReactNode } from 'react';

import { Button, CloseIcon, ToolPicker } from '@tai42/studio-sdk';

/**
 * A multi-select over tool names, built by REUSING the shared single-select
 * `ToolPicker` as an "add" control plus a removable chip list — so `tool_names`
 * composes without a second picker implementation. Only registered tools are
 * offered (an unknown name cannot be added here; the server stays the loud backstop).
 */
export function MultiToolPicker({
  toolNames,
  tagsByTool,
  displayNames,
  value,
  onChange,
  disabled,
  idPrefix,
  addLabel = 'Add a tool',
}: {
  readonly toolNames: readonly string[];
  readonly tagsByTool?: Readonly<Record<string, readonly string[]>>;
  readonly displayNames?: Readonly<Record<string, string>>;
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly disabled?: boolean;
  readonly idPrefix: string;
  readonly addLabel?: string;
}): ReactNode {
  return (
    <div className="tai-stack-2" data-testid={idPrefix}>
      {value.length > 0 ? (
        <div className="tai-row">
          {value.map((name) => {
            // Compact surface: a chip shows the BARE display name when one maps the
            // tool (in the label font, like the human names on the tools list), else
            // the raw name in monospace. The remove control keys off the raw name.
            const display = displayNames?.[name];
            const mapped = display !== undefined && display !== '' && display !== name;
            return (
              <span key={name} className="tai-chip tai-chip-static">
                <span className={mapped ? undefined : 'tai-mono'}>{mapped ? display : name}</span>
                <Button
                  type="button"
                  aria-label={`Remove tool ${name}`}
                  disabled={disabled}
                  onClick={() => {
                    onChange(value.filter((n) => n !== name));
                  }}
                >
                  <CloseIcon />
                </Button>
              </span>
            );
          })}
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
        displayNames={displayNames}
        idPrefix={`${idPrefix}-add`}
        label={addLabel}
        placeholder="Add a tool…"
      />
    </div>
  );
}
