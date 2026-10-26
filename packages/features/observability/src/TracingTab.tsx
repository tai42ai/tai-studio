/**
 * Tracing tab — a filterable, sortable, paginated runs table ({@link RunsTable}) over
 * `listRuns(filters)`. The filter set, sort key/direction, and the drilled-in trace id
 * all live in the URL, so a view is linkable. The sorts and sort × filter combinations
 * the monitoring backend serves come from its served capabilities; a link the backend
 * does not serve is shown as it is, with the not-served notice in the result area.
 * Drilling into a trace shows the per-run {@link TraceView}.
 */
import { useAppNavigate } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { mergeSearch, type ObservabilitySearch } from './filters';
import { RunsTable } from './RunsTable';
import { TraceView } from './TraceView';
import { useObservabilityCapabilities } from './useObservabilityCapabilities';

export function TracingTab({ search }: { readonly search: ObservabilitySearch }): ReactNode {
  const navigate = useAppNavigate();
  const capabilities = useObservabilityCapabilities();

  if (search.trace !== undefined) {
    return (
      <TraceView
        traceId={search.trace}
        onBack={() => {
          navigate('observability', mergeSearch(search, { trace: undefined }));
        }}
      />
    );
  }

  return <RunsTable search={search} capabilities={capabilities} />;
}
