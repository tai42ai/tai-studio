/** Preset CRUD, versioning and validation sub-client. */
import * as s from '../schemas';
import { encodeSegment } from '../http';
import type { Transport } from './transport';

/**
 * Body for creating a preset (POST `/api/presets`). `description` is the bound
 * tool's LLM-facing docstring — REQUIRED non-empty on every create path (the door
 * rejects an empty one with a 422); it is never the tool_meta `display_name`.
 * `extensions` is the combos list — the create flow OMITS it when there are no
 * combos (the route rejects an explicit `extensions: []`). `output_schema` is the
 * optional author-set output JSON Schema; `input_schema` is the optional author-set
 * input JSON Schema, read by the router as a top-level version field. Each combo
 * element is a bare extension name or a `{ name, config }` mapping. Categorization
 * tags live in the tool_meta overlay, written after a successful create — never in
 * this body.
 */
export interface CreatePresetBody {
  readonly name: string;
  readonly base_tool: string;
  readonly description: string;
  readonly fixed_kwargs?: Record<string, unknown>;
  readonly extensions?: readonly s.PresetExtensionElement[][];
  readonly output_schema?: Record<string, unknown> | null;
  readonly input_schema?: Record<string, unknown> | null;
  // The optional door-layer state binding applied around every run of this preset.
  readonly state_binding?: s.StateBinding | null;
}

/**
 * Body for saving a new preset version (POST `/api/presets/{name}/versions`). At
 * least one field must be provided (an empty body is a loud 400). Each field's
 * sentinel is uniform: omitted carries the active version's value forward; an
 * explicit `[]` clears `extensions`, and an explicit `null` clears `output_schema`
 * or `input_schema`. `input_schema` is the optional author-set input JSON Schema and
 * follows the same carry-forward sentinel as `output_schema`. `state_binding` is the
 * optional door-layer binding and follows the same sentinel: omitted carries the active
 * one forward, an explicit `null` clears it. `description` carries forward when omitted;
 * an explicit non-empty string sets it (the API rejects an explicit empty one).
 * Categorization tags are not a version field — they live in the tool_meta overlay.
 */
export interface SavePresetVersionBody {
  readonly fixed_kwargs?: Record<string, unknown>;
  readonly description?: string;
  readonly extensions?: readonly s.PresetExtensionElement[][];
  readonly output_schema?: Record<string, unknown> | null;
  readonly input_schema?: Record<string, unknown> | null;
  readonly state_binding?: s.StateBinding | null;
}

/**
 * Body for the dry-run validate door (POST `/api/presets/validate`). `name` is
 * required and selects the verdict mode server-side: CREATE when no preset named
 * `name` exists (then `base_tool` is required), VERSION when one does (the version
 * fields are read under save-version semantics). The draft is sent exactly as the
 * matching write would send it.
 */
export interface ValidatePresetBody {
  readonly name: string;
  readonly base_tool?: string;
  readonly description?: string;
  readonly fixed_kwargs?: Record<string, unknown>;
  readonly extensions?: readonly s.PresetExtensionElement[][];
  readonly output_schema?: Record<string, unknown> | null;
  readonly input_schema?: Record<string, unknown> | null;
  // The optional door-layer state binding to dry-run — validated (never mounted) by the
  // same checks the write would run. In VERSION mode it follows the save-version sentinel:
  // omitted carries the active binding forward, an explicit `null` clears it.
  readonly state_binding?: s.StateBinding | null;
}

export function presetsClient(t: Transport) {
  const { req } = t;
  return {
    // Every preset is store-backed and versioned; the list is the single
    // management population (the presets plus the conflicted quarantined rows).
    listPresets: (signal?: AbortSignal) => req('/api/presets', s.presetList, { signal }),
    createPreset: (body: CreatePresetBody) =>
      req('/api/presets', s.presetRecord, { method: 'POST', body }),
    getPreset: (name: string, signal?: AbortSignal) =>
      req(`/api/presets/${encodeSegment(name)}`, s.presetDetail, { signal }),
    listPresetVersions: (name: string, signal?: AbortSignal) =>
      req(`/api/presets/${encodeSegment(name)}/versions`, s.presetVersionList, { signal }),
    getPresetVersion: (name: string, version: number, signal?: AbortSignal) =>
      req(
        `/api/presets/${encodeSegment(name)}/versions/${encodeSegment(version)}`,
        s.presetVersion,
        { signal },
      ),
    savePresetVersion: (name: string, body: SavePresetVersionBody) =>
      req(`/api/presets/${encodeSegment(name)}/versions`, s.presetVersion, {
        method: 'POST',
        body,
      }),
    rollbackPreset: (name: string, version: number) =>
      req(`/api/presets/${encodeSegment(name)}/rollback`, s.presetRollback, {
        method: 'POST',
        body: { version },
      }),
    deletePreset: (name: string) =>
      req(`/api/presets/${encodeSegment(name)}`, s.presetDeleted, { method: 'DELETE' }),
    renamePreset: (name: string, newName: string) =>
      req(`/api/presets/${encodeSegment(name)}/rename`, s.presetRenamed, {
        method: 'POST',
        body: { new_name: newName },
      }),
    // The presets whose active composition names this one as a tool — the referees
    // a rename would strand. A rename preflight reads this to warn before the 409.
    getPresetReferees: (name: string, signal?: AbortSignal) =>
      req(`/api/presets/${encodeSegment(name)}/referees`, s.presetReferees, { signal }),
    // The dry-run verdict for a draft (create OR version, mode-resolved server-side):
    // `valid` plus the server's verbatim `error` message. Both verdicts are HTTP 200.
    validatePreset: (body: ValidatePresetBody) =>
      req('/api/presets/validate', s.presetValidation, { method: 'POST', body }),
    // Replace one version's `tags` annotation — labels on an immutable body, so no
    // rebind. Returns the re-annotated identity + new tag list.
    setPresetVersionTags: (name: string, version: number, tags: readonly string[]) =>
      req(
        `/api/presets/${encodeSegment(name)}/versions/${encodeSegment(version)}/tags`,
        s.presetVersionTags,
        { method: 'PUT', body: { tags } },
      ),
  };
}
