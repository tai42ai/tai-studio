/**
 * TanStack Query key factory for the scheduling surface. The schedule list is
 * keyed `['schedules', 'list']`; the server clock is keyed
 * `['schedules', 'server-datetime']`; the available tool names (feeding the add
 * dialog's picker) are keyed `['schedules', 'tools']`. The list key is a sibling
 * of — never a prefix of — the clock/tools keys, so invalidating the list after
 * an add/delete does not also refetch the clock or the tool list. Centralising the
 * keys keeps the query definitions and the post-mutation invalidations referring
 * to the exact same tuples.
 */

/** Key for the schedule list. */
export const schedulesKey = ['schedules', 'list'] as const;

/** Key for the server clock reading shown so users can reason about cron timing. */
export const serverDateTimeKey = ['schedules', 'server-datetime'] as const;

/** Key for the tool-name list feeding the add dialog's `ToolPicker`. */
export const scheduleToolsKey = ['schedules', 'tools'] as const;

/** Native tool tags + plugin-declared visibility, for the picker's hidden exclusion. */
export const scheduleToolTagsKey = ['schedules', 'tool-tags'] as const;

/** The tool_meta overlay, for the picker's effective-hidden exclusion. */
export const scheduleToolMetaKey = ['schedules', 'tool-meta'] as const;
