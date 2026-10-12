/** Extension element/combo and per-tool extension response schemas. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

export const extension = openapi.extensionView;
export const extensions = openapi.extensionListing;
export type Extension = z.infer<typeof extension>;

// Hand-written: the spec publishes a config-bearing element as an open object; the client
// reads its `{ name, config }` form.
/**
 * One element of an extension combo: a bare extension NAME, or a
 * `{ name, config }` mapping binding author config (e.g. an `output_schema` JSON
 * Schema, or an `ask_external` verifier). Both wire forms are admitted so a
 * config-bearing combo parses without dropping server data. A drift throws
 * `ApiSchemaError`.
 */
export const presetExtensionElement = z.union([
  z.string(),
  z.object({ name: z.string(), config: z.record(z.string(), z.unknown()) }),
]);
export type PresetExtensionElement = z.infer<typeof presetExtensionElement>;

/**
 * `GET /api/tools/{name}/extensions` — a tool's FULL lossless list-of-combos plus
 * the extension catalog. `combos` is a list of combos, each an ordered list of
 * extension ELEMENTS (a bare name or a config-bearing `{ name, config }` mapping —
 * `output_schema` carries its schema this way); `[]` when the tool has no map entry.
 * It carries EVERY combo mapped to the base tool (the union across every `tools`/`mcp`
 * config), never a single flattened one. `available` is the same flat catalog
 * `GET /api/extensions` returns. A drift throws `ApiSchemaError`.
 */
export const toolExtensions = openapi.toolExtensionsView.extend({
  combos: z.array(z.array(presetExtensionElement)),
});
export type ToolExtensions = z.infer<typeof toolExtensions>;
