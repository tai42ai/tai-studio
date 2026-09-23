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

/** The lifecycle status a parked interaction on a run's subject carries: a pending ask, an
 * ask whose continuation is resuming, or a resolved run's waiting outcome (clean/failed). */
export const parkedStatus = z.enum(['asking', 'running', 'finished', 'failed']);
export type ParkedStatus = z.infer<typeof parkedStatus>;

/**
 * One parked caller-ask entry a synchronous run-tool call returns when the tool asked its
 * CALLER (`to="caller"`) and parked. The full contract entry carries more fields; the panel
 * reads the display subset here and tolerates the rest. `question` is the prompt, `payload`
 * the structured value the ask handed the caller, `asked_by` the run chain that raised it.
 */
export const parkedCallerAsk = z.object({
  id: z.string(),
  status: parkedStatus,
  to: z.enum(['user', 'caller']).nullish(),
  question: z.string().nullish(),
  payload: z.record(z.string(), z.unknown()).nullish(),
  asked_by: z.array(z.string()).nullish(),
});
export type ParkedCallerAsk = z.infer<typeof parkedCallerAsk>;

/** A synchronous run whose tool parked CALLER asks returns this envelope in place of a result:
 * the full caller-ask entries under `asks`. An empty `asks` means the run parked with no open
 * caller ask (only user asks remain). */
export const callerAsksEnvelope = z.object({
  asks: z.array(parkedCallerAsk),
});
export type CallerAsksEnvelope = z.infer<typeof callerAsksEnvelope>;

/** The park receipt a synchronous run returns when its tool parked only USER asks: the
 * suspension sentinel's ids, with no caller ask for the panel to act on. */
export const suspendedRunReceipt = z.object({
  interaction_id: z.string(),
  interaction_ids: z.array(z.string()),
  caller_interaction_ids: z.array(z.string()).default([]),
});
export type SuspendedRunReceipt = z.infer<typeof suspendedRunReceipt>;

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
