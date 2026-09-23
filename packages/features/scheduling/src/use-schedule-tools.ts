/**
 * The tool-picker data source for the add-schedule dialog: the SCHEDULABLE base
 * tools plus the tags/meta enrichment that drives the hidden-tool exclusion and the
 * badge map. A base tool is schedulable only when its schedule vehicle is registered
 * (see `pickableToolNames`), so the picker never offers a tool the create door has no
 * recurring branch for, nor the vehicle rows themselves.
 */
import { hiddenToolNames, toolBadgesByName, useApi, useToolDisplayNames } from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { scheduleToolMetaKey, scheduleToolsKey, scheduleToolTagsKey } from './keys';
import { SCHEDULE_BRANCH_SUFFIX, scheduleVehicle } from './schedule-form';

/**
 * The base tools the picker offers, derived from the tools list alone. A base tool
 * `t` is schedulable exactly when its `${t}_schedule_task` vehicle is in the list —
 * the backend registers that vehicle for precisely the tools carrying the
 * `schedule_task` extension. Every `*_schedule_task` vehicle row is dropped: it is
 * the dispatch target the create door names from the picked base tool, never a
 * pickable tool in its own right.
 */
export function pickableToolNames(toolNames: readonly string[]): string[] {
  const present = new Set(toolNames);
  return toolNames.filter(
    (name) => !name.endsWith(SCHEDULE_BRANCH_SUFFIX) && present.has(scheduleVehicle(name)),
  );
}

/** Schedulable tools + the enrichment the picker renders. `excludeToolNames`/`badgesByTool`
 *  stay empty on a failed tags/meta read (the server is the authority over runs). */
export function useScheduleTools() {
  const api = useApi();
  const displayNames = useToolDisplayNames();

  const toolsQuery = useQuery({ queryKey: scheduleToolsKey, queryFn: () => api.listTools() });
  const tagsQuery = useQuery({ queryKey: scheduleToolTagsKey, queryFn: () => api.listToolTags() });
  const metaQuery = useQuery({ queryKey: scheduleToolMetaKey, queryFn: () => api.listToolMeta() });

  const toolNames = useMemo(() => pickableToolNames(toolsQuery.data ?? []), [toolsQuery.data]);

  const hiddenNames = useMemo(
    () => hiddenToolNames(tagsQuery.data ?? [], metaQuery.data?.meta ?? []),
    [tagsQuery.data, metaQuery.data],
  );
  const excludeToolNames = useMemo(() => [...hiddenNames], [hiddenNames]);

  const badgesByTool = useMemo(
    () => toolBadgesByName(tagsQuery.data ?? [], metaQuery.data?.meta ?? []),
    [tagsQuery.data, metaQuery.data],
  );

  return { toolsQuery, toolNames, excludeToolNames, badgesByTool, displayNames };
}
