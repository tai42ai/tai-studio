/** Schedule listing and server-clock response schemas. */
import { z } from 'zod';
import { jsonValue } from './shared';

// The skeleton returns opaque backend-tool results; the table reads a few known
// fields and passes the rest through untouched.

export const scheduleItem = z
  .object({
    name: z.string(),
    enabled: z.boolean().optional(),
    schedule: jsonValue.optional(),
    target: jsonValue.optional(),
    args: z.array(jsonValue).optional(),
    kwargs: z.record(z.string(), jsonValue).optional(),
  })
  .loose();
export const scheduleList = z.array(scheduleItem);
export type ScheduleItem = z.infer<typeof scheduleItem>;

export const serverDateTime = z
  .object({
    utc: jsonValue,
    local: jsonValue.optional(),
    system: jsonValue.optional(),
  })
  .loose();
