/**
 * @tai42/feature-presets — the presets surface. A master/detail page over the
 * single-tier presets API: a management table of the skeleton's store-backed
 * presets (including conflicted rows) with a create dialog (base-tool pick →
 * JSON fixed-kwargs → extensions), and a detail pane with the active baked kwargs,
 * version history + rollback, save-version, and delete. Imports only
 * @tai42/studio-sdk, @tai42/api-client, and TanStack Query.
 */
export { PresetsPage } from './PresetsPage';
