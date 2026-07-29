/**
 * Tag rendering + authoring for the presets surface. Both controls are the shared
 * SDK components; this module re-exports them so the presets feature keeps its
 * local `./tags` import path while the single canonical implementation lives in the
 * SDK (also used by the agents feature and the version-history panel).
 */
export { TagChips, TagsInput } from '@tai42/studio-sdk';
