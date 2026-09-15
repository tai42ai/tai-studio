/**
 * Tracing tab — a filterable, sortable, paginated runs table ({@link RunsTable}) over
 * `listRuns(filters)`. The filter set, sort key/direction, and the drilled-in trace id
 * all live in the URL, so a view is linkable. A metric-sort×filter combo can only reach
 * here from a shared or hand-edited link; it is repaired to a legal query and written
 * back to the URL — the source of truth — before any read. Drilling into a trace shows
 * the per-run {@link TraceView}.
 */
import { useAppNavigate } from '@tai42/studio-sdk';
import { type ReactNode, useEffect } from 'react';

import { mergeSearch, type ObservabilitySearch, sanitizeSearch } from './filters';
import { RunsTable } from './RunsTable';
import { TraceView } from './TraceView';

export function TracingTab({ search }: { readonly search: ObservabilitySearch }): ReactNode {
  const navigate = useAppNavigate();
  const cleaned = sanitizeSearch(search);
  const repaired = cleaned !== search;

  // `sanitizeSearch` returns the same reference when nothing needs repair, so this
  // fires at most once and only for an illegal combo arriving from the URL.
  useEffect(() => {
    if (repaired) navigate('observability', cleaned);
  }, [repaired, cleaned, navigate]);

  if (cleaned.trace !== undefined) {
    return (
      <TraceView
        traceId={cleaned.trace}
        onBack={() => {
          navigate('observability', mergeSearch(cleaned, { trace: undefined }));
        }}
      />
    );
  }

  return <RunsTable search={cleaned} />;
}
