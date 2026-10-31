import type { PresetRecord } from '@tai42/api-client';
import type { ToolListQuery } from '@tai42/studio-sdk';
import { Button, Card, Field, Textarea, TextInput } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import type { InlineSubAgentSpec } from './authoring-types';
import { MultiToolPicker } from './MultiToolPicker';
import { PresetSpecEditor } from './PresetSpecEditor';

/** Push a following flex item to the far edge of its `.tai-row`. */
const spacerStyle = { marginLeft: 'auto' };

/** One inline sub-agent editor card (name + prompt + tools + presets). */
export function SubAgentCard({
  spec,
  toolsQuery,
  tagsByTool,
  displayNames,
  toolDescriptions,
  presetRecords,
  onChange,
  onRemove,
  disabled,
  index,
}: {
  readonly spec: InlineSubAgentSpec;
  readonly toolsQuery: ToolListQuery;
  readonly tagsByTool?: Readonly<Record<string, readonly string[]>>;
  readonly displayNames?: Readonly<Record<string, string>>;
  readonly toolDescriptions?: Readonly<Record<string, string>>;
  readonly presetRecords: readonly PresetRecord[];
  readonly onChange: (next: InlineSubAgentSpec) => void;
  readonly onRemove: () => void;
  readonly disabled?: boolean;
  readonly index: number;
}): ReactNode {
  const idPrefix = `subagent-${String(index)}`;
  return (
    <Card>
      <div className="tai-stack-2" data-testid={idPrefix}>
        <div className="tai-row">
          <strong>Sub-agent {index + 1}</strong>
          <div style={spacerStyle} />
          <Button
            type="button"
            variant="ghost"
            aria-label={`Remove sub-agent ${String(index + 1)}`}
            disabled={disabled}
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
        <Field label="Name">
          <TextInput
            value={spec.name}
            disabled={disabled}
            onChange={(event) => {
              onChange({ ...spec, name: event.target.value });
            }}
            placeholder="researcher"
          />
        </Field>
        <Field label="System prompt">
          <Textarea
            value={spec.system_prompt}
            disabled={disabled}
            onChange={(event) => {
              onChange({ ...spec, system_prompt: event.target.value });
            }}
            placeholder="Research the question."
          />
        </Field>
        <Field label="Tools" group>
          <MultiToolPicker
            query={toolsQuery}
            tagsByTool={tagsByTool}
            displayNames={displayNames}
            toolDescriptions={toolDescriptions}
            value={spec.tool_names}
            onChange={(next) => {
              onChange({ ...spec, tool_names: next });
            }}
            disabled={disabled}
            idPrefix={`${idPrefix}-tools`}
          />
        </Field>
        <Field label="Presets" group>
          <PresetSpecEditor
            presetRecords={presetRecords}
            value={spec.presets}
            onChange={(next) => {
              onChange({ ...spec, presets: next });
            }}
            disabled={disabled}
            idPrefix={`${idPrefix}-presets`}
          />
        </Field>
      </div>
    </Card>
  );
}
