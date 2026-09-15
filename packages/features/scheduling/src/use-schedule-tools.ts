/**
 * The tool-picker data source for the add-schedule dialog: the tools list plus the
 * tags/meta enrichment that drives the hidden-tool exclusion and the badge map.
 */
import { hiddenToolNames, toolBadgesByName, useApi, useToolDisplayNames } from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { scheduleToolMetaKey, scheduleToolsKey, scheduleToolTagsKey } from './keys';

/** Tools list + the enrichment the picker renders. `excludeToolNames`/`badgesByTool`
 *  stay empty on a failed tags/meta read (the server is the authority over runs). */
export function useScheduleTools() {
  const api = useApi();
  const displayNames = useToolDisplayNames();

  const toolsQuery = useQuery({ queryKey: scheduleToolsKey, queryFn: () => api.listTools() });
  const tagsQuery = useQuery({ queryKey: scheduleToolTagsKey, queryFn: () => api.listToolTags() });
  const metaQuery = useQuery({ queryKey: scheduleToolMetaKey, queryFn: () => api.listToolMeta() });

  const hiddenNames = useMemo(
    () => hiddenToolNames(tagsQuery.data ?? [], metaQuery.data?.meta ?? []),
    [tagsQuery.data, metaQuery.data],
  );
  const excludeToolNames = useMemo(() => [...hiddenNames], [hiddenNames]);

  const badgesByTool = useMemo(
    () => toolBadgesByName(tagsQuery.data ?? [], metaQuery.data?.meta ?? []),
    [tagsQuery.data, metaQuery.data],
  );

  return { toolsQuery, excludeToolNames, badgesByTool, displayNames };
}
