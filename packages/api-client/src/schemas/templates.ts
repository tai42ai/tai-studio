/** Prompt-template listing, render and mutation ack schemas. */
import { z } from 'zod';

import { jsonSchema } from './shared';

export const templateNames = z.array(z.string());
export const templateDetail = z.object({ template: z.string(), schema: jsonSchema });
export const templateUploaded = z.object({ path: z.string(), uploaded: z.literal(true) });
export const templateDeleted = z.object({ path: z.string(), deleted: z.literal(true) });
export const templateDirDeleted = z.object({ path: z.string(), deleted: z.literal(true) });
export const templateRendered = z.object({ rendered: z.string() });
export const templateCacheCleared = z.object({ cleared: z.literal(true) });
