/**
 * Presets page — a master/detail surface over the single-tier presets API. The
 * left pane is the presets table (`PresetsList`); selecting a row sets `?preset=`
 * (shell-owned routing via `AppLink`), which drives the right-pane detail
 * (`PresetDetail`: record, active baked kwargs, version history, save-version,
 * rollback, delete). Mirrors the tools page's `?tool=` master/detail shape.
 */
import type { ReactNode } from 'react';
import {
  AppLink,
  ArrowLeftIcon,
  Card,
  EmptyState,
  PageHeader,
  useBreakpoint,
  type PageProps,
} from '@tai42/studio-sdk';

import { PresetsList } from './PresetsList';
import { PresetDetail } from './PresetDetail';

export function PresetsPage({ search }: PageProps<'presets'>): ReactNode {
  const selected = search.preset;
  const { isSinglePane } = useBreakpoint();
  // Below 1024 the split collapses to one pane; the detail shows when a preset is
  // selected, otherwise the list.
  const pane = selected !== undefined ? 'detail' : 'list';

  return (
    <div className="tai-stack tai-stack-6" data-testid="presets-page">
      <PageHeader
        title="Presets"
        eyebrow="Capabilities"
        description="Named, versioned tool presets — a base tool with fixed kwargs baked in."
      />

      <div className="tai-split" data-pane={isSinglePane ? pane : undefined}>
        <div className="tai-split-list">
          <PresetsList selected={selected} />
        </div>

        <div className="tai-split-detail">
          {isSinglePane && selected !== undefined ? (
            <AppLink to="presets" search={{}} className="tai-btn tai-btn-ghost">
              <ArrowLeftIcon />
              Back
            </AppLink>
          ) : null}
          {selected !== undefined ? (
            <PresetDetail key={selected} name={selected} />
          ) : (
            <Card>
              <EmptyState
                title="No preset selected"
                description="Choose a preset from the list to view its versions and manage it."
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
