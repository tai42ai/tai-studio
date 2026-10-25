/** Prompt-template listing, render and mutation ack schemas. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

export const templateNames = openapi.stringListResponse;
/**
 * `POST /api/template` — one stored template entry. A `text` entry carries its content
 * and either its declared `schema` or the `schema_error` that kept it from compiling;
 * `document` and `binary` entries carry no schema. A text entry with both or neither of
 * `schema` and `schema_error` is refused.
 */
export const templateEntry = openapi.templateEntry.superRefine((entry, ctx) => {
  if (entry.kind === 'text' && (entry.schema === null) === (entry.schema_error === null)) {
    ctx.addIssue({
      code: 'custom',
      message: "a text template entry carries exactly one of 'schema' and 'schema_error'",
    });
  }
});
export type TemplateEntry = z.infer<typeof templateEntry>;
export const templateUploaded = openapi.templateUploadResult;
export const templateDeleted = openapi.templateDeleteResult;
export const templateDirDeleted = openapi.templateDeleteResult;
export const templateRendered = openapi.renderedTemplate;
export const templateCacheCleared = openapi.cacheClearResult;
