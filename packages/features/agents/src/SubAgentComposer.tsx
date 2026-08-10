/** The `subagents` field editor: a list of inline sub-agent cards with add/remove. */
import type { ReactNode } from 'react';

import type { PresetRecord } from '@tai42/api-client';
import { Button } from '@tai42/studio-sdk';

import type { InlineSubAgentSpec } from './authoring-types';
import { SubAgentCard } from './SubAgentCard';

export function SubAgentComposer({
  toolNames,
  tagsByTool,
  presetRecords,
  value,
  onChange,
  disabled,
}: {
  readonly toolNames: readonly string[];
  readonly tagsByTool?: Readonly<Record<string, readonly string[]>>;
  readonly presetRecords: readonly PresetRecord[];
  readonly value: readonly InlineSubAgentSpec[];
  readonly onChange: (next: InlineSubAgentSpec[]) => void;
  readonly disabled?: boolean;
}): ReactNode {
  return (
    <div className="tai-stack-2" data-testid="subagent-composer">
      {value.map((spec, index) => (
        <SubAgentCard
          // Position-keyed: entries are only appended/removed as whole cards.
          key={index}
          spec={spec}
          index={index}
          toolNames={toolNames}
          tagsByTool={tagsByTool}
          presetRecords={presetRecords}
          disabled={disabled}
          onChange={(next) => {
            onChange(value.map((entry, i) => (i === index ? next : entry)));
          }}
          onRemove={() => {
            onChange(value.filter((_, i) => i !== index));
          }}
        />
      ))}
      <div>
        <Button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange([
              ...value,
              { name: '', system_prompt: '', tool_names: [], presets: [], subagents: [] },
            ]);
          }}
        >
          Add sub-agent
        </Button>
      </div>
    </div>
  );
}
