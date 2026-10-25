/**
 * The pure create-preset body shaping: the base tool's declared input field names
 * (for the kwargs hint) and the flat `CreatePresetBody` assembled from a validated
 * draft. Extensions, the input and output schemas, the input and output maps and the
 * state binding are OMITTED when unset — the route rejects an explicit `extensions: []`
 * and carries no schema, map or binding by default.
 */
import type {
  CreatePresetBody,
  PresetExtensionElement,
  StateBinding,
  TemplatedText,
} from '@tai42/api-client';
import type { JsonSchema } from '@tai42/studio-sdk';

/** The base tool's declared input field names, for the read-only kwargs hint. */
export function inputFieldNames(input: Record<string, unknown> | undefined): string[] {
  const properties = input?.properties;
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) return [];
  return Object.keys(properties);
}

/** A validated create draft: `fixedKwargs` is the already-parsed JSON object. */
export interface PresetBodyDraft {
  readonly name: string;
  readonly base: string | null;
  readonly description: string;
  readonly fixedKwargs: Record<string, unknown>;
  readonly combos: PresetExtensionElement[][];
  readonly inputSchema: JsonSchema | null;
  readonly inputMap: TemplatedText | null;
  readonly outputSchema: JsonSchema | null;
  readonly outputMap: TemplatedText | null;
  readonly stateBinding: StateBinding | null;
}

/** Assemble the flat create body from a validated draft (kwargs already parsed). */
export function buildCreatePresetBody(draft: PresetBodyDraft): CreatePresetBody {
  return {
    name: draft.name.trim(),
    base_tool: draft.base ?? '',
    description: draft.description.trim(),
    fixed_kwargs: draft.fixedKwargs,
    // OMIT extensions entirely when there are no combos — the route rejects `[]`.
    ...(draft.combos.length > 0 ? { extensions: draft.combos } : {}),
    // OMIT each schema and map unless the author set it.
    ...(draft.inputSchema !== null ? { input_schema: draft.inputSchema } : {}),
    ...(draft.inputMap !== null ? { input_map: draft.inputMap } : {}),
    ...(draft.outputSchema !== null ? { output_schema: draft.outputSchema } : {}),
    ...(draft.outputMap !== null ? { output_map: draft.outputMap } : {}),
    // OMIT state_binding unless the author bound a state.
    ...(draft.stateBinding !== null ? { state_binding: draft.stateBinding } : {}),
  };
}
