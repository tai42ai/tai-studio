/**
 * The paginated runs read behind the tracing table: an infinite query over
 * `listRuns(params)` keyed on the sanitized search, plus the flattened item list.
 */
import {
  useInfiniteQuery,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from '@tanstack/react-query';
import { useApi } from '@tai42/studio-sdk';
import type { ApiClient, Run } from '@tai42/api-client';

import { runsParams, type ObservabilitySearch } from './filters';
import { runsKey } from './keys';

type RunPage = Awaited<ReturnType<ApiClient['listRuns']>>;

export interface RunsQuery {
  readonly query: UseInfiniteQueryResult<InfiniteData<RunPage>>;
  readonly items: Run[];
  readonly params: ReturnType<typeof runsParams>;
}

export function useRunsQuery(search: ObservabilitySearch): RunsQuery {
  const api = useApi();
  const params = runsParams(search);
  const query = useInfiniteQuery({
    queryKey: runsKey(params),
    queryFn: ({ pageParam, signal }) => api.listRuns({ ...params, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => last.nextPage ?? undefined,
  });
  const items: Run[] = query.data?.pages.flatMap((page) => page.items) ?? [];
  return { query, items, params };
}
