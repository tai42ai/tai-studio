/**
 * The items the agents explorer lists: every REGISTERED agent the caller may see, and
 * every AUTHORED agent — a default-list preset whose `base_tool` is a registered
 * agent's run tool (matched against the live registration names, never hardcoded).
 *
 * Each entry keeps its own kind, because the two act differently (a registered agent
 * runs through its own run tool; an authored agent runs through the authored-run door
 * and is managed on the presets page). Each is keyed by the TOOL NAME its overlay row
 * files: a registered agent's run tool is registered under its registration name, an
 * authored agent is its preset's tool — so both live in the one tool-organization tree.
 */
import type { AgentSummary, PresetRecord } from '@tai42/api-client';

export type AgentEntry =
  | { readonly kind: 'registered'; readonly toolName: string; readonly agent: AgentSummary }
  | {
      readonly kind: 'authored';
      readonly toolName: string;
      readonly preset: PresetRecord;
      readonly baseAgent: AgentSummary;
    };

/**
 * The registered agents (as the caller sees them) followed by the authored agents.
 * `allAgents` is the full registry the authored presets resolve their base agent
 * against; `visibleAgents` is the caller's projected subset. Linear in agents +
 * presets.
 */
export function agentEntries(
  visibleAgents: readonly AgentSummary[],
  allAgents: readonly AgentSummary[],
  presets: readonly PresetRecord[],
): AgentEntry[] {
  const agentByName = new Map(allAgents.map((agent) => [agent.name, agent]));
  const entries: AgentEntry[] = visibleAgents.map((agent) => ({
    kind: 'registered',
    toolName: agent.name,
    agent,
  }));
  for (const preset of presets) {
    const baseAgent = agentByName.get(preset.base_tool);
    if (baseAgent === undefined) continue;
    entries.push({ kind: 'authored', toolName: preset.name, preset, baseAgent });
  }
  return entries;
}

/** An entry's description: its agent's for a registered agent, its preset's for an authored one. */
export function entryDescription(entry: AgentEntry): string {
  return entry.kind === 'registered' ? entry.agent.description : entry.preset.description;
}
