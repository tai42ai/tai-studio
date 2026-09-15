/**
 * @tai42/feature-agents — the agents surface.
 *
 * `AgentsPage` is the shell-mounted page: the agent-authoring surface (compose
 * and run authored agents, managing them from the presets page — gated on an
 * authorable agent existing) stacked atop a list of registered agents and a
 * streaming run view.
 * The streaming hooks, the shared run view, the authoring surface, and the
 * timeline are exported for direct unit testing.
 */
export { AgentsPage } from './agents';
export type { AuthoredRunTarget, InlinePresetSpec, InlineSubAgentSpec } from './authoring';
export { AuthoredRunView, AuthoringSection, ComposeAgentDialog } from './authoring';
export { buildTimeline } from './build-timeline';
export type { AgentRun, StreamOpener } from './run-view';
export { StreamRunView, useAgentRun, useAuthoredAgentRun, useStreamRun } from './run-view';
export { Timeline } from './Timeline';
export type { TimelineFold, TimelineItem } from './timeline-model';
