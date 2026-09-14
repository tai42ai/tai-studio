/** Shared primitive schemas (json value/schema) and the paged-window fields. */
import { z } from 'zod';

/** An arbitrary JSON value (tool results, rendered payloads). */
export const jsonValue: z.ZodType = z.unknown();

/** A JSON Schema object (Pydantic-emitted). Permissive; parsed by the auto-form. */
export const jsonSchema = z.record(z.string(), z.unknown());
/**
 * The page window every paged read door carries; `next_page` is null on the last
 * page. `truncated` is TRUE when the door had more matches than it would scan or
 * return under its cap — the UI must surface that LOUDLY, never a silent cut — and
 * false whenever the window is exhaustive.
 */
export const pageWindow = {
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  next_page: z.number().nullable(),
  truncated: z.boolean(),
};
