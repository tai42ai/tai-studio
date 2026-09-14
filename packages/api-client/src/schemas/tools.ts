/** Tool catalog, run-result and per-tool tag response schemas. */
import { z } from 'zod';
import { jsonSchema, jsonValue } from './shared';

export const toolNames = z.array(z.string());

export const toolSchema = z.object({
  input: jsonSchema,
  output: jsonSchema.nullable(),
  description: z.string().nullable(),
});
export type ToolSchema = z.infer<typeof toolSchema>;

export const allToolSchemas = z.record(z.string(), toolSchema);

export const runToolResult = jsonValue;

/**
 * The MEDIA content shape a direct tool run may return — fastmcp's serialized
 * `Image`/`Audio` MediaBlock (`{ type, data: <base64>, mimeType }`). One recognised
 * shape of the otherwise-arbitrary `runToolResult`, kept as its own schema so the
 * viewer detects media by parse, not by ad-hoc shape check.
 *
 * SECURITY: the refinement pins `mimeType` to its kind — `image` MUST be `image/*`,
 * `audio` MUST be `audio/*` — so a drifting/arbitrary mime fails the parse and is
 * never turned into a `data:` URI (a `File` MediaBlock's distinct `EmbeddedResource`
 * shape also fails here, by design).
 */
export const toolMediaResult = z
  .object({
    type: z.enum(['image', 'audio']),
    data: z.string(),
    mimeType: z.string(),
  })
  .refine((media) => media.mimeType.startsWith(`${media.type}/`), {
    message: 'media mimeType must match its media kind (image/* for image, audio/* for audio)',
    path: ['mimeType'],
  });
export type ToolMediaResult = z.infer<typeof toolMediaResult>;

/**
 * The ADDITIVE per-tool native surface (`GET /api/tools/tags`). Distinct from the
 * flat `toolNames` contract (`GET /api/tools`, unchanged): each entry carries the
 * tool's read-only FastMCP `tags` — so the shared `ToolPicker` can group/filter its
 * options — plus `hidden`, the tool's OWN plugin-declared visibility (read from the
 * FastMCP `meta` under `tai42/hidden`; a tool that never declared it is not hidden).
 * The tool_meta overlay's tri-state override is merged on top client-side; this read
 * exposes only the declaration.
 *
 * `badges` are the tool's plugin-DECLARED capability labels — purely INFORMATIONAL
 * (e.g. `network`, `filesystem`), never a gate the server enforces. The overlay's
 * own badges are merged on top client-side; this read exposes only the declaration.
 */
export const toolTagEntry = z.object({
  name: z.string(),
  tags: z.array(z.string()),
  badges: z.array(z.string()),
  hidden: z.boolean(),
});
export const toolTags = z.array(toolTagEntry);
export type ToolTagEntry = z.infer<typeof toolTagEntry>;
