/**
 * @tai42/feature-agents — the agents surface.
 *
 * `AgentsPage` is the shell-mounted page: the agent-authoring surface (Compose,
 * gated on an authorable agent existing) stacked atop one folder explorer of the
 * registered and authored agents (an authored agent is managed from the presets
 * page), and a streaming run view.
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
