/**
 * The pure assembly of a compose dialog's `CreatePresetBody`: `fixed_kwargs` carries
 * only the spec fields the operator actually set (an unset field stays a run-time
 * input, never baked). Pure over its inputs and unit-testable against a fixture.
 */
import type { AgentSummary, CreatePresetBody } from '@tai42/api-client';
import type { JsonSchema } from '@tai42/studio-sdk';

import { hasField, RESPONSE_FORMAT_FIELD, SCHEMA_FORM_EXTRA_FIELDS } from './authoring-schema';
import type { InlinePresetSpec, InlineSubAgentSpec } from './authoring-types';

/** Every input the compose dialog bakes into a create body. */
export interface ComposeBodySpec {
  readonly name: string;
  readonly description: string;
  readonly baseAgent: AgentSummary;
  readonly baseSchema: JsonSchema;
  readonly systemPrompt: string;
  readonly toolNames: string[];
  readonly presets: InlinePresetSpec[];
  readonly subagents: InlineSubAgentSpec[];
  readonly extraSchema: JsonSchema | null;
  readonly extraSpec: unknown;
  readonly hasResponseFormat: boolean;
  readonly responseFormatSchema: JsonSchema | null;
  readonly checkedFallbacks: ReadonlySet<string>;
  readonly fallbackValue: unknown;
}

/** The four dedicated-picker spec fields, baked only when the agent declares them and the operator set one. */
function richSpecKwargs(spec: ComposeBodySpec): Record<string, unknown> {
  const { baseSchema, systemPrompt, toolNames, presets, subagents } = spec;
  const fixed: Record<string, unknown> = {};
  if (hasField(baseSchema, 'system_prompt') && systemPrompt.trim() !== '') {
    fixed.system_prompt = systemPrompt;
  }
  if (hasField(baseSchema, 'tool_names') && toolNames.length > 0) fixed.tool_names = toolNames;
  if (hasField(baseSchema, 'presets') && presets.length > 0) fixed.presets = presets;
  if (hasField(baseSchema, 'subagents') && subagents.length > 0) fixed.subagents = subagents;
  return fixed;
}

/** The `SchemaForm`-authored extra spec fields (`strategy`): bake only the non-null values set. */
function extraSpecKwargs(spec: ComposeBodySpec): Record<string, unknown> {
  const { extraSchema, extraSpec } = spec;
  if (!extraSchema || extraSpec === null || typeof extraSpec !== 'object') return {};
  const fixed: Record<string, unknown> = {};
  for (const field of SCHEMA_FORM_EXTRA_FIELDS) {
    const val = (extraSpec as Record<string, unknown>)[field];
    if (val !== undefined && val !== null) fixed[field] = val;
  }
  return fixed;
}

/** The raw-JSON-Schema response format, baked only when the agent advertises it and one is set. */
function responseFormatKwargs(spec: ComposeBodySpec): Record<string, unknown> {
  if (!spec.hasResponseFormat || spec.responseFormatSchema === null) return {};
  return { [RESPONSE_FORMAT_FIELD]: spec.responseFormatSchema };
}

/** The opt-in fallback fields: bake exactly the CHECKED non-spec knobs' values. */
function fallbackKwargs(spec: ComposeBodySpec): Record<string, unknown> {
  const { checkedFallbacks, fallbackValue } = spec;
  if (fallbackValue === null || typeof fallbackValue !== 'object') return {};
  const fixed: Record<string, unknown> = {};
  for (const field of checkedFallbacks) {
    const val = (fallbackValue as Record<string, unknown>)[field];
    if (val !== undefined) fixed[field] = val;
  }
  return fixed;
}

/** Assemble `fixed_kwargs` from only the spec fields the operator actually set. */
export function buildFixedKwargs(spec: ComposeBodySpec): Record<string, unknown> {
  return {
    ...richSpecKwargs(spec),
    ...extraSpecKwargs(spec),
    ...responseFormatKwargs(spec),
    ...fallbackKwargs(spec),
  };
}

/**
 * Build the full `createPreset` body from a compose spec. The base tool is the agent's
 * run tool, registered under the agent's REGISTRATION name (which can differ from its
 * `tool_name`), so authoring works regardless of whether the two coincide.
 */
export function buildCreateBody(spec: ComposeBodySpec): CreatePresetBody {
  return {
    name: spec.name.trim(),
    base_tool: spec.baseAgent.name,
    description: spec.description.trim(),
    fixed_kwargs: buildFixedKwargs(spec),
  };
}
