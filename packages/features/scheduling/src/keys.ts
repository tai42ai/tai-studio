/**
 * TanStack Query key factory for the scheduling surface. The schedule list is
 * keyed `['schedules', 'list']`; the server clock is keyed
 * `['schedules', 'server-datetime']`; the tool tags (whose `schedulable` rows feed
 * the add dialog's picker) are keyed `['schedules', 'tool-tags']`. The list key is a
 * sibling of — never a prefix of — the clock/tags keys, so invalidating the list
 * after an add/delete does not also refetch the clock or the tool tags. Centralising the
 * keys keeps the query definitions and the post-mutation invalidations referring
 * to the exact same tuples.
 */

/** Key for the schedule list. */
export const schedulesKey = ['schedules', 'list'] as const;

/** Key for the server clock reading shown so users can reason about cron timing. */
export const serverDateTimeKey = ['schedules', 'server-datetime'] as const;

/** Native tool tags, visibility and `schedulable`: the add dialog's `ToolPicker` source. */
export const scheduleToolTagsKey = ['schedules', 'tool-tags'] as const;
