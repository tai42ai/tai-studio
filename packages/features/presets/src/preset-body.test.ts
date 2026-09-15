import type { PresetExtensionElement, StateBinding } from '@tai42/api-client';
import type { JsonSchema } from '@tai42/studio-sdk';
import { describe, expect, it } from 'vitest';

import { buildCreatePresetBody, inputFieldNames, type PresetBodyDraft } from './preset-body';

describe('inputFieldNames', () => {
  it('lists the declared property names', () => {
    expect(inputFieldNames({ properties: { a: {}, b: {} } })).toEqual(['a', 'b']);
  });

  it('returns [] when properties is missing or not a plain object', () => {
    expect(inputFieldNames(undefined)).toEqual([]);
    expect(inputFieldNames({ properties: null })).toEqual([]);
    expect(inputFieldNames({ properties: [] })).toEqual([]);
  });
});

describe('buildCreatePresetBody', () => {
  const draft: PresetBodyDraft = {
    name: '  paris_weather  ',
    base: 'weather',
    description: '  Paris weather  ',
    fixedKwargs: { city: 'Paris' },
    combos: [],
    outputSchema: null,
    stateBinding: null,
  };

  it('trims name/description and carries base_tool + fixed_kwargs', () => {
    expect(buildCreatePresetBody(draft)).toEqual({
      name: 'paris_weather',
      base_tool: 'weather',
      description: 'Paris weather',
      fixed_kwargs: { city: 'Paris' },
    });
  });

  it('defaults base_tool to an empty string when no base is chosen', () => {
    expect(buildCreatePresetBody({ ...draft, base: null }).base_tool).toBe('');
  });

  it('omits extensions when empty and includes them when present', () => {
    expect(buildCreatePresetBody(draft)).not.toHaveProperty('extensions');
    const combos: PresetExtensionElement[][] = [[]];
    expect(buildCreatePresetBody({ ...draft, combos }).extensions).toEqual(combos);
  });

  it('includes output_schema and state_binding only when set', () => {
    const bare = buildCreatePresetBody(draft);
    expect(bare).not.toHaveProperty('output_schema');
    expect(bare).not.toHaveProperty('state_binding');

    const outputSchema: JsonSchema = { type: 'object', title: 'Out' };
    const stateBinding = {} as StateBinding;
    const full = buildCreatePresetBody({ ...draft, outputSchema, stateBinding });
    expect(full.output_schema).toEqual(outputSchema);
    expect(full.state_binding).toEqual(stateBinding);
  });
});
