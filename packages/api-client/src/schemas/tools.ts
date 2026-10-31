/** Tool catalog, run-result and per-tool tag response schemas. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

export const toolNames = openapi.stringListResponse;

export const toolSchema = openapi.toolSchemaView;
export type ToolSchema = z.infer<typeof toolSchema>;

export const allToolSchemas = openapi.toolsSchemaMap;

/**
 * What a synchronous run answers, by `kind`: `result` (the tool's own value in `result`),
 * `asks` (the tool asked its CALLER and parked: the caller asks and the suspension), `parked`
 * (only user asks remain: the suspension) or `none` (nothing ran).
 */
export const runAnswer = openapi.runAnswerResponse;
export type RunAnswer = z.infer<typeof runAnswer>;

export const runToolResult = runAnswer;

/** The lifecycle status a parked interaction on a run's subject carries: a pending ask, an
 * ask whose continuation is resuming, or a resolved run's waiting outcome (clean/failed). */
export const parkedStatus = openapi.parkedEntry.shape.status;
export type ParkedStatus = z.infer<typeof parkedStatus>;

/**
 * One parked caller-ask entry a synchronous run-tool call returns when the tool asked its
 * CALLER (`to="caller"`) and parked. `question` is the prompt, `payload` the structured
 * value the ask handed the caller, `asked_by` the run chain that raised it.
 */
export const parkedCallerAsk = openapi.parkedEntry;
export type ParkedCallerAsk = z.infer<typeof parkedCallerAsk>;

// Hand-written: a `resume_parked` / `cancel_parked` tool's own result, opaque to the spec.
/** What one resume / take / cancel of a parked interaction did, as `resume_parked` /
 * `cancel_parked` return it through run-tool. `kind` picks the payload: `result` (a final
 * value in `result`), `asks` (new caller asks in `asks`), `parked` (only user asks remain),
 * or `none` (nothing ran). `action` names the single non-cancel action taken. */
export const visitOutcome = z.object({
  action: z.enum(['resumed', 'taken', 'started', 'none']),
  cancelled: z.array(z.string()).default([]),
  kind: z.enum(['result', 'asks', 'parked', 'none']),
  result: z.unknown().optional(),
  asks: z.array(parkedCallerAsk).default([]),
});
export type VisitOutcome = z.infer<typeof visitOutcome>;

// Hand-written: a third-party media block inside a tool's own result, opaque to the spec.
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
 * `schedulable` is whether the tool can be scheduled. `description` is the tool's own
 * declared description, `null` when it declares none; tool pickers draw it under the
 * tool's option and search it with the tool's label.
 */
export const toolTagEntry = openapi.toolTagRow;
export const toolTags = openapi.toolTagListResponse;
export type ToolTagEntry = z.infer<typeof toolTagEntry>;
