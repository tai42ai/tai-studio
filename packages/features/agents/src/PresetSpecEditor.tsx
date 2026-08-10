/**
 * The `presets` field editor: a picker over stored presets that expands the chosen
 * one into an inline `PresetSpec` object and appends it.
 */
import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';

import type { PresetRecord } from '@tai42/api-client';
import {
  Button,
  CloseIcon,
  ErrorState,
  Select,
  Spinner,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import type { InlinePresetSpec } from './authoring-types';

/**
 * The `presets` field editor: a picker over the NON-conflicted stored presets that
 * EXPANDS the chosen one into an inline `PresetSpec` OBJECT (via `getPreset`) and
 * appends it — never a stored-name reference. A quarantined (`conflicted`) record
 * is delete-only and is excluded by the caller, so it can never seed a composition.
 */
export function PresetSpecEditor({
  presetRecords,
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  readonly presetRecords: readonly PresetRecord[];
  readonly value: readonly InlinePresetSpec[];
  readonly onChange: (next: InlinePresetSpec[]) => void;
  readonly disabled?: boolean;
  readonly idPrefix: string;
}): ReactNode {
  const api = useApi();
  const [pick, setPick] = useState<string>('');

  const chosen = new Set(value.map((entry) => entry.name));
  const options = presetRecords
    .filter((record) => !chosen.has(record.name))
    .map((record) => ({ value: record.name, label: record.name }));

  const expand = useMutation({
    mutationFn: (name: string) => api.getPreset(name),
    onSuccess: (detail) => {
      onChange([
        ...value,
        {
          name: detail.name,
          description: detail.description,
          base_tool: detail.base_tool,
          fixed_kwargs: detail.fixed_kwargs,
        },
      ]);
      setPick('');
    },
  });

  return (
    <div className="tai-stack-2" data-testid={idPrefix}>
      {value.length > 0 ? (
        <div className="tai-stack-2">
          {value.map((entry) => (
            <span
              key={entry.name}
              className="tai-chip tai-chip-static"
              data-testid={`${idPrefix}-entry`}
            >
              <span className="tai-mono">{entry.name}</span>
              <span className="tai-muted">over {entry.base_tool}</span>
              <Button
                type="button"
                aria-label={`Remove preset ${entry.name}`}
                disabled={disabled}
                onClick={() => {
                  onChange(value.filter((e) => e.name !== entry.name));
                }}
              >
                <CloseIcon />
              </Button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="tai-row">
        <Select
          options={options}
          value={pick}
          onValueChange={setPick}
          placeholder="Pick a stored preset…"
          disabled={(disabled ?? false) || options.length === 0}
          aria-label="Preset to expand"
        />
        <Button
          type="button"
          disabled={(disabled ?? false) || pick === '' || expand.isPending}
          onClick={() => {
            expand.mutate(pick);
          }}
        >
          {expand.isPending ? <Spinner label="Expanding preset" /> : null}
          Add preset
        </Button>
      </div>
      {expand.isError ? <ErrorState message={errorMessage(expand.error)} /> : null}
    </div>
  );
}
