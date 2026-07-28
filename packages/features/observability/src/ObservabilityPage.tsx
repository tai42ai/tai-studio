/**
 * Observability dashboard — the largest feature surface. Two URL-driven tabs
 * (`dashboard` stats + `tracing` runs/trace) over the monitoring READ contract.
 * The full filter set, the active tab, and the drilled-in trace id all live in
 * the route search params: they are read from `props.search` and written back
 * through the shell's `navigate` (features never touch a router directly), which
 * keeps every view linkable/refreshable and lets the filter set survive the
 * stats→tracing drill-through. Loading, empty, and (loud) error states follow the
 * shared UI conventions; the monitoring "read not supported" 501 gets its own
 * dedicated state, rendered by each tab.
 */
import type { ReactNode } from 'react';
import { PageHeader, Tabs, useAppNavigate, type PageProps } from '@tai42/studio-sdk';

import { activeTab, mergeSearch, type TabId } from './filters';
import { StatsTab } from './StatsTab';
import { TracingTab } from './TracingTab';

export function ObservabilityPage({ search }: PageProps<'observability'>): ReactNode {
  const navigate = useAppNavigate();
  const current = activeTab(search);

  return (
    <div data-testid="observability-page" className="tai-stack tai-stack-6">
      <PageHeader eyebrow="Observability" title="Dashboard" />

      <Tabs
        value={current}
        onValueChange={(value) => {
          navigate('observability', mergeSearch(search, { tab: value as TabId }));
        }}
        items={[
          { value: 'dashboard', label: 'Dashboard', content: <StatsTab search={search} /> },
          { value: 'tracing', label: 'Tracing', content: <TracingTab search={search} /> },
        ]}
      />
    </div>
  );
}
