/**
 * The tool-picker data source for the add-schedule dialog: the tools the server serves as
 * `schedulable`, plus the tags/meta enrichment that drives the hidden-tool exclusion, the
 * badge map and the description map. The server marks a tool schedulable when its schedule
 * vehicle is registered, so the picker never offers a tool the create door cannot schedule.
 */
import type { ToolTagEntry } from '@tai42/api-client';
import {
  hiddenToolNames,
  toolBadgesByName,
  toolDescriptionsByName,
  toolMetaKey,
  useApi,
  useToolDisplayNames,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { scheduleToolTagsKey } from './keys';

/** The tools the picker offers: the tag rows the server serves as `schedulable`, in order. */
export function pickableToolNames(rows: readonly ToolTagEntry[]): string[] {
  return rows.filter((row) => row.schedulable).map((row) => row.name);
}

/** Schedulable tools + the enrichment the picker renders. `toolsQuery` observes the tags
 *  read projected to the schedulable names (the picker's source); the unprojected tags read
 *  feeds the hidden names, badges and descriptions. The hidden names and badges stay empty
 *  on a failed meta read (the server is the authority over runs). */
export function useScheduleTools() {
  const api = useApi();
  const displayNames = useToolDisplayNames();

  const tagsQuery = useQuery({ queryKey: scheduleToolTagsKey, queryFn: () => api.listToolTags() });
  const metaQuery = useQuery({ queryKey: toolMetaKey, queryFn: () => api.listToolMeta() });

  const toolsQuery = useQuery({
    queryKey: scheduleToolTagsKey,
    queryFn: () => api.listToolTags(),
    select: pickableToolNames,
  });

  const hiddenNames = useMemo(
    () => hiddenToolNames(tagsQuery.data ?? [], metaQuery.data?.meta ?? []),
    [tagsQuery.data, metaQuery.data],
  );
  const excludeToolNames = useMemo(() => [...hiddenNames], [hiddenNames]);

  const badgesByTool = useMemo(
    () => toolBadgesByName(tagsQuery.data ?? [], metaQuery.data?.meta ?? []),
    [tagsQuery.data, metaQuery.data],
  );

  const toolDescriptions = useMemo(
    () => toolDescriptionsByName(tagsQuery.data ?? []),
    [tagsQuery.data],
  );

  return { toolsQuery, excludeToolNames, badgesByTool, toolDescriptions, displayNames };
}
