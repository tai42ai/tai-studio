/**
 * The AGENT AUTHORING surface entry point. An authored agent is a PRESET baked over
 * a `spec_runnable` agent's tool — so this whole surface reuses the preset spine:
 * `createPreset` plus the presets page for versioning, rollback, and delete. There
 * is NO authoring store and NO new authoring client method.
 *
 * This module aggregates the surface's public pieces from their per-component
 * siblings: the gated `AuthoringSection`, the `ComposeAgentDialog`, and the
 * `AuthoredRunView`, plus the inline spec shapes and run target.
 */
export { AuthoringSection } from './AuthoringSection';
export { ComposeAgentDialog } from './ComposeAgentDialog';
export { AuthoredRunView } from './AuthoredRunView';
export type { AuthoredRunTarget, InlinePresetSpec, InlineSubAgentSpec } from './authoring-types';
