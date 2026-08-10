/**
 * The inline spec shapes and run target used across the agent-authoring surface:
 * self-contained `PresetSpec`/`SubAgentSpec` objects baked into a composition, and
 * the target of an authored streaming run.
 */
import type { AgentSummary } from '@tai42/api-client';

/** An inline `PresetSpec` (never a stored-name reference) baked into a composition. */
export interface InlinePresetSpec {
  readonly name: string;
  readonly description: string;
  readonly base_tool: string;
  readonly fixed_kwargs: Record<string, unknown>;
}

/** An inline `SubAgentSpec` (recursive-capable; this composer authors one level). */
export interface InlineSubAgentSpec {
  readonly name: string;
  readonly system_prompt: string;
  readonly tool_names: readonly string[];
  readonly presets: readonly InlinePresetSpec[];
  readonly subagents: readonly InlineSubAgentSpec[];
}

/** The target of an authored streaming run: the authored name + its base agent. */
export interface AuthoredRunTarget {
  readonly name: string;
  readonly baseAgent: AgentSummary;
}
