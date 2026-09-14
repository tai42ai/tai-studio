import { describe, expect, it } from 'vitest';

import type { JsonSchema } from '@tai42/studio-sdk';

import { buildCreateBody, type ComposeBodySpec } from './compose-body';
import { authorableAgent } from './test-utils';

function spec(over: Partial<ComposeBodySpec> = {}): ComposeBodySpec {
  const baseAgent = authorableAgent();
  return {
    name: 'assistant',
    description: 'An assistant agent',
    baseAgent,
    baseSchema: baseAgent.input_schema,
    systemPrompt: '',
    toolNames: [],
    presets: [],
    subagents: [],
    extraSchema: null,
    extraSpec: {},
    hasResponseFormat: false,
    responseFormatSchema: null,
    checkedFallbacks: new Set<string>(),
    fallbackValue: {},
    ...over,
  };
}

describe('buildCreateBody', () => {
  it('trims name/description and uses the base agent registration name as base_tool', () => {
    const body = buildCreateBody(
      spec({
        name: '  assistant  ',
        description: '  An assistant  ',
        systemPrompt: 'You are helpful',
      }),
    );
    expect(body).toEqual({
      name: 'assistant',
      base_tool: 'authorable_agent',
      description: 'An assistant',
      fixed_kwargs: { system_prompt: 'You are helpful' },
    });
  });

  it('omits every spec field the operator left unset', () => {
    expect(buildCreateBody(spec()).fixed_kwargs).toEqual({});
  });

  it('bakes the picker spec fields the operator set', () => {
    const presets = [{ name: 'p', description: 'd', base_tool: 'echo', fixed_kwargs: {} }];
    const body = buildCreateBody(spec({ toolNames: ['echo'], presets }));
    expect(body.fixed_kwargs).toEqual({ tool_names: ['echo'], presets });
  });

  it('bakes the SchemaForm-authored strategy value when renderable and set', () => {
    const body = buildCreateBody(
      spec({
        extraSchema: { type: 'object', properties: { strategy: { type: 'string' } } },
        extraSpec: { strategy: 'greedy' },
      }),
    );
    expect(body.fixed_kwargs).toEqual({ strategy: 'greedy' });
  });

  it('bakes a set response_format schema, and nothing when none is set', () => {
    const schema: JsonSchema = { type: 'object', title: 'Report', properties: {} };
    expect(
      buildCreateBody(spec({ hasResponseFormat: true, responseFormatSchema: schema })).fixed_kwargs,
    ).toEqual({ response_format: schema });
    expect(
      buildCreateBody(spec({ hasResponseFormat: true, responseFormatSchema: null })).fixed_kwargs,
    ).toEqual({});
  });

  it('bakes exactly the CHECKED fallback fields, never an unchecked one', () => {
    const body = buildCreateBody(
      spec({
        checkedFallbacks: new Set(['user_message']),
        fallbackValue: { user_message: 'hi', ignored: 'x' },
      }),
    );
    expect(body.fixed_kwargs).toEqual({ user_message: 'hi' });
  });
});
